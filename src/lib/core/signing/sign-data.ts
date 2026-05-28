import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2.js";
import algosdk from "algosdk";
import type { CredentialProvider, CryptoProvider, LedgerProvider } from "../runtime";
import type { WalletState } from "../state";
import type { WalletStorage } from "../storage";
import type { BanjoAccount, SeedData, Siwa } from "../types";
import { decryptStoredSeed, getPasskeySeed, hotSign, signWithHdSeed } from "../keys";
import { SigningError, signingErrorCodes } from "./errors";

export const siwaAuthScope = 1;

export interface SignDataMetadata {
	scope: number;
	encoding: "base64";
	signer?: string;
	[key: string]: unknown;
}

export interface ValidatedSignDataRequest {
	jsonString: string;
	siwa: Siwa;
	authenticatorData: Uint8Array;
	metadata: SignDataMetadata;
}

export interface SignDataProtocolResponse {
	signature: Uint8Array | string;
	signer: string;
	authenticatorData: Uint8Array | string;
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}

	const object = value as Record<string, unknown>;
	const entries = Object.keys(object)
		.sort()
		.filter((key) => object[key] !== undefined)
		.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`);

	return `{${entries.join(",")}}`;
}

function assertString(value: unknown, field: string): asserts value is string {
	if (typeof value !== "string" || !value) {
		throw new SigningError(`Invalid SIWA ${field}`, signingErrorCodes.badSignDataJson);
	}
}

function parseSiwa(value: unknown): Siwa {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new SigningError("Bad JSON", signingErrorCodes.badSignDataJson);
	}

	const object = value as Record<string, unknown>;
	assertString(object.domain, "domain");
	assertString(object.account_address, "account_address");
	assertString(object.uri, "uri");
	assertString(object.version, "version");
	assertString(object.chain_id, "chain_id");
	assertString(object.type, "type");

	if (object.chain_id !== "283" || object.type !== "ed25519") {
		throw new SigningError("Bad JSON", signingErrorCodes.badSignDataJson);
	}

	if (!algosdk.isValidAddress(object.account_address)) {
		throw new SigningError("Invalid Signer", signingErrorCodes.invalidSignDataSigner);
	}

	if (object.resources != null && (!Array.isArray(object.resources) || object.resources.some((item) => typeof item !== "string"))) {
		throw new SigningError("Bad JSON", signingErrorCodes.badSignDataJson);
	}

	return object as unknown as Siwa;
}

function getSeedData(state: WalletState, seedId: number): SeedData | undefined {
	return state.seeds.find((seed) => seed.id === seedId);
}

async function getSeed(args: {
	account: BanjoAccount;
	state: WalletState;
	storage: WalletStorage;
	credentialProvider: CredentialProvider;
	password?: string;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<Buffer> {
	if (args.account.seedId == null) {
		throw new SigningError("Bad Seed Data", signingErrorCodes.invalidRequest);
	}

	const seedData = getSeedData(args.state, args.account.seedId) ??
		(await args.storage.getAllSeeds()).find((seed) => seed.id === args.account.seedId);

	if (!seedData) {
		throw new SigningError("Bad Seed Data", signingErrorCodes.invalidRequest);
	}

	if (seedData.credentialId) {
		return (await getPasskeySeed({ credentialId: seedData.credentialId, credentialProvider: args.credentialProvider })).seed;
	}

	if (!args.password) {
		throw new SigningError("Password Required", signingErrorCodes.invalidRequest);
	}

	return decryptStoredSeed({
		seedData,
		passphrase: args.password,
		cryptoProvider: args.cryptoProvider,
	});
}

function signDataBytes(jsonString: string, authenticatorData: Uint8Array): Uint8Array {
	return new Uint8Array([...sha256(new TextEncoder().encode(jsonString)), ...sha256(authenticatorData)]);
}

export async function validateSignDataRequest(args: {
	data: string;
	metadata: SignDataMetadata;
	authenticatorData: Uint8Array;
}): Promise<ValidatedSignDataRequest> {
	if (args.metadata.scope !== siwaAuthScope) {
		throw new SigningError("Invalid Scope", signingErrorCodes.invalidSignDataScope);
	}

	if (args.metadata.encoding !== "base64") {
		throw new SigningError("Failed Decoding", signingErrorCodes.failedSignDataDecoding);
	}

	let jsonString: string;

	try {
		jsonString = new TextDecoder().decode(algosdk.base64ToBytes(args.data));
	} catch (error) {
		throw new SigningError("Failed Decoding", signingErrorCodes.failedSignDataDecoding, error);
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(jsonString);
	} catch (error) {
		throw new SigningError("Bad JSON", signingErrorCodes.badSignDataJson, error);
	}

	const siwa = parseSiwa(parsed);

	if (canonicalJson(parsed) !== jsonString) {
		throw new SigningError("Bad JSON", signingErrorCodes.badSignDataJson);
	}

	if (args.metadata.signer && args.metadata.signer !== siwa.account_address) {
		throw new SigningError("Invalid Signer", signingErrorCodes.invalidSignDataSigner);
	}

	const domainHash = sha256(new TextEncoder().encode(siwa.domain));
	const domainBytes = args.authenticatorData.slice(0, 32);

	if (domainBytes.length !== 32 || !domainBytes.every((value, index) => value === domainHash[index])) {
		throw new SigningError("Failed Domain Authentication", signingErrorCodes.failedDomainAuthentication);
	}

	return { jsonString, siwa, authenticatorData: args.authenticatorData, metadata: args.metadata };
}

export function formatSiwaSummary(siwa: Siwa): string {
	const lines = [
		`URI: ${siwa.uri}`,
		`Version: ${siwa.version}`,
		`Chain ID: ${siwa.chain_id}`,
	];

	if (siwa.nonce) {
		lines.push(`Nonce: ${siwa.nonce}`);
	}

	if (siwa["issued-at"]) {
		lines.push(`Issued At: ${siwa["issued-at"]}`);
	}

	if (siwa.resources?.length) {
		lines.push(`Resources: ${siwa.resources.join(", ")}`);
	}

	return lines.join("\n");
}

export function signDataRequestNeedsPassword(args: {
	request: ValidatedSignDataRequest;
	state: WalletState;
}): boolean {
	const account = args.state.accounts.find((item) => item.addr === args.request.siwa.account_address);

	if (account?.seedId == null) {
		return false;
	}

	const seedData = getSeedData(args.state, account.seedId);

	return !!seedData && !seedData.credentialId;
}

export async function signDataRequest(args: {
	request: ValidatedSignDataRequest;
	state: WalletState;
	storage: WalletStorage;
	password?: string;
	ledgerProvider: LedgerProvider;
	credentialProvider: CredentialProvider;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
	isWebResponse: boolean;
}): Promise<SignDataProtocolResponse> {
	const account = args.state.accounts.find((item) => item.addr === args.request.siwa.account_address);

	if (!account) {
		throw new SigningError("Invalid Signer", signingErrorCodes.invalidSignDataSigner);
	}

	const bytesToSign = signDataBytes(args.request.jsonString, args.request.authenticatorData);
	let signature: Uint8Array;

	try {
		if (account.seedId != null && account.slot != null) {
			const seed = await getSeed({
				account,
				state: args.state,
				storage: args.storage,
				credentialProvider: args.credentialProvider,
				password: args.password,
				cryptoProvider: args.cryptoProvider,
			});

			try {
				signature = await signWithHdSeed({ seed, accountSlot: account.slot, bytesToSign });
			} finally {
				seed.fill(0);
			}
		} else if (account.slot != null) {
			if (!args.ledgerProvider.signData) {
				throw new SigningError("Ledger provider does not support sign-data", signingErrorCodes.invalidRequest);
			}

			try {
				signature = await args.ledgerProvider.signData(account.slot, bytesToSign, args.request.metadata);
			} catch (error) {
				if (error instanceof Error && error.message.toLowerCase().includes("rejected")) {
					throw new SigningError("User Rejected Request", signingErrorCodes.userRejected);
				}

				throw error;
			}
		} else {
			signature = await hotSign({
				address: account.addr,
				bytesToSign,
				storage: args.storage,
				cryptoProvider: args.cryptoProvider,
			});
		}
	} finally {
		await args.ledgerProvider.close?.();
	}

	if (args.isWebResponse) {
		return {
			signature,
			signer: account.addr,
			authenticatorData: args.request.authenticatorData,
		};
	}

	return {
		signature: algosdk.bytesToBase64(signature),
		signer: algosdk.bytesToBase64(algosdk.decodeAddress(account.addr).publicKey),
		authenticatorData: algosdk.bytesToBase64(args.request.authenticatorData),
	};
}
