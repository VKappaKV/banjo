import { describe, expect, it } from "vitest";
import {
  beaconKeypairFromSignature,
  decryptBeaconPayload,
  deriveBeaconSessionToken,
  encryptBeaconPayload,
} from "../src/lib/p2p/beacon/beacon-crypto";
import {
  base64ToBytes,
  beaconNoteFits,
  decodeBeaconIndexerNote,
  decodeBeaconNoteBytes,
  encodeBeaconNote,
} from "../src/lib/p2p/beacon/beacon-notes";
import { BEACON_PROTO, type BeaconIndexedTransaction, type BeaconSignalPayload } from "../src/lib/p2p/beacon/beacon-types";

describe("BEACON note encoding", () => {
  it("encodes and decodes plaintext announce notes", () => {
    const payload = { proto: BEACON_PROTO, type: "announce", wpk: "abc", ts: 123 };
    const encoded = encodeBeaconNote(payload);
    const decoded = decodeBeaconNoteBytes(encoded);
    expect(decoded).toEqual(payload);
    expect(beaconNoteFits(payload)).toBe(true);
  });

  it("decodes indexer notes", () => {
    const payload = { proto: BEACON_PROTO, type: "announce", wpk: "abc", ts: 123 };
    const tx: BeaconIndexedTransaction = {
      id: "txid",
      sender: "sender",
      round: 10,
      note: Buffer.from(encodeBeaconNote(payload)).toString("base64"),
    };
    const decoded = decodeBeaconIndexerNote(tx);
    expect(decoded?.plaintext).toEqual(payload);
  });
});

describe("BEACON crypto", () => {
  it("derives deterministic keypairs from the same signature", () => {
    const sig = new Uint8Array(64).fill(7);
    const a = beaconKeypairFromSignature(sig);
    const b = beaconKeypairFromSignature(sig);
    expect(a.wpk).toBe(b.wpk);
    expect(a.secretKey).toEqual(b.secretKey);
  });

  it("encrypts and decrypts signaling payloads", () => {
    const sender = beaconKeypairFromSignature(new Uint8Array(64).fill(1));
    const recipient = beaconKeypairFromSignature(new Uint8Array(64).fill(2));
    const payload: BeaconSignalPayload = {
      proto: BEACON_PROTO,
      type: "offer",
      wpk: sender.wpk,
      ts: Date.now(),
      exp: Date.now() + 60_000,
      sdp: "v=0",
    };

    const encrypted = encryptBeaconPayload(payload, recipient.wpk);
    expect(base64ToBytes(encrypted.ct).length).toBeGreaterThan(0);
    const opened = decryptBeaconPayload<BeaconSignalPayload>(encrypted, recipient.secretKey);
    expect(opened).toEqual(payload);
    expect(decryptBeaconPayload<BeaconSignalPayload>(encrypted, sender.secretKey)).toBeUndefined();
  });

  it("derives matching session tokens from both sides", () => {
    const sender = beaconKeypairFromSignature(new Uint8Array(64).fill(9));
    const recipient = beaconKeypairFromSignature(new Uint8Array(64).fill(10));
    const ts = 1718000000;
    const a = deriveBeaconSessionToken(recipient.wpk, sender.secretKey, ts);
    const b = deriveBeaconSessionToken(sender.wpk, recipient.secretKey, ts);
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });
});
