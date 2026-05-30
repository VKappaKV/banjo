import { Buffer } from "buffer";
import algosdk, { type Account } from "algosdk";
import type { CryptoProvider } from "../runtime";
import type { WalletStorage } from "../storage";
import type { BanjoAccount } from "../types";
import type { WalletState } from "../state";
import { appendAccount } from "../accounts/mutations";

export class HotKeyError extends Error {
	constructor(
		message: string,
		public readonly code?: number,
	) {
		super(message);
		this.name = "HotKeyError";
	}
}

function getSubtle(cryptoProvider?: Pick<CryptoProvider, "subtle">): SubtleCrypto {
	const subtle = cryptoProvider?.subtle ?? globalThis.crypto?.subtle;

	if (!subtle) {
		throw new HotKeyError("WebCrypto subtle API is unavailable");
	}

	return subtle;
}

function addressOf(account: Account): string {
	return account.addr.toString();
}

export async function storeHotAccountKey(args: {
	account: Account;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<void> {
	const b64prefix = "MC4CAQAwBQYDK2VwBCIEIA==";
	const pkcs8Prefix = Buffer.from(b64prefix, "base64");
	const pkcs8 = new Uint8Array([...pkcs8Prefix, ...args.account.sk.slice(0, 32)]);
	const key = await getSubtle(args.cryptoProvider).importKey(
		"pkcs8",
		pkcs8,
		{ name: "Ed25519" },
		false,
		["sign"],
	);

	await args.storage.putHotKey(addressOf(args.account), key);
}

export async function hotSign(args: {
	address: string;
	bytesToSign: Uint8Array;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<Uint8Array> {
	const privateKey = await args.storage.getHotKey(args.address);

	if (!privateKey) {
		throw new HotKeyError("Account Not Found", 4300);
	}

	const sig = await getSubtle(args.cryptoProvider).sign(
		{ name: "Ed25519" },
		privateKey,
		Buffer.from(args.bytesToSign),
	);

	return new Uint8Array(sig);
}

export function createHotAccountPreview(convertMnemonic?: string): {
	account: Account;
	address: string;
	mnemonicWords: string[];
} {
	const account = convertMnemonic ? algosdk.mnemonicToSecretKey(convertMnemonic) : algosdk.generateAccount();

	return {
		account,
		address: addressOf(account),
		mnemonicWords: algosdk.secretKeyToMnemonic(account.sk).split(" "),
	};
}

export async function saveHotAccount(args: {
	account: Account;
	state: WalletState;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
	markHot?: boolean;
}): Promise<BanjoAccount> {
	await storeHotAccountKey(args);
	const address = addressOf(args.account);

	if (!args.state.hotKeyAddresses.includes(address)) {
		args.state.hotKeyAddresses = [...args.state.hotKeyAddresses, address];
	}

	return appendAccount({
		state: args.state,
		storage: args.storage,
		account: { addr: address, ...(args.markHot ? { hot: true } : {}) },
	});
}

export async function importHotMnemonic(args: {
	mnemonic: string;
	state: WalletState;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<BanjoAccount> {
	const account = algosdk.mnemonicToSecretKey(args.mnemonic);

	return saveHotAccount({ ...args, account });
}
