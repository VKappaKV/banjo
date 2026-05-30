import { Buffer } from "buffer";
import algosdk, { type Transaction } from "algosdk";
import nacl from "tweetnacl";
import { signWalletTransactionRequest, walletTransactionsFromGroup } from "$core/signing";
import { createAlgodClient } from "$core/network";
import type { Network } from "$core/types";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import { BEACON_PROTO, type BeaconEncryptedWrapper } from "./beacon-types";
import { base64ToBytes, bytesToBase64 } from "./beacon-notes";
import { getBeaconDomainGenesis } from "./beacon-config";

export interface BeaconKeypairResult {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  wpk: string;
}

export function buildBeaconDomainTransaction(address: string, network: Network): Transaction {
  const { genesisID, genesisHash } = getBeaconDomainGenesis(network);
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: address,
    receiver: address,
    amount: 0,
    note: new TextEncoder().encode(`${BEACON_PROTO}:derive-encryption-key`),
    suggestedParams: {
      genesisHash: algosdk.base64ToBytes(genesisHash),
      genesisID,
      firstValid: 0,
      lastValid: 0,
      fee: 0,
      minFee: 1000,
      flatFee: true,
    },
  });
}

export async function deriveBeaconKeypair(args: {
  app: WalletAppState;
  address: string;
  network: Network;
  password?: string;
}): Promise<BeaconKeypairResult> {
  if (!args.app.core) throw new Error("Wallet not initialized.");
  const algod = createAlgodClient(args.network, args.app.state.fallbackEnabled);
  const txn = buildBeaconDomainTransaction(args.address, args.network);
  const response = await signWalletTransactionRequest({
    walletTransactions: walletTransactionsFromGroup([txn]),
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
  const signed = response.signedTransactions.find((blob): blob is Uint8Array => !!blob);
  if (!signed) throw new Error("Cancelled BEACON key derivation signature.");
  const sig = algosdk.decodeSignedTransaction(signed).sig;
  if (!sig) throw new Error("BEACON domain transaction did not produce a signature.");
  return beaconKeypairFromSignature(sig);
}

export function beaconKeypairFromSignature(signature: Uint8Array): BeaconKeypairResult {
  const secretKey = nacl.hash(signature).slice(0, 32);
  const keypair = nacl.box.keyPair.fromSecretKey(secretKey);
  return { publicKey: keypair.publicKey, secretKey: keypair.secretKey, wpk: bytesToBase64(keypair.publicKey) };
}

export function encryptBeaconPayload(payload: unknown, recipientWpk: string): BeaconEncryptedWrapper {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = nacl.box(plaintext, nonce, base64ToBytes(recipientWpk), ephemeral.secretKey);
  return {
    epk: bytesToBase64(ephemeral.publicKey),
    nonce: bytesToBase64(nonce),
    ct: bytesToBase64(encrypted),
  };
}

export function decryptBeaconPayload<T>(wrapper: BeaconEncryptedWrapper, secretKey: Uint8Array): T | undefined {
  const opened = nacl.box.open(
    base64ToBytes(wrapper.ct),
    base64ToBytes(wrapper.nonce),
    base64ToBytes(wrapper.epk),
    secretKey,
  );
  if (!opened) return undefined;
  return JSON.parse(new TextDecoder().decode(opened)) as T;
}

export function deriveBeaconSessionToken(senderWpk: string, secretKey: Uint8Array, ts: number): string {
  const shared = nacl.box.before(base64ToBytes(senderWpk), secretKey);
  const tsBytes = new TextEncoder().encode(String(ts));
  const combined = new Uint8Array(shared.length + tsBytes.length);
  combined.set(shared, 0);
  combined.set(tsBytes, shared.length);
  return Buffer.from(nacl.hash(combined)).toString("hex").slice(0, 32);
}
