import { sha256 } from "@noble/hashes/sha2.js";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { saveHotAccount } from "../src/lib/core/keys";
import {
	signDataRequest,
	signingErrorCodes,
	validateSignDataRequest,
} from "../src/lib/core/signing";
import { createInitialWalletState } from "../src/lib/core/state";
import { MockCredentialProvider } from "../src/lib/core/testing/mock-credential";
import { MockLedgerProvider } from "../src/lib/core/testing/mock-ledger";
import { MockWalletStorage } from "../src/lib/core/testing/mock-storage";
import type { SignDataMetadata, Siwa } from "../src/lib/core";

const domain = "example.com";
const metadata: SignDataMetadata = { scope: 1, encoding: "base64" };

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}

	const object = value as Record<string, unknown>;

	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
		.join(",")}}`;
}

function authenticatorData(domainName = domain): Uint8Array {
	return new Uint8Array([...sha256(new TextEncoder().encode(domainName)), 1, 2, 3]);
}

function encodeData(jsonString: string): string {
	return algosdk.bytesToBase64(new TextEncoder().encode(jsonString));
}

function siwa(accountAddress: string): Siwa {
	return {
		account_address: accountAddress,
		chain_id: "283",
		domain,
		type: "ed25519",
		uri: "https://example.com/login",
		version: "1",
	};
}

async function validRequest(accountAddress: string) {
	const jsonString = canonicalJson(siwa(accountAddress));

	return validateSignDataRequest({
		data: encodeData(jsonString),
		metadata,
		authenticatorData: authenticatorData(),
	});
}

function expectThrownCode(error: unknown, code: number): void {
	expect(error).toMatchObject({ code });
}

describe("SIWA sign-data core", () => {
	it("validates canonical SIWA JSON and domain binding", async () => {
		const account = algosdk.generateAccount();
		const request = await validRequest(account.addr.toString());

		expect(request.siwa.domain).toBe(domain);
		expect(request.siwa.account_address).toBe(account.addr.toString());
	});

	it("rejects non-canonical JSON", async () => {
		const account = algosdk.generateAccount();
		const nonCanonical = JSON.stringify({
			domain,
			account_address: account.addr.toString(),
			uri: "https://example.com/login",
			version: "1",
			chain_id: "283",
			type: "ed25519",
		});

		try {
			await validateSignDataRequest({
				data: encodeData(nonCanonical),
				metadata,
				authenticatorData: authenticatorData(),
			});
		} catch (error) {
			expectThrownCode(error, signingErrorCodes.badSignDataJson);
			return;
		}

		throw new Error("Expected validation to fail");
	});

	it("rejects bad domain authenticator data", async () => {
		const account = algosdk.generateAccount();
		const jsonString = canonicalJson(siwa(account.addr.toString()));

		try {
			await validateSignDataRequest({
				data: encodeData(jsonString),
				metadata,
				authenticatorData: authenticatorData("evil.example"),
			});
		} catch (error) {
			expectThrownCode(error, signingErrorCodes.failedDomainAuthentication);
			return;
		}

		throw new Error("Expected validation to fail");
	});

	it("signs SIWA requests with hot keys", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		await saveHotAccount({ account, state, storage, markHot: true });
		const request = await validRequest(account.addr.toString());

		const response = await signDataRequest({
			request,
			state,
			storage,
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
			isWebResponse: true,
		});

		expect(response.signer).toBe(account.addr.toString());
		expect(response.signature).toBeInstanceOf(Uint8Array);
		expect((response.signature as Uint8Array).byteLength).toBe(64);
		expect(response.authenticatorData).toEqual(request.authenticatorData);
	});

	it("serializes extension sign-data responses as base64", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		await saveHotAccount({ account, state, storage, markHot: true });
		const request = await validRequest(account.addr.toString());

		const response = await signDataRequest({
			request,
			state,
			storage,
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
			isWebResponse: false,
		});

		expect(typeof response.signature).toBe("string");
		expect(response.signer).toBe(algosdk.bytesToBase64(algosdk.decodeAddress(account.addr.toString()).publicKey));
		expect(response.authenticatorData).toBe(algosdk.bytesToBase64(request.authenticatorData));
	});

	it("maps Ledger sign-data rejection to 4001", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		const ledgerProvider = new MockLedgerProvider();
		state.accounts = [{ addr: account.addr.toString(), slot: 0 }];
		ledgerProvider.rejectMessage = "User rejected";
		const request = await validRequest(account.addr.toString());

		try {
			await signDataRequest({
				request,
				state,
				storage,
				ledgerProvider,
				credentialProvider: new MockCredentialProvider(),
				isWebResponse: true,
			});
		} catch (error) {
			expectThrownCode(error, signingErrorCodes.userRejected);
			expect(ledgerProvider.closed).toBe(true);
			return;
		}

		throw new Error("Expected signing to fail");
	});
});
