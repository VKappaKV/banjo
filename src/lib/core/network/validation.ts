import type { Network, NetworkClient } from "../types";

export interface NetworkValidationResult {
	valid: boolean;
	network?: Network;
	networks?: Network[];
	errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNetworkClient(value: unknown): value is NetworkClient {
	return (
		isRecord(value) &&
		typeof value.url === "string" &&
		typeof value.port === "string" &&
		typeof value.token === "string"
	);
}

function validateNetwork(value: unknown): { network?: Network; errors: string[] } {
	const errors: string[] = [];

	if (!isRecord(value)) {
		return { errors: ["Network must be an object"] };
	}

	if (typeof value.name !== "string" || value.name.length === 0) {
		errors.push("Network name is required");
	}

	if (!isNetworkClient(value.algod)) {
		errors.push("Network algod endpoint is invalid");
	}

	if (value.indexer !== undefined && !isNetworkClient(value.indexer)) {
		errors.push("Network indexer endpoint is invalid");
	}

	if (value.kmd !== undefined && !isNetworkClient(value.kmd)) {
		errors.push("Network KMD endpoint is invalid");
	}

	if (value.fallback !== undefined) {
		if (!isRecord(value.fallback)) {
			errors.push("Network fallback is invalid");
		} else {
			if (!isNetworkClient(value.fallback.algod)) {
				errors.push("Network fallback algod endpoint is invalid");
			}

			if (!isNetworkClient(value.fallback.indexer)) {
				errors.push("Network fallback indexer endpoint is invalid");
			}
		}
	}

	if (typeof value.genesisID !== "string" || value.genesisID.length === 0) {
		errors.push("Network genesisID is required");
	}

	if (value.genesisHash !== undefined && typeof value.genesisHash !== "string") {
		errors.push("Network genesisHash must be a string");
	}

	if (typeof value.explorer !== "string") {
		errors.push("Network explorer is required");
	}

	if (value.nfdUrl !== undefined && typeof value.nfdUrl !== "string") {
		errors.push("Network nfdUrl must be a string");
	}

	if (value.inboxRouter !== undefined && typeof value.inboxRouter !== "number") {
		errors.push("Network inboxRouter must be a number");
	}

	if (value.lutier !== undefined) {
		if (!isRecord(value.lutier)) {
			errors.push("Network lutier is invalid");
		} else if (typeof value.lutier.app !== "number" || typeof value.lutier.asset !== "number") {
			errors.push("Network lutier app and asset are required");
		}
	}

	return {
		errors,
		network: errors.length === 0 ? (value as unknown as Network) : undefined,
	};
}

export function validateNetworkConfig(value: unknown): NetworkValidationResult {
	const { network, errors } = validateNetwork(value);

	return {
		valid: errors.length === 0,
		network,
		errors,
	};
}

export function validateCustomNetworkList(value: unknown): NetworkValidationResult {
	if (!Array.isArray(value)) {
		return { valid: false, errors: ["Custom networks must be an array"] };
	}

	const networks: Network[] = [];
	const errors: string[] = [];

	value.forEach((item, index) => {
		const result = validateNetwork(item);

		if (result.network) {
			networks.push(result.network);
		}

		result.errors.forEach((error) => errors.push(`Network ${index}: ${error}`));
	});

	return {
		valid: errors.length === 0,
		networks: errors.length === 0 ? networks : undefined,
		errors,
	};
}

export function validateDappAddNetwork(value: unknown, knownGenesisIds: string[]): NetworkValidationResult {
	const result = validateNetworkConfig(value);

	if (!result.valid || !result.network) {
		return result;
	}

	if (knownGenesisIds.includes(result.network.genesisID)) {
		return {
			valid: false,
			errors: [`Network genesisID ${result.network.genesisID} is already configured`],
		};
	}

	return result;
}
