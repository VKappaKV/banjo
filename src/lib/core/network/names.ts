import {
	base64ToBytes,
	decodeSignedTransaction,
	decodeUnsignedTransaction,
	type Transaction,
} from "algosdk";
import type { FetchJson } from "../runtime";
import type { Network, NsLookup, NsObject, NsRecord } from "../types";

export interface SearchNamesOptions {
	query: string;
	network: Network;
	fetchJson: FetchJson;
	limit?: number;
}

export interface ReverseLookupNamesOptions {
	addresses: string[];
	network: Network;
	fetchJson: FetchJson;
	batchSize?: number;
}

export interface BuildVaultSendTransactionsOptions<TRequest = unknown> {
	nfdUrl: string;
	name: string;
	request: TRequest;
	fetchJson: FetchJson;
}

export interface VaultSendTransactionsResult {
	txns: Transaction[];
	indexesToSign?: number[];
}

interface NfdSearchRecord {
	name?: string;
	depositAccount?: string;
}

type NfdSearchResponse = NfdSearchRecord[] | { nfds?: NfdSearchRecord[] };
type VaultSendTuple = [type: string, transaction: string];

function nfdSearchRecords(response: NfdSearchResponse): NfdSearchRecord[] {
	return Array.isArray(response) ? response : (response.nfds ?? []);
}

function toNsRecord(value: unknown): NsRecord | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const record = value as { name?: unknown; appID?: unknown; timeExpires?: unknown };

	if (typeof record.name !== "string") {
		return undefined;
	}

	return {
		name: record.name,
		appID: typeof record.appID === "number" ? record.appID : undefined,
		timeExpires: typeof record.timeExpires === "string" ? record.timeExpires : undefined,
	};
}

function nfdUrl(network: Network): string | undefined {
	return network.nfdUrl?.replace(/\/$/, "");
}

export async function getNfdsByAddress(
	baseUrl: string,
	address: string,
	fetchJson: FetchJson,
): Promise<unknown> {
	const params = new URLSearchParams({ address, allowUnverified: "false" });
	const response = await fetchJson<Record<string, unknown>>(`${baseUrl.replace(/\/$/, "")}/nfd/v2/address?${params}`);

	return response[address];
}

export async function searchNames({
	query,
	network,
	fetchJson,
	limit = 20,
}: SearchNamesOptions): Promise<NsLookup[]> {
	const baseUrl = nfdUrl(network);

	if (!baseUrl || query.trim().length === 0) {
		return [];
	}

	const params = new URLSearchParams({ prefix: query, view: "thumbnail", limit: String(limit) });
	const response = await fetchJson<NfdSearchResponse>(`${baseUrl}/nfd/v2/search?${params}`);

	return nfdSearchRecords(response)
		.filter((record): record is Required<Pick<NfdSearchRecord, "name" | "depositAccount">> => {
			return typeof record.name === "string" && typeof record.depositAccount === "string";
		})
		.map((record) => ({ title: record.name, value: record.depositAccount }));
}

export async function reverseLookupNames({
	addresses,
	network,
	fetchJson,
	batchSize = 20,
}: ReverseLookupNamesOptions): Promise<NsObject> {
	const baseUrl = nfdUrl(network);

	if (!baseUrl || addresses.length === 0) {
		return {};
	}

	const result: NsObject = {};

	for (let index = 0; index < addresses.length; index += batchSize) {
		const batch = addresses.slice(index, index + batchSize);
		const params = new URLSearchParams({ view: "brief" });

		batch.forEach((address) => params.append("address", address));

		const response = await fetchJson<Record<string, unknown>>(`${baseUrl}/nfd/lookup?${params}`);

		for (const address of batch) {
			const record = toNsRecord(response[address]);

			if (record) {
				result[address] = record;
			}
		}
	}

	return result;
}

function assertVaultSendResponse(value: unknown): asserts value is VaultSendTuple[] {
	if (!Array.isArray(value)) {
		throw new Error("NFD vault send response must be an array");
	}

	value.forEach((item, index) => {
		if (
			!Array.isArray(item) ||
			item.length < 2 ||
			typeof item[0] !== "string" ||
			typeof item[1] !== "string"
		) {
			throw new Error(`NFD vault send response item ${index} is invalid`);
		}
	});
}

export async function buildVaultSendTransactions<TRequest = unknown>({
	nfdUrl,
	name,
	request,
	fetchJson,
}: BuildVaultSendTransactionsOptions<TRequest>): Promise<VaultSendTransactionsResult> {
	const response = await fetchJson<unknown>(`${nfdUrl.replace(/\/$/, "")}/nfd/vault/sendFrom/${name}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(request),
	});

	assertVaultSendResponse(response);

	let hasSignedTransaction = false;
	const unsignedIndexes: number[] = [];
	const txns = response.map(([type, encodedTransaction], index) => {
		const bytes = base64ToBytes(encodedTransaction);

		if (type === "u") {
			unsignedIndexes.push(index);

			return decodeUnsignedTransaction(bytes);
		}

		hasSignedTransaction = true;

		return decodeSignedTransaction(bytes).txn;
	});

	return {
		txns,
		indexesToSign: hasSignedTransaction ? unsignedIndexes : undefined,
	};
}
