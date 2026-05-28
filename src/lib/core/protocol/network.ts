import type { Network } from "../types";
import type { WalletStorage } from "../storage";
import { addCustomNetworkFromDapp, validateAddNetworkRequest } from "../network";
import type { AddNetworkProtocolResponse } from "./models";

export function validateDappNetworkRequest(network: unknown, knownNetworks: Network[]): Network {
	return validateAddNetworkRequest(network, knownNetworks);
}

export async function approveDappNetworkRequest(args: {
	storage: WalletStorage;
	network: unknown;
	knownNetworks?: Network[];
}): Promise<AddNetworkProtocolResponse> {
	const knownNetworks = args.knownNetworks ?? [];
	const network = validateDappNetworkRequest(args.network, knownNetworks);
	const networks = await addCustomNetworkFromDapp(args.storage, network, knownNetworks);

	return { action: "added", network, networks };
}
