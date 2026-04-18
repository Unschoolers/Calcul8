import { randomBytes } from "node:crypto";
import type {
    ApiConfig,
    WheelFairnessProofDocument,
    WheelFairnessProofLayoutSlot
} from "../../types";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";
import { wheelFairnessProofDocumentId } from "./ids";

function buildProofId(): string {
  return randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
}

function normalizeProofId(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return code === 409 || statusCode === 409 || code === "Conflict" || code === "conflict";
}

export async function createWheelFairnessProof(
  config: ApiConfig,
  input: {
    serverSeed: string;
    clientSeed: string;
    slotCount: number;
    layoutHash: string | null;
    layoutSlots: WheelFairnessProofLayoutSlot[] | null;
    slotLabel: string | null;
    wheelName: string | null;
    spinNumber: number | null;
  }
): Promise<WheelFairnessProofDocument> {
  const { sessions } = getContainers(config);
  const nowIso = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const proofId = buildProofId();
    const document: WheelFairnessProofDocument = {
      id: wheelFairnessProofDocumentId(proofId),
      docType: "wheel_fairness_proof",
      proofId,
      createdAt: nowIso,
      serverSeed: input.serverSeed,
      clientSeed: input.clientSeed,
      slotCount: input.slotCount,
      layoutHash: input.layoutHash,
      layoutSlots: input.layoutSlots,
      slotLabel: input.slotLabel,
      wheelName: input.wheelName,
      spinNumber: input.spinNumber
    };

    try {
      const { resource } = await withCosmosRetry(() =>
        sessions.items.create<WheelFairnessProofDocument>(document)
      );
      if (!resource) {
        throw new Error("Failed to create wheel fairness proof.");
      }
      return resource;
    } catch (error) {
      if (isConflictError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to allocate a wheel fairness proof id.");
}

export async function getWheelFairnessProof(
  config: ApiConfig,
  proofId: string
): Promise<WheelFairnessProofDocument | null> {
  const normalizedProofId = normalizeProofId(proofId);
  if (!normalizedProofId) return null;

  const { sessions } = getContainers(config);
  const documentId = wheelFairnessProofDocumentId(normalizedProofId);

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.item(documentId, documentId).read<WheelFairnessProofDocument>()
    );
    if (!resource || resource.docType !== "wheel_fairness_proof") return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}