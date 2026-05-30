import algosdk, { type SuggestedParams } from "algosdk";
import { describe, expect, it } from "vitest";
import type { TransactionDraft, PeerSignature, MultisigConfig } from "../src/lib/p2p/workspace-types";
import { createTransactionDraft, createSwapPairId } from "../src/lib/p2p/workspace-types";
import {
  buildTransactionFromDraft,
  createPeerSignature,
  encodeSignedBlob,
  decodeSignedBlob,
  extractRawSignature,
  encodePeerSignature,
  assignSwapGroupId,
} from "../src/lib/p2p/workspace-signer";

const suggestedParams: SuggestedParams = {
  fee: 1000,
  minFee: 1000,
  firstValid: 1,
  lastValid: 1000,
  genesisHash: new Uint8Array(32),
  genesisID: "unitnet-v1",
  flatFee: true,
};

function address(): string {
  return algosdk.generateAccount().addr.toString();
}

describe("buildTransactionFromDraft", () => {
  it("builds a payment transaction", () => {
    const draft = createTransactionDraft({
      type: "pay",
      sender: address(),
      receiver: address(),
      amount: "100000",
    });
    const txn = buildTransactionFromDraft(draft, suggestedParams);
    expect(txn.type).toBe("pay");
  });

  it("builds an asset transfer transaction", () => {
    const draft = createTransactionDraft({
      type: "axfer",
      sender: address(),
      receiver: address(),
      amount: "1",
      assetId: "12345",
    });
    const txn = buildTransactionFromDraft(draft, suggestedParams);
    expect(txn.type).toBe("axfer");
  });

  it("builds a keyreg transaction", () => {
    const voteKeyB64 = Buffer.from(new Uint8Array(32).fill(42)).toString("base64");
    const spKeyB64 = Buffer.from(new Uint8Array(64).fill(99)).toString("base64");
    const draft = createTransactionDraft({
      type: "keyreg",
      sender: address(),
      voteKey: voteKeyB64,
      selectionKey: voteKeyB64,
      stateProofKey: spKeyB64,
      voteFirst: "1",
      voteLast: "1000",
      voteKeyDilution: "10000",
    });
    const txn = buildTransactionFromDraft(draft, suggestedParams);
    expect(txn.type).toBe("keyreg");
  });
});

describe("peer signatures", () => {
  it("creates and decodes peer signatures", () => {
    const peerId = "peer-123";
    const blob = new Uint8Array([1, 2, 3, 4, 5]);
    const sig = createPeerSignature(peerId, blob);
    expect(sig.peerId).toBe(peerId);
    expect(sig.signedBlob).toBeTruthy();
    expect(typeof sig.signedBlob).toBe("string");

    const decoded = decodeSignedBlob(sig.signedBlob);
    expect(new Uint8Array(decoded)).toEqual(blob);
  });

  it("encodes and decodes base64 round-trip", () => {
    const original = new Uint8Array([0, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
    const encoded = encodeSignedBlob(original);
    const decoded = decodeSignedBlob(encoded);
    expect(new Uint8Array(decoded)).toEqual(original);
  });
});

describe("swap group assignment", () => {
  it("assigns group ID to two transactions", () => {
    const draft1 = createTransactionDraft({
      type: "pay",
      sender: address(),
      receiver: address(),
      amount: "100000",
    });
    const draft2 = createTransactionDraft({
      type: "pay",
      sender: address(),
      receiver: address(),
      amount: "200000",
    });

    const txn1 = buildTransactionFromDraft(draft1, suggestedParams);
    const txn2 = buildTransactionFromDraft(draft2, suggestedParams);

    expect(txn1.group).toBeUndefined();
    expect(txn2.group).toBeUndefined();

    const [grouped1, grouped2] = assignSwapGroupId(txn1, txn2);

    expect(grouped1.group).toBeDefined();
    expect(grouped2.group).toBeDefined();
    expect(grouped1.group).toEqual(grouped2.group);
  });
});

describe("multisig address computation", () => {
  it("computes multisig address from config", () => {
    const addr1 = address();
    const addr2 = address();
    const addr3 = address();
    const config: MultisigConfig = { threshold: 2, addrs: [addr1, addr2, addr3] };

    const msigAddr = algosdk.multisigAddress({
      version: 1,
      threshold: config.threshold,
      addrs: config.addrs,
    });

    expect(msigAddr).toBeTruthy();
    const addrStr = msigAddr.toString();
    expect(addrStr.length).toBeGreaterThan(30);
  });
});
