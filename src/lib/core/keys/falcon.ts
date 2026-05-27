import { Buffer } from "buffer";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha512 } from "@noble/hashes/sha2.js";
import algosdk, { type Algodv2, type SuggestedParams } from "algosdk";
import type { WalletStorage } from "../storage";
import type { BanjoAccount } from "../types";
import type { WalletState } from "../state";
import { appendAccount } from "../accounts";

const lsigTealTMPL = `#pragma version 12
bytecblock 0xTMPL_COUNTER
txn TxID
arg 0
pushbytes 0xTMPL_FALCON_PUBLIC_KEY
falcon_verify`;

const dummyTeal = `#pragma version 3
txn RekeyTo
global ZeroAddress
==`;

const hkdfSalt = "bip39-falcon-seed-salt-v1";
const hkdfInfoString = "Falcon1024 seed v1";

export interface FalconAccountData {
	counter: number;
	publicKey: string;
	addr: string;
}

export interface FalconKeyPair {
	publicKey: Uint8Array;
	privateKey: Uint8Array;
}

export type FalconKeyGenerator = (seed: Uint8Array) => FalconKeyPair;

export function getFalconLsigTeal(counter: number, falconPublic: Uint8Array): string {
	return lsigTealTMPL
		.replace("TMPL_COUNTER", counter.toString(16).padStart(2, "0"))
		.replace("TMPL_FALCON_PUBLIC_KEY", Buffer.from(falconPublic).toString("hex"));
}

export async function deriveFalconKeyPair(
	seed: Uint8Array,
	generateKeyImpl?: FalconKeyGenerator,
): Promise<FalconKeyPair> {
	const enc = new TextEncoder();
	const derivedKey = hkdf(sha512, seed, enc.encode(hkdfSalt), enc.encode(hkdfInfoString), 48);
	const generateKey = generateKeyImpl ?? (await import("falcon-1024")).generateKey;

	return generateKey(derivedKey);
}

export async function deriveFalconAccount(args: {
	seed: Uint8Array;
	algod: Algodv2;
}): Promise<FalconAccountData> {
	const falconPair = await deriveFalconKeyPair(args.seed);
	const publicKey = Buffer.from(falconPair.publicKey).toString("base64");
	let logicSig: algosdk.LogicSigAccount | undefined;
	let counter = 0;

	for (counter = 0; counter < 256; counter++) {
		const compiledSig = await args.algod.compile(getFalconLsigTeal(counter, falconPair.publicKey)).do();
		logicSig = new algosdk.LogicSigAccount(new Uint8Array(Buffer.from(compiledSig.result, "base64")));

		try {
			ed25519.Point.fromBytes(logicSig.address().publicKey);
		} catch {
			break;
		}
	}

	if (!logicSig) {
		throw Error("Invalid Lsig");
	}

	return { counter, publicKey, addr: logicSig.address().toString() };
}

export async function getFalconDummyTransactions(args: {
	algod: Algodv2;
	suggestedParams: SuggestedParams;
	count: number;
}): Promise<{ dummyLsig: algosdk.LogicSigAccount; dummyTxns: algosdk.Transaction[] }> {
	const enc = new TextEncoder();
	const dummyCompiled = await args.algod.compile(dummyTeal).do();
	const dummyBytes = Buffer.from(dummyCompiled.result, "base64");
	const dummyLsig = new algosdk.LogicSigAccount(dummyBytes);
	const dummyAddress = dummyLsig.address();
	const dummyTxns = [...Array(args.count).keys()].map((i) =>
		algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender: dummyAddress,
			receiver: dummyAddress,
			amount: 0,
			suggestedParams: { ...args.suggestedParams, fee: 0, flatFee: true },
			note: i ? enc.encode(i.toString()) : undefined,
		}),
	);

	return { dummyLsig, dummyTxns };
}

export async function addFalconAccount(args: {
	seedId: number;
	seed: Uint8Array;
	algod: Algodv2;
	state: WalletState;
	storage: WalletStorage;
	zeroizeSeed?: boolean;
}): Promise<BanjoAccount> {
	try {
		const { addr, ...falcon } = await deriveFalconAccount({ seed: args.seed, algod: args.algod });

		return appendAccount({
			state: args.state,
			storage: args.storage,
			account: { addr, falcon, seedId: args.seedId },
		});
	} finally {
		if (args.zeroizeSeed ?? true) {
			args.seed.fill(0);
		}
	}
}
