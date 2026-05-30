import algosdk, { type SuggestedParams, type Transaction } from "algosdk";
import type { TransactionDraft, PeerSignature, MultisigConfig } from "./workspace-types";
import { signWalletTransactionRequest, walletTransactionsFromGroup } from "$core/signing";
import { buildPaymentTransaction } from "$core/transactions";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import { createAlgodClient } from "$core/network";
import { builtInNetworks } from "$core/data/networks";
import { selectNetwork } from "$core/state";

function encodeNote(note: string | undefined): Uint8Array | undefined {
  if (!note) return undefined;
  return new TextEncoder().encode(note);
}

export function buildTransactionFromDraft(
  draft: TransactionDraft,
  suggestedParams: SuggestedParams,
): Transaction {
  const note = encodeNote(draft.note);
  const sender = draft.signerAddr || draft.sender;

  if (draft.type === "pay") {
    return buildPaymentTransaction({
      sender,
      receiver: draft.receiver,
      amount: draft.amount,
      closeRemainderTo: draft.closeRemainderTo || undefined,
      note,
      suggestedParams,
    });
  }

  if (draft.type === "axfer") {
    return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender,
      receiver: draft.receiver,
      assetIndex: Number(draft.assetId ?? 0),
      amount: algosdk.algosToMicroalgos(Number(draft.amount)),
      closeRemainderTo: draft.closeRemainderTo || undefined,
      note,
      suggestedParams,
    });
  }

  if (draft.type === "keyreg") {
    const decodeB64 = (s: string | undefined): Uint8Array | undefined =>
      s ? new Uint8Array(Buffer.from(s, "base64")) : undefined;
    return algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
      sender,
      voteKey: decodeB64(draft.voteKey),
      selectionKey: decodeB64(draft.selectionKey),
      stateProofKey: decodeB64(draft.stateProofKey),
      voteFirst: Number(draft.voteFirst ?? 0),
      voteLast: Number(draft.voteLast ?? 0),
      voteKeyDilution: Number(draft.voteKeyDilution ?? 0),
      nonParticipation: draft.nonParticipation ?? false,
      note,
      suggestedParams,
    });
  }

  return buildPaymentTransaction({
    sender,
    receiver: draft.receiver || sender,
    amount: "0",
    note,
    suggestedParams,
  });
}

export interface SignWorkspaceDraftInput {
  draft: TransactionDraft;
  app: WalletAppState;
  networkName: string;
  password?: string;
}

export interface SignWorkspaceDraftResult {
  transaction: Transaction;
  signedBlob: Uint8Array;
}

export async function signWorkspaceDraft(
  input: SignWorkspaceDraftInput,
): Promise<SignWorkspaceDraftResult> {
  const { draft, app, password: pw } = input;
  if (!app.core) throw new Error("Wallet not initialized.");

  const network = selectNetwork(app.state, builtInNetworks);
  const algod = createAlgodClient(network, app.state.fallbackEnabled);
  const suggestedParams = (await algod.getTransactionParams().do()) as SuggestedParams;
  const transaction = buildTransactionFromDraft(draft, suggestedParams);

  const walletTxns = walletTransactionsFromGroup([transaction]);
  const response = await signWalletTransactionRequest({
    walletTransactions: walletTxns,
    context: {
      state: app.state,
      storage: app.core.storage,
      ledgerProvider: app.core.ledgerProvider,
      credentialProvider: app.core.credentialProvider,
      cryptoProvider: app.core.cryptoProvider,
      algod,
      password: pw || undefined,
    },
  });

  const signedBlob = response.signedTransactions.find((txn): txn is Uint8Array => !!txn);
  if (!signedBlob) throw new Error("No signed transaction blob returned.");

  return { transaction, signedBlob };
}

export function encodeSignedBlob(blob: Uint8Array): string {
  return Buffer.from(blob).toString("base64");
}

