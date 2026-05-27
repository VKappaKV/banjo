import algosdk, { type Algodv2, type SuggestedParams } from "algosdk";
import { describe, expect, it } from "vitest";
import {
	buildOfflineKeyreg,
	buildOnlineKeyreg,
	estimateAverageBlockTimeMs,
	parseGoalPartkeyInfo,
} from "../src/lib/core/transactions";

const suggestedParams: SuggestedParams = {
	fee: 1000,
	minFee: 1000,
	firstValid: 1,
	lastValid: 1000,
	genesisHash: new Uint8Array(32),
	genesisID: "unitnet-v1",
	flatFee: true,
};

function accountAddress(): string {
	return algosdk.generateAccount().addr.toString();
}

function bytes(length: number, start = 1): Uint8Array {
	return Uint8Array.from({ length }, (_, index) => start + index);
}

function createAlgod(args: { lastRound: bigint; timestamps: Record<string, number> }): Algodv2 {
	return {
		status: () => ({ do: async () => ({ lastRound: args.lastRound }) }),
		block: (round: number | bigint) => ({
			do: async () => ({ block: { timestamp: args.timestamps[round.toString()] } }),
		}),
	} as unknown as Algodv2;
}

describe("participation transaction builders", () => {
	it("builds offline key registration transactions with Lute-compatible nonParticipation false", () => {
		const sender = accountAddress();
		const txn = buildOfflineKeyreg({ sender, suggestedParams, note: "offline" });

		expect(txn.type).toBe("keyreg");
		expect(txn.sender.toString()).toBe(sender);
		expect(txn.keyreg?.nonParticipation).toBe(false);
		expect(txn.keyreg?.voteKey).toBeUndefined();
		expect(txn.keyreg?.selectionKey).toBeUndefined();
		expect(txn.keyreg?.stateProofKey).toBeUndefined();
		expect(new TextDecoder().decode(txn.note)).toBe("offline");
	});

	it("can explicitly build irreversible non-participation key registration transactions", () => {
		const txn = buildOfflineKeyreg({
			sender: accountAddress(),
			suggestedParams,
			nonParticipation: true,
		});

		expect(txn.keyreg?.nonParticipation).toBe(true);
	});

	it("builds online key registration transactions from base64 key material", () => {
		const sender = accountAddress();
		const voteKey = bytes(32, 1);
		const selectionKey = bytes(32, 40);
		const stateProofKey = bytes(64, 80);
		const txn = buildOnlineKeyreg({
			sender,
			voteFirst: 10,
			voteLast: 100,
			voteKeyDilution: 20,
			voteKey: algosdk.bytesToBase64(voteKey),
			selectionKey: algosdk.bytesToBase64(selectionKey),
			stateProofKey: algosdk.bytesToBase64(stateProofKey),
			note: new Uint8Array([9, 8, 7]),
			suggestedParams,
		});

		expect(txn.type).toBe("keyreg");
		expect(txn.keyreg?.nonParticipation).toBe(false);
		expect(Array.from(txn.keyreg?.voteKey ?? [])).toEqual(Array.from(voteKey));
		expect(Array.from(txn.keyreg?.selectionKey ?? [])).toEqual(Array.from(selectionKey));
		expect(Array.from(txn.keyreg?.stateProofKey ?? [])).toEqual(Array.from(stateProofKey));
		expect(txn.keyreg?.voteFirst).toBe(10n);
		expect(txn.keyreg?.voteLast).toBe(100n);
		expect(txn.keyreg?.voteKeyDilution).toBe(20n);
		expect(Array.from(txn.note)).toEqual([9, 8, 7]);
	});

	it("applies the incentive-eligible flat 2 ALGO fee behavior", () => {
		const txn = buildOnlineKeyreg({
			sender: accountAddress(),
			voteFirst: 10n,
			voteLast: 100n,
			voteKeyDilution: 20n,
			voteKey: bytes(32),
			selectionKey: bytes(32, 40),
			stateProofKey: bytes(64, 80),
			incentiveEligible: true,
			suggestedParams: { ...suggestedParams, fee: 1, flatFee: false },
		});

		expect(txn.fee).toBe(2_000_000n);
	});
});

describe("parseGoalPartkeyInfo", () => {
	it("parses goal account partkeyinfo output", () => {
		const result = parseGoalPartkeyInfo(`
First round: 123
Last round: 456
Key dilution: 789
Selection key: ${algosdk.bytesToBase64(bytes(32, 2))}
Voting key: ${algosdk.bytesToBase64(bytes(32, 3))}
State proof key: ${algosdk.bytesToBase64(bytes(64, 4))}
`);

		expect(result).toEqual({
			voteFirst: 123,
			voteLast: 456,
			voteKeyDilution: 789,
			selectionKey: algosdk.bytesToBase64(bytes(32, 2)),
			voteKey: algosdk.bytesToBase64(bytes(32, 3)),
			stateProofKey: algosdk.bytesToBase64(bytes(64, 4)),
		});
	});

	it("returns undefined fields when pasted text is partial", () => {
		expect(parseGoalPartkeyInfo("First round: 1")).toEqual({
			voteFirst: 1,
			voteLast: undefined,
			voteKeyDilution: undefined,
			selectionKey: undefined,
			voteKey: undefined,
			stateProofKey: undefined,
		});
	});
});

describe("estimateAverageBlockTimeMs", () => {
	it("uses the default estimate before 100 rounds are available", async () => {
		const result = await estimateAverageBlockTimeMs(
			createAlgod({ lastRound: 99n, timestamps: {} }),
		);

		expect(result).toEqual({ lastRound: 99n, averageBlockTimeMs: 2800 });
	});

	it("calculates average block time over the previous 100 rounds", async () => {
		const result = await estimateAverageBlockTimeMs(
			createAlgod({
				lastRound: 500n,
				timestamps: { "500": 1_300, "400": 1_000 },
			}),
		);

		expect(result).toEqual({ lastRound: 500n, averageBlockTimeMs: 3000 });
	});
});
