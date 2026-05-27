import { Buffer } from "buffer";
import algosdk, { type Algodv2, type Indexer } from "algosdk";
import type { AccountSubs } from "../types";
import { getAuthorizedAccounts as getAuthorizedAccountsDefault } from "../network";
import {
	BIP32DerivationType,
	deriveChildNodePublic,
	fromSeed,
	harden,
	KeyContext,
	XHDWalletAPI,
} from "./xhd";

export const defaultHdDiscoveryCount = 4;

export async function deriveHdAccounts(args: {
	seed: Buffer;
	startIndex?: number;
	count?: number;
	algod: Algodv2;
	indexer?: Indexer;
	getAuthorizedAccounts?: (address: string, indexer?: Indexer) => Promise<string[]>;
}): Promise<AccountSubs[]> {
	const accounts: AccountSubs[] = [];
	const cryptoService = new XHDWalletAPI();
	const rootKey = fromSeed(args.seed);
	const startIndex = args.startIndex ?? 0;
	const count = args.count ?? defaultHdDiscoveryCount;
	const getAuthorizedAccounts = args.getAuthorizedAccounts ?? getAuthorizedAccountsDefault;

	try {
		for (let i = startIndex; i < startIndex + count; i++) {
			const key = await cryptoService.keyGen(rootKey, KeyContext.Address, i, 0);
			const addr = algosdk.encodeAddress(key);
			const ai = (await args.algod.accountInformation(addr).do()) as AccountSubs;
			ai.subs = await getAuthorizedAccounts(addr, args.indexer);
			const xpubArr = await cryptoService.deriveKey(
				rootKey,
				[harden(44), harden(283), harden(i), 0],
				false,
				BIP32DerivationType.Peikert,
			);
			ai.xpub = Buffer.from(xpubArr).toString("base64");
			accounts.push(ai);
		}
	} finally {
		rootKey.fill(0);
	}

	return accounts;
}

export async function deriveHdAddress(xpub: string, index: number): Promise<string> {
	const xpubArr = Buffer.from(xpub, "base64");
	const childExtended = await deriveChildNodePublic(xpubArr, index);
	const childPub = childExtended.slice(0, 32);

	return algosdk.encodeAddress(childPub);
}

export async function signWithHdSeed(args: {
	seed: Buffer;
	accountSlot: number;
	bytesToSign: Uint8Array;
	addressIndex?: number;
}): Promise<Uint8Array> {
	const cryptoService = new XHDWalletAPI();
	const rootKey = fromSeed(args.seed);
	args.seed.fill(0);

	try {
		return await cryptoService.signAlgoTransaction(
			rootKey,
			KeyContext.Address,
			args.accountSlot,
			args.addressIndex ?? 0,
			args.bytesToSign,
		);
	} finally {
		rootKey.fill(0);
	}
}