export function decodeSignedBlob(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

export function createPeerSignature(peerId: string, blob: Uint8Array): PeerSignature {
  return { peerId, signedBlob: encodeSignedBlob(blob) };
}

export function extractRawSignature(signedBlob: Uint8Array): Uint8Array {
  const decoded = algosdk.decodeSignedTransaction(signedBlob) as { sig: Uint8Array };
  if (!decoded.sig) throw new Error("Expected a single signature.");
  return decoded.sig;
}

export function encodePeerSignature(peerId: string, rawSig: Uint8Array): PeerSignature {
  return { peerId, signedBlob: encodeSignedBlob(rawSig) };
}

export function assembleMultisigTransaction(
  transaction: Transaction,
  multisigConfig: MultisigConfig,
  signatures: Array<{ addr: string; rawSig: Uint8Array }>,
): Uint8Array {
  const metadata = { version: 1, threshold: multisigConfig.threshold, addrs: multisigConfig.addrs };
  let blob = algosdk.createMultisigTransaction(transaction, metadata);

  for (const sig of signatures) {
    blob = algosdk.appendSignRawMultisigSignature(blob, metadata, sig.addr, sig.rawSig).blob;
  }

  return blob;
}

export async function assembleAndSubmitMultisig(
  app: WalletAppState,
  draft: TransactionDraft,
  multisigConfig: MultisigConfig,
  signatures: Array<{ addr: string; rawSig: Uint8Array }>,
): Promise<string> {
  const network = selectNetwork(app.state, builtInNetworks);
  const algod = createAlgodClient(network, app.state.fallbackEnabled);
  const suggestedParams = (await algod.getTransactionParams().do()) as SuggestedParams;
  const transaction = buildTransactionFromDraft(draft, suggestedParams);

  const blob = assembleMultisigTransaction(transaction, multisigConfig, signatures);
  const result = await algod.sendRawTransaction(blob).do();
  return (result as { txid: string }).txid;
}

export function assignSwapGroupId(txn1: Transaction, txn2: Transaction): [Transaction, Transaction] {
  return algosdk.assignGroupID([txn1, txn2]) as [Transaction, Transaction];
}

export async function buildAndGroupSwapTxns(
  draft1: TransactionDraft,
  draft2: TransactionDraft,
  suggestedParams: SuggestedParams,
): Promise<[Transaction, Transaction]> {
  const txn1 = buildTransactionFromDraft(draft1, suggestedParams);
  const txn2 = buildTransactionFromDraft(draft2, suggestedParams);
  return assignSwapGroupId(txn1, txn2);
}

export async function submitAtomicGroup(
  algod: algosdk.Algodv2,
  signedBlobs: Uint8Array[],
): Promise<string> {
  if (signedBlobs.length === 0) throw new Error("No signed blobs to submit.");
  const result = await algod.sendRawTransaction(signedBlobs).do();
  return (result as { txid: string }).txid;
}

export async function signGroupedDraft(
  transaction: Transaction,
  app: WalletAppState,
  password?: string,
): Promise<Uint8Array> {
  if (!app.core) throw new Error("Wallet not initialized.");
  const network = selectNetwork(app.state, builtInNetworks);
  const algod = createAlgodClient(network, app.state.fallbackEnabled);
  const walletTxns = walletTransactionsFromGroup([transaction]);
  const response = await signWalletTransactionRequest({
    walletTransactions: walletTxns,
    context: {
      state: app.state,
      storage: app.core.storage,
      ledgerProvider: app.core.ledgerProvider,
      credentialProvider: app.core.credentialProvider,
      cryptoProvider: app.core.cryptoProvider,
      algod,
      password: password || undefined,
    },
  });
  const signedBlob = response.signedTransactions.find((txn): txn is Uint8Array => !!txn);
  if (!signedBlob) throw new Error("No signed transaction blob returned.");
  return signedBlob as Uint8Array;
}

export async function submitSignedBlobs(
  algod: algosdk.Algodv2,
  signedBlobs: Uint8Array[],
): Promise<string[]> {
  const txIds: string[] = [];
  for (const blob of signedBlobs) {
    const result = await algod.sendRawTransaction(blob).do();
    const txid = (result as { txid: string }).txid;
    txIds.push(txid);
  }
  return txIds;
}
