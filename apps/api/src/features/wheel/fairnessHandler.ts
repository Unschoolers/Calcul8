import { type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import {
  createWheelFairnessProof,
  getWheelFairnessProof
} from "../../lib/cosmos/wheelFairnessProofRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import type { ApiConfig } from "../../types";
import {
  getQueryParam,
  parseClientSeed,
  parseLayoutHash,
  parseProofCreationRequest,
  parseSeed,
  parseSlotCount,
  parseStoredProofRequest,
  parseVerificationProofQueryRequest,
  requireBodyRecord,
  type WheelFairnessProofRequest
} from "./fairnessParser";
import {
  buildWheelFairnessHtmlPage,
  htmlResponse
} from "./fairnessRenderer";
import {
  WHEEL_FAIRNESS_ALGORITHM,
  WHEEL_FAIRNESS_COMMIT_TTL_MS,
  deriveFairResult,
  hashSeed
} from "./fairnessVerifier";
import {
  buildStoredProofVerificationUrl,
  buildVerificationJsonUrl,
  buildVerificationUrl
} from "./fairnessUrls";
import {
  decryptCommitToken,
  encryptCommitToken,
  generateServerSeed,
  type WheelCommitTokenPayload
} from "./fairnessToken";

async function resolveVerificationProofRequest(
  request: HttpRequest,
  config: ApiConfig
): Promise<WheelFairnessProofRequest> {
  const proofId = String(getQueryParam(request, "proofId") ?? "").trim();
  if (proofId) {
    return await getStoredProofRequest(config, proofId);
  }

  return parseVerificationProofQueryRequest(request);
}

async function getStoredProofRequest(
  config: ApiConfig,
  proofId: string
): Promise<WheelFairnessProofRequest> {
  const proof = await getWheelFairnessProof(config, proofId);
  if (!proof) {
    throw new HttpError(404, "Wheel fairness proof not found.");
  }

  return parseStoredProofRequest(proof);
}

async function readRequestJsonOrThrow(request: HttpRequest): Promise<unknown> {
  if (typeof request.json !== "function") {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export async function wheelFairnessCommit(
  request: HttpRequest
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, null, {
    errorLogMessage: "Failed to create wheel fairness commit.",
    fallbackErrorMessage: "Failed to create wheel fairness commit.",
    operation: async ({ config }) => {
    const body = requireBodyRecord(await readRequestJsonOrThrow(request));
    const slotCount = parseSlotCount(body.slotCount);
    const layoutHash = parseLayoutHash(body.layoutHash);
    const committedAt = Date.now();
    const payload: WheelCommitTokenPayload = {
      version: "v1",
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      serverSeed: generateServerSeed(),
      serverSeedHash: "",
      layoutHash,
      slotCount,
      committedAt,
      expiresAt: committedAt + WHEEL_FAIRNESS_COMMIT_TTL_MS
    };
    payload.serverSeedHash = hashSeed(payload.serverSeed);

    return jsonResponse(request, config, 200, {
      commitToken: encryptCommitToken(config, payload),
      serverSeedHash: payload.serverSeedHash,
      layoutHash: payload.layoutHash,
      slotCount: payload.slotCount,
      algorithm: payload.algorithm,
      committedAt: payload.committedAt,
      expiresAt: payload.expiresAt
    });
    }
  });
}

export async function wheelFairnessReveal(
  request: HttpRequest
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, null, {
    errorLogMessage: "Failed to reveal wheel fairness result.",
    fallbackErrorMessage: "Failed to reveal wheel fairness result.",
    operation: async ({ config }) => {
    const body = requireBodyRecord(await readRequestJsonOrThrow(request));
    const commitToken = String(body.commitToken ?? "").trim();
    if (!commitToken) {
      throw new HttpError(400, "Field 'commitToken' is required.");
    }
    const clientSeed = parseClientSeed(body.clientSeed);
    const payload = decryptCommitToken(config, commitToken);
    if (Date.now() > payload.expiresAt) {
      throw new HttpError(410, "Wheel fairness commit expired. Create a new spin.");
    }

    const { resultIndex } = deriveFairResult(payload.serverSeed, clientSeed, payload.slotCount);

    return jsonResponse(request, config, 200, {
      serverSeedHash: payload.serverSeedHash,
      serverSeed: payload.serverSeed,
      clientSeed,
      layoutHash: payload.layoutHash,
      resultIndex,
      slotCount: payload.slotCount,
      algorithm: payload.algorithm,
      committedAt: payload.committedAt,
      revealedAt: Date.now(),
      verificationUrl: buildVerificationUrl(request, payload.serverSeed, clientSeed, payload.slotCount, payload.layoutHash)
    });
    }
  });
}

export async function wheelFairnessVerify(
  request: HttpRequest
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, null, {
    errorLogMessage: "Failed to verify wheel fairness proof.",
    fallbackErrorMessage: "Failed to verify wheel fairness proof.",
    operation: async ({ config }) => {
    const {
      serverSeed,
      clientSeed,
      slotCount,
      layoutHash,
      layoutSlots,
      layoutError,
      slotLabel,
      wheelName,
      spinNumber
    } = await resolveVerificationProofRequest(request, config);
    const { resultIndex, proofHash } = deriveFairResult(serverSeed, clientSeed, slotCount);
    const resultSlotNumber = resultIndex + 1;

    const resultText = slotLabel
      ? `${slotLabel} (slot ${resultSlotNumber} of ${slotCount})`
      : `slot ${resultSlotNumber} of ${slotCount}`;
    const summaryTitle = wheelName
      ? `Wheel fairness verified for ${wheelName}`
      : "Wheel fairness verified";
    const summary = spinNumber != null
      ? `Spin #${spinNumber} verified fairly: ${resultText}.`
      : `Verified fair result: ${resultText}.`;

    const format = String(getQueryParam(request, "format") ?? "").trim().toLowerCase();
    if (format === "html") {
      return htmlResponse(200, buildWheelFairnessHtmlPage({
        summaryTitle,
        summary,
        wheelName,
        slotLabel,
        spinNumber,
        resultSlotNumber,
        slotCount,
        serverSeedHash: hashSeed(serverSeed),
        layoutHash,
        layoutSlots,
        layoutError,
        clientSeed,
        serverSeed,
        proofHash,
        algorithm: WHEEL_FAIRNESS_ALGORITHM,
        jsonUrl: buildVerificationJsonUrl(request, serverSeed, clientSeed, slotCount, layoutHash)
      }));
    }

    return jsonResponse(request, config, 200, {
      serverSeedHash: hashSeed(serverSeed),
      layoutHash,
      layoutSlots,
      layoutError,
      clientSeed,
      slotCount,
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      resultIndex,
      resultSlotNumber,
      slotLabel,
      wheelName,
      spinNumber,
      summaryTitle,
      summary,
      proofHash
    });
    }
  });
}

export async function wheelFairnessProof(
  request: HttpRequest
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, null, {
    errorLogMessage: "Failed to create wheel fairness proof link.",
    fallbackErrorMessage: "Failed to create wheel fairness proof link.",
    operation: async ({ config }) => {
    const body = requireBodyRecord(await readRequestJsonOrThrow(request));
    const proofRequest = parseProofCreationRequest(body);
    const proofDocument = await createWheelFairnessProof(config, proofRequest);

    return jsonResponse(request, config, 200, {
      verificationUrl: buildStoredProofVerificationUrl(request, proofDocument.proofId, "html"),
      jsonUrl: buildStoredProofVerificationUrl(request, proofDocument.proofId, "json")
    });
    }
  });
}

export async function wheelFairnessHash(
  request: HttpRequest
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, null, {
    errorLogMessage: "Failed to hash wheel fairness seed.",
    fallbackErrorMessage: "Failed to hash wheel fairness seed.",
    operation: async ({ config }) => {
    const seed = parseSeed(getQueryParam(request, "seed"), "seed");
    return jsonResponse(request, config, 200, {
      hash: hashSeed(seed),
      algorithm: "sha256"
    });
    }
  });
}
