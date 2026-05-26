import { beforeEach, describe, expect, it, vi } from "vitest";

const algosdkMocks = vi.hoisted(() => ({
	base64ToBytes: vi.fn((value: string) => new Uint8Array([value.charCodeAt(0)])),
	decodeSignedTransaction: vi.fn((bytes: Uint8Array) => ({ txn: { kind: "signed", byte: bytes[0] } })),
	decodeUnsignedTransaction: vi.fn((bytes: Uint8Array) => ({ kind: "unsigned", byte: bytes[0] })),
}));

vi.mock("algosdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("algosdk")>();

	return {
		...actual,
		base64ToBytes: algosdkMocks.base64ToBytes,
		decodeSignedTransaction: algosdkMocks.decodeSignedTransaction,
		decodeUnsignedTransaction: algosdkMocks.decodeUnsignedTransaction,
	};
});

import { buildVaultSendTransactions } from "../src/lib/core/network";

describe("buildVaultSendTransactions", () => {
	beforeEach(() => {
		algosdkMocks.base64ToBytes.mockClear();
		algosdkMocks.decodeSignedTransaction.mockClear();
		algosdkMocks.decodeUnsignedTransaction.mockClear();
	});

	it("posts the vault send request and decodes unsigned transactions", async () => {
		const request = { assetId: 123, receiver: "ADDR" };
		const fetchJson = vi.fn(async () => [
			["u", "alpha"],
			["u", "bravo"],
		]);

		await expect(
			buildVaultSendTransactions({
				nfdUrl: "https://api.nf.domains/",
				name: "vault.algo",
				request,
				fetchJson,
			}),
		).resolves.toEqual({
			txns: [
				{ kind: "unsigned", byte: "a".charCodeAt(0) },
				{ kind: "unsigned", byte: "b".charCodeAt(0) },
			],
			indexesToSign: undefined,
		});
		expect(fetchJson).toHaveBeenCalledWith("https://api.nf.domains/nfd/vault/sendFrom/vault.algo", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
		});
		expect(algosdkMocks.decodeUnsignedTransaction).toHaveBeenCalledTimes(2);
		expect(algosdkMocks.decodeSignedTransaction).not.toHaveBeenCalled();
	});

	it("decodes signed transactions and returns unsigned indexes to sign", async () => {
		const fetchJson = vi.fn(async () => [
			["s", "alpha"],
			["u", "bravo"],
			["s", "charlie"],
		]);

		await expect(
			buildVaultSendTransactions({
				nfdUrl: "https://api.nf.domains",
				name: "vault.algo",
				request: {},
				fetchJson,
			}),
		).resolves.toEqual({
			txns: [
				{ kind: "signed", byte: "a".charCodeAt(0) },
				{ kind: "unsigned", byte: "b".charCodeAt(0) },
				{ kind: "signed", byte: "c".charCodeAt(0) },
			],
			indexesToSign: [1],
		});
		expect(algosdkMocks.decodeSignedTransaction).toHaveBeenCalledTimes(2);
		expect(algosdkMocks.decodeUnsignedTransaction).toHaveBeenCalledTimes(1);
	});

	it("rejects malformed vault send responses", async () => {
		const fetchJson = vi.fn(async () => ({ txns: [] }));

		await expect(
			buildVaultSendTransactions({
				nfdUrl: "https://api.nf.domains",
				name: "vault.algo",
				request: {},
				fetchJson,
			}),
		).rejects.toThrow("NFD vault send response must be an array");
	});
});
