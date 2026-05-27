import algosdk, { type Algodv2, type SuggestedParams, type Transaction } from "algosdk";
import type { TransactionNote } from "./builders";

const INCENTIVE_ELIGIBLE_FEE = 2_000_000;
const DEFAULT_AVERAGE_BLOCK_TIME_MS = 2800;
const AVERAGE_BLOCK_SAMPLE_ROUNDS = 100n;

export interface BuildOfflineKeyregInput {
	sender: string;
	suggestedParams: SuggestedParams;
	note?: TransactionNote;
	nonParticipation?: boolean;
}

export interface BuildOnlineKeyregInput {
	sender: string;
	voteFirst: number | bigint;
	voteLast: number | bigint;
	voteKeyDilution: number | bigint;
	voteKey: string | Uint8Array;
	selectionKey: string | Uint8Array;
	stateProofKey?: string | Uint8Array;
	incentiveEligible?: boolean;
	suggestedParams: SuggestedParams;
	note?: TransactionNote;
}

export interface ParsedGoalPartkeyInfo {
	voteFirst?: number;
	voteLast?: number;
	voteKeyDilution?: number;
	selectionKey?: string;
	voteKey?: string;
	stateProofKey?: string;
}

export interface AverageBlockTimeEstimate {
	lastRound: bigint;
	averageBlockTimeMs: number;
}

function encodeNote(note: TransactionNote | undefined): Uint8Array | undefined {
	if (typeof note === "string") {
		return new TextEncoder().encode(note);
	}

	return note;
}

function decodeBase64Key(value: string | Uint8Array, field: string): Uint8Array {
	if (value instanceof Uint8Array) {
		return value;
	}

	try {
		return algosdk.base64ToBytes(value.trim());
	} catch (error) {
		throw new Error(`${field} must be base64 encoded`, { cause: error });
	}
}

function parseIntegerField(text: string, label: string): number | undefined {
	const match = text.match(new RegExp(`${label}\\s*:?\\s*([0-9]+)`, "i"));

	return match?.[1] === undefined ? undefined : Number(match[1]);
}

function parseStringField(text: string, label: string): string | undefined {
	const match = text.match(new RegExp(`${label}\\s*:?\\s*([^\\r\\n]+)`, "i"));

	return match?.[1]?.trim();
}

function blockTimestamp(blockResponse: unknown): bigint {
	const block = (blockResponse as { block?: { timestamp?: number | bigint } }).block;
	const timestamp = block?.timestamp;

	if (timestamp === undefined) {
		throw new Error("Algod block response did not include a timestamp");
	}

	return BigInt(timestamp);
}

export function buildOfflineKeyreg(input: BuildOfflineKeyregInput): Transaction {
	return algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
		sender: input.sender,
		nonParticipation: input.nonParticipation ?? false,
		note: encodeNote(input.note),
		suggestedParams: input.suggestedParams,
	});
}

export function buildOnlineKeyreg(input: BuildOnlineKeyregInput): Transaction {
	const suggestedParams = input.incentiveEligible
		? { ...input.suggestedParams, flatFee: true, fee: INCENTIVE_ELIGIBLE_FEE }
		: input.suggestedParams;

	return algosdk.makeKeyRegistrationTxnWithSuggestedParamsFromObject({
		sender: input.sender,
		voteKey: decodeBase64Key(input.voteKey, "Voting key"),
		selectionKey: decodeBase64Key(input.selectionKey, "Selection key"),
		stateProofKey:
			input.stateProofKey === undefined
				? undefined
				: decodeBase64Key(input.stateProofKey, "State proof key"),
		voteFirst: input.voteFirst,
		voteLast: input.voteLast,
		voteKeyDilution: input.voteKeyDilution,
		nonParticipation: false,
		note: encodeNote(input.note),
		suggestedParams,
	});
}

export function parseGoalPartkeyInfo(text: string): ParsedGoalPartkeyInfo {
	return {
		voteFirst: parseIntegerField(text, "First round"),
		voteLast: parseIntegerField(text, "Last round"),
		voteKeyDilution: parseIntegerField(text, "Key dilution"),
		selectionKey: parseStringField(text, "Selection key"),
		voteKey: parseStringField(text, "Voting key"),
		stateProofKey: parseStringField(text, "State proof key"),
	};
}

export async function estimateAverageBlockTimeMs(
	algod: Algodv2,
): Promise<AverageBlockTimeEstimate> {
	const status = (await algod.status().do()) as { lastRound: number | bigint };
	const lastRound = BigInt(status.lastRound);

	if (lastRound < AVERAGE_BLOCK_SAMPLE_ROUNDS) {
		return { lastRound, averageBlockTimeMs: DEFAULT_AVERAGE_BLOCK_TIME_MS };
	}

	const previousRound = lastRound - AVERAGE_BLOCK_SAMPLE_ROUNDS;
	const [currentBlock, previousBlock] = await Promise.all([
		algod.block(lastRound).do(),
		algod.block(previousRound).do(),
	]);
	const currentTimestamp = blockTimestamp(currentBlock);
	const previousTimestamp = blockTimestamp(previousBlock);

	return {
		lastRound,
		averageBlockTimeMs: Number(currentTimestamp - previousTimestamp) * 10,
	};
}
