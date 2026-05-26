import type { Algodv2, modelsv2 } from "algosdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const algosdkMocks = vi.hoisted(() => ({
	waitForConfirmation: vi.fn(),
}));

vi.mock("algosdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("algosdk")>();

	return {
		...actual,
		waitForConfirmation: algosdkMocks.waitForConfirmation,
	};
});

import { submitSignedTransactions } from "../src/lib/core/transactions";

describe("submitSignedTransactions", () => {
	beforeEach(() => {
		algosdkMocks.waitForConfirmation.mockReset();
	});

	it("submits signed transaction bytes and waits for confirmation", async () => {
		const signedTransactions = new Uint8Array([1, 2, 3]);
		const confirmation = { confirmedRound: 123n } as modelsv2.PendingTransactionResponse;
		const doSend = vi.fn(async () => ({ txid: "TXID" }));
		const algod = {
			sendRawTransaction: vi.fn(() => ({ do: doSend })),
		} as unknown as Algodv2;

		algosdkMocks.waitForConfirmation.mockResolvedValue(confirmation);

		await expect(
			submitSignedTransactions({ algod, signedTransactions, waitRounds: 3 }),
		).resolves.toBe(confirmation);
		expect(algod.sendRawTransaction).toHaveBeenCalledWith(signedTransactions);
		expect(doSend).toHaveBeenCalledOnce();
		expect(algosdkMocks.waitForConfirmation).toHaveBeenCalledWith(algod, "TXID", 3);
	});

	it("supports SDK responses that use txId casing", async () => {
		const confirmation = { confirmedRound: 1n } as modelsv2.PendingTransactionResponse;
		const algod = {
			sendRawTransaction: vi.fn(() => ({ do: async () => ({ txId: "TXID2" }) })),
		} as unknown as Algodv2;

		algosdkMocks.waitForConfirmation.mockResolvedValue(confirmation);

		await expect(
			submitSignedTransactions({ algod, signedTransactions: [new Uint8Array([1])] }),
		).resolves.toBe(confirmation);
		expect(algosdkMocks.waitForConfirmation).toHaveBeenCalledWith(algod, "TXID2", 10);
	});

	it("throws when algod does not return a transaction ID", async () => {
		const algod = {
			sendRawTransaction: vi.fn(() => ({ do: async () => ({}) })),
		} as unknown as Algodv2;

		await expect(
			submitSignedTransactions({ algod, signedTransactions: new Uint8Array([1]) }),
		).rejects.toThrow("Algod did not return a transaction ID");
		expect(algosdkMocks.waitForConfirmation).not.toHaveBeenCalled();
	});
});
