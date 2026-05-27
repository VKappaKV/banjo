import { Buffer } from "buffer";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { CredentialProvider, CryptoProvider } from "../runtime";
import type { WalletStorage } from "../storage";
import type { SeedData } from "../types";

export const seedEncryptionIterations = 100_000;
export const seedEncryptionHash = "SHA-256";
export const seedEncryptionSaltBytes = 12;
export const seedEncryptionIvBytes = 12;
export const passkeyPrfInput = "Algorand";
export const banjoPasskeyRpName = "Banjo";
export const banjoPasskeyUserName = "wallet@banjo.app";

export class SeedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SeedError";
	}
}

function getSubtle(cryptoProvider?: Pick<CryptoProvider, "subtle">): SubtleCrypto {
	const subtle = cryptoProvider?.subtle ?? globalThis.crypto?.subtle;

	if (!subtle) {
		throw new SeedError("WebCrypto subtle API is unavailable");
	}

	return subtle;
}

function randomBytes(length: number): Uint8Array {
	if (!globalThis.crypto?.getRandomValues) {
		throw new SeedError("WebCrypto random source is unavailable");
	}

	return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveSeedEncryptionKey(args: {
	passphrase: string;
	salt: Uint8Array;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<CryptoKey> {
	const subtle = getSubtle(args.cryptoProvider);
	const keyMaterial = await subtle.importKey(
		"raw",
		new TextEncoder().encode(args.passphrase),
		"PBKDF2",
		false,
		["deriveKey"],
	);

	return subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: Buffer.from(args.salt),
			iterations: seedEncryptionIterations,
			hash: seedEncryptionHash,
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		true,
		["encrypt", "decrypt"],
	);
}

export function generateBip39Mnemonic(strength: 128 | 160 | 192 | 224 | 256 = 256): string {
	return bip39.generateMnemonic(wordlist, strength);
}

export async function encryptAndStoreBip39Seed(args: {
	mnemonic: string;
	passphrase: string;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<{ id: number; seed: Buffer }> {
	const subtle = getSubtle(args.cryptoProvider);
	const seed = Buffer.from(bip39.mnemonicToSeedSync(args.mnemonic));
	const salt = randomBytes(seedEncryptionSaltBytes);
	const iv = randomBytes(seedEncryptionIvBytes);
	const key = await deriveSeedEncryptionKey({
		passphrase: args.passphrase,
		salt,
		cryptoProvider: args.cryptoProvider,
	});
	const data = await subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, seed);
	const id = await args.storage.putSeed({ data, salt, iv });

	return { id, seed };
}

export async function createAndStoreBip39Seed(args: {
	passphrase: string;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
	strength?: 128 | 160 | 192 | 224 | 256;
}): Promise<{ mnemonic: string; seedId: number; seed: Buffer }> {
	const mnemonic = generateBip39Mnemonic(args.strength ?? 256);
	const { id, seed } = await encryptAndStoreBip39Seed({
		mnemonic,
		passphrase: args.passphrase,
		storage: args.storage,
		cryptoProvider: args.cryptoProvider,
	});

	return { mnemonic, seedId: id, seed };
}

export async function importAndStoreBip39Seed(args: {
	mnemonic: string;
	passphrase: string;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<{ seedId: number; seed: Buffer }> {
	const { id, seed } = await encryptAndStoreBip39Seed(args);

	return { seedId: id, seed };
}

export async function decryptStoredSeed(args: {
	passphrase: string;
	seedData: SeedData;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<Buffer> {
	if (!args.seedData.salt || !args.seedData.iv || !args.seedData.data) {
		throw new SeedError("Bad Seed Data");
	}

	const subtle = getSubtle(args.cryptoProvider);
	const key = await deriveSeedEncryptionKey({
		passphrase: args.passphrase,
		salt: args.seedData.salt,
		cryptoProvider: args.cryptoProvider,
	});
	const decrypted = await subtle.decrypt(
		{ name: "AES-GCM", iv: Buffer.from(args.seedData.iv) as BufferSource },
		key,
		args.seedData.data,
	);

	return Buffer.from(decrypted);
}

interface PrfCredentialResult {
	prf?: {
		results?: {
			first?: ArrayBuffer;
		};
	};
}

function getCredentialPrfResult(credential: PublicKeyCredential): Uint8Array {
	const results = credential.getClientExtensionResults() as PrfCredentialResult;
	const first = results.prf?.results?.first;

	if (!first) {
		throw new SeedError(
			"Authenticator device/platform does not support prf. Check compatibility matrix.",
		);
	}

	return new Uint8Array(first);
}

function isPublicKeyCredential(credential: Credential | null): credential is PublicKeyCredential {
	return !!credential && typeof (credential as PublicKeyCredential).getClientExtensionResults === "function";
}

export async function getPasskeyMnemonic(args: {
	credentialId?: string;
	credentialProvider: CredentialProvider;
}): Promise<{ mnemonic: string; credential: PublicKeyCredential }> {
	const allowCredentials: PublicKeyCredentialDescriptor[] = [];

	if (args.credentialId) {
		allowCredentials.push({
			type: "public-key",
			id: Buffer.from(args.credentialId, "base64"),
		});
	}

	const credential = await args.credentialProvider.getCredential({
		publicKey: {
			allowCredentials,
			challenge: new Uint8Array(32),
			extensions: {
				prf: { eval: { first: new TextEncoder().encode(passkeyPrfInput) } },
			} as AuthenticationExtensionsClientInputs,
		},
	});

	if (!isPublicKeyCredential(credential)) {
		throw new SeedError("Invalid Credentials");
	}

	return {
		mnemonic: bip39.entropyToMnemonic(getCredentialPrfResult(credential), wordlist),
		credential,
	};
}

export async function getPasskeySeed(args: {
	credentialId?: string;
	credentialProvider: CredentialProvider;
}): Promise<{ seed: Buffer; credentialId: string }> {
	const { mnemonic, credential } = await getPasskeyMnemonic(args);

	return { seed: Buffer.from(bip39.mnemonicToSeedSync(mnemonic)), credentialId: credential.id };
}

export async function storePasskeyCredential(args: {
	storage: WalletStorage;
	credentialId: string;
}): Promise<number> {
	return args.storage.putSeed({ credentialId: args.credentialId });
}

export async function restorePasskeySeed(args: {
	storage: WalletStorage;
	credentialProvider: CredentialProvider;
	credentialId?: string;
}): Promise<{ seedId: number; seed: Buffer; credentialId: string }> {
	const { seed, credentialId } = await getPasskeySeed(args);
	const seedId = await storePasskeyCredential({ storage: args.storage, credentialId });

	return { seedId, seed, credentialId };
}

export async function registerPasskeySeed(args: {
	storage: WalletStorage;
	credentialProvider: CredentialProvider;
	rpName?: string;
	username?: string;
}): Promise<{ seedId: number; seed: Buffer; credentialId: string }> {
	const name = args.username ?? banjoPasskeyUserName;
	const credential = await args.credentialProvider.createCredential({
		publicKey: {
			authenticatorSelection: { residentKey: "required" },
			challenge: new Uint8Array(32),
			pubKeyCredParams: [
				{ alg: -7, type: "public-key" },
				{ alg: -8, type: "public-key" },
				{ alg: -257, type: "public-key" },
			],
			rp: { name: args.rpName ?? banjoPasskeyRpName },
			user: {
				id: new Uint8Array(32),
				name,
				displayName: name,
			},
		},
	});

	if (!credential) {
		throw new SeedError("Invalid Credential");
	}

	const credentialId = credential.id;
	const seedId = await storePasskeyCredential({ storage: args.storage, credentialId });
	const { seed } = await getPasskeySeed({ credentialId, credentialProvider: args.credentialProvider });

	return { seedId, seed, credentialId };
}
