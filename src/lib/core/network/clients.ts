import { Algodv2, Indexer, Kmd } from "algosdk";
import type { Network, NetworkClient } from "../types";

export type NetworkService = "algod" | "indexer";

export class NetworkClientError extends Error {
	constructor(
		message: string,
		public readonly network: string,
		public readonly service: "algod" | "indexer" | "kmd",
	) {
		super(message);
		this.name = "NetworkClientError";
	}
}

export function selectNetworkClientConfig(
	network: Network,
	service: NetworkService,
	useFallback = false,
): NetworkClient | undefined {
	if (useFallback && network.fallback?.[service]) {
		return network.fallback[service];
	}

	return network[service];
}

export function createAlgodClient(network: Network, useFallback = false): Algodv2 {
	const config = selectNetworkClientConfig(network, "algod", useFallback);

	if (!config) {
		throw new NetworkClientError(`Network ${network.name} has no algod endpoint`, network.name, "algod");
	}

	return new Algodv2(config.token, config.url, config.port);
}

export function createIndexerClient(network: Network, useFallback = false): Indexer | undefined {
	const config = selectNetworkClientConfig(network, "indexer", useFallback);

	if (!config) {
		return undefined;
	}

	return new Indexer(config.token, config.url, config.port);
}

export function createKmdClient(network: Network): Kmd {
	if (!network.kmd) {
		throw new NetworkClientError(`Network ${network.name} has no KMD endpoint`, network.name, "kmd");
	}

	return new Kmd(network.kmd.token, network.kmd.url, network.kmd.port);
}
