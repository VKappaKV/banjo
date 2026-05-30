import algosdk from "algosdk";
import type { Network } from "$core/types";
import { createAlgodClient, selectNetworkClientConfig } from "$core/network";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import { BEACON_PREFIX, type BeaconAnnouncement, type BeaconDecodedNote, type BeaconIndexedTransaction } from "./beacon-types";
import { decodeBeaconIndexerNote, encodeBeaconNote } from "./beacon-notes";

function indexerUrl(network: Network, useFallback: boolean, path: string, params: Record<string, string | number | undefined>): string {
  const config = selectNetworkClientConfig(network, "indexer", useFallback);
  if (!config) throw new Error(`Network ${network.name} has no indexer endpoint.`);
  const base = `${config.url}${config.port ? `:${config.port}` : ""}`;
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function mapIndexerTransaction(tx: Record<string, unknown>): BeaconIndexedTransaction | undefined {
  if (typeof tx.id !== "string" || typeof tx.sender !== "string" || typeof tx.note !== "string") return undefined;
  return {
    id: tx.id,
    sender: tx.sender,
    round: Number(tx["confirmed-round"] ?? 0),
    note: tx.note,
    group: typeof tx.group === "string" ? tx.group : undefined,
  };
}

export async function fetchBeaconTransactions(args: {
  network: Network;
  protocolAddress: string;
  useFallback: boolean;
  sender?: string;
  minRound?: number;
  limit?: number;
}): Promise<BeaconDecodedNote[]> {
  const url = indexerUrl(args.network, args.useFallback, `/v2/accounts/${args.protocolAddress}/transactions`, {
    "note-prefix": btoa(BEACON_PREFIX),
    sender: args.sender,
    "min-round": args.minRound,
    limit: args.limit ?? 50,
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`BEACON indexer query failed (${response.status}).`);
  const data = (await response.json()) as { transactions?: Array<Record<string, unknown>> };
  return (data.transactions ?? [])
    .map(mapIndexerTransaction)
    .filter((tx): tx is BeaconIndexedTransaction => !!tx)
    .map(decodeBeaconIndexerNote)
    .filter((note): note is BeaconDecodedNote => !!note);
}

export async function lookupBeaconAnnouncement(args: {
  network: Network;
  protocolAddress: string;
  address: string;
  useFallback: boolean;
}): Promise<BeaconAnnouncement | undefined> {
  const notes = await fetchBeaconTransactions({
    network: args.network,
    protocolAddress: args.protocolAddress,
    sender: args.address,
    useFallback: args.useFallback,
    limit: 20,
  });
  return notes
    .filter((note) => note.plaintext?.type === "announce" || note.plaintext?.type === "announce-rotate")
    .sort((a, b) => b.transaction.round - a.transaction.round)[0]?.plaintext;
}

export async function submitBeaconNote(args: {
  app: WalletAppState;
  network: Network;
  sender: string;
  protocolAddress: string;
  payload: unknown;
  password?: string;
}): Promise<string> {
  const [txid] = await submitBeaconNotes({ ...args, payloads: [args.payload] });
  return txid ?? "";
}

export async function submitBeaconNotes(args: {
  app: WalletAppState;
  network: Network;
  sender: string;
  protocolAddress: string;
  payloads: unknown[];
  password?: string;
}): Promise<string[]> {
  if (!args.app.core) throw new Error("Wallet not initialized.");
  const algod = createAlgodClient(args.network, args.app.state.fallbackEnabled);
  const suggestedParams = await algod.getTransactionParams().do();
  const txns = args.payloads.map((payload) => algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: args.sender,
    receiver: args.protocolAddress,
    amount: 0,
    note: encodeBeaconNote(payload),
    suggestedParams: { ...suggestedParams, fee: 1000, flatFee: true },
  }));
  if (txns.length > 1) algosdk.assignGroupID(txns);
  const { signWalletTransactionRequest, walletTransactionsFromGroup } = await import("$core/signing");
  const response = await signWalletTransactionRequest({
    walletTransactions: walletTransactionsFromGroup(txns),
    context: {
      state: args.app.state,
      storage: args.app.core.storage,
      ledgerProvider: args.app.core.ledgerProvider,
      credentialProvider: args.app.core.credentialProvider,
      cryptoProvider: args.app.core.cryptoProvider,
      algod,
      password: args.password || undefined,
    },
  });
  const signed = response.signedTransactions.filter((blob): blob is Uint8Array => !!blob);
  if (signed.length !== txns.length) throw new Error("Cancelled BEACON transaction signature.");
  const result = await algod.sendRawTransaction(signed.length === 1 ? signed[0]! : signed).do();
  const txid = (result as { txid?: string; txId?: string }).txid ?? (result as { txId?: string }).txId ?? "";
  return txid ? [txid] : [];
}
