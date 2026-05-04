import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { HttpError } from "../../lib/auth";
import type { ApiConfig } from "../../types";
import { WHEEL_FAIRNESS_ALGORITHM } from "./fairnessVerifier";

export type WheelCommitTokenPayload = {
  version: "v1";
  algorithm: typeof WHEEL_FAIRNESS_ALGORITHM;
  serverSeed: string;
  serverSeedHash: string;
  layoutHash: string;
  slotCount: number;
  committedAt: number;
  expiresAt: number;
};

export function generateServerSeed(): string {
  return randomBytes(32).toString("hex");
}

function getWheelFairnessEncryptionKey(config: ApiConfig): Buffer {
  return createHash("sha256")
    .update(String(config.cosmosKey || "whatfees-wheel-fairness-secret"), "utf8")
    .digest();
}

export function encryptCommitToken(config: ApiConfig, payload: WheelCommitTokenPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getWheelFairnessEncryptionKey(config), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${authTag.toString("base64url")}`;
}

export function decryptCommitToken(config: ApiConfig, token: string): WheelCommitTokenPayload {
  const [version, ivRaw, ciphertextRaw, authTagRaw] = String(token ?? "").trim().split(".");
  if (version !== "v1" || !ivRaw || !ciphertextRaw || !authTagRaw) {
    throw new HttpError(400, "Field 'commitToken' is invalid.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getWheelFairnessEncryptionKey(config),
      Buffer.from(ivRaw, "base64url")
    );
    decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as Partial<WheelCommitTokenPayload>;
    if (
      payload.version !== "v1"
      || payload.algorithm !== WHEEL_FAIRNESS_ALGORITHM
      || typeof payload.serverSeed !== "string"
      || typeof payload.serverSeedHash !== "string"
      || typeof payload.layoutHash !== "string"
      || !Number.isFinite(Number(payload.slotCount))
      || !Number.isFinite(Number(payload.committedAt))
      || !Number.isFinite(Number(payload.expiresAt))
    ) {
      throw new Error("invalid payload");
    }

    return {
      version: "v1",
      algorithm: WHEEL_FAIRNESS_ALGORITHM,
      serverSeed: payload.serverSeed,
      serverSeedHash: payload.serverSeedHash,
      layoutHash: payload.layoutHash,
      slotCount: Math.floor(Number(payload.slotCount)),
      committedAt: Math.floor(Number(payload.committedAt)),
      expiresAt: Math.floor(Number(payload.expiresAt))
    };
  } catch {
    throw new HttpError(400, "Field 'commitToken' is invalid.");
  }
}
