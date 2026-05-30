import { Buffer } from "buffer";
import { BEACON_PREFIX, type BeaconDecodedNote, type BeaconEncryptedWrapper, type BeaconIndexedTransaction } from "./beacon-types";

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function encodeBeaconNote(payload: unknown): Uint8Array {
  const json = JSON.stringify(payload);
  return new TextEncoder().encode(`${BEACON_PREFIX}${Buffer.from(json, "utf8").toString("base64")}`);
}

export function decodeBeaconNoteBytes(noteBytes: Uint8Array): unknown | undefined {
  const note = new TextDecoder().decode(noteBytes);
  if (!note.startsWith(BEACON_PREFIX)) return undefined;
  const payload = note.slice(BEACON_PREFIX.length);
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

export function decodeBeaconIndexerNote(transaction: BeaconIndexedTransaction): BeaconDecodedNote | undefined {
  try {
    const payload = decodeBeaconNoteBytes(base64ToBytes(transaction.note));
    if (!payload || typeof payload !== "object") return undefined;
    const record = payload as Record<string, unknown>;
    if (record.type === "announce" || record.type === "announce-rotate") {
      return { transaction, plaintext: record as unknown as BeaconDecodedNote["plaintext"] };
    }
    if (typeof record.epk === "string" && typeof record.nonce === "string" && typeof record.ct === "string") {
      return { transaction, encrypted: record as unknown as BeaconEncryptedWrapper };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function beaconNoteFits(payload: unknown): boolean {
  return encodeBeaconNote(payload).length <= 1024;
}
