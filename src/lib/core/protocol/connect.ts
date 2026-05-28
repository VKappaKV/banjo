import algosdk from "algosdk";
import type { Network } from "../types";
import { ProtocolError, protocolErrorCodes } from "./errors";
import type { ConnectProtocolResponse } from "./models";

function normalizeGenesisId(genesisID: string): string {
	return genesisID === "sandnet-v1" ? "dockernet-v1" : genesisID;
}

export function resolveConnectNetwork(args: {
	genesisID: string;
	networks: Network[];
}): Network {
	const genesisID = normalizeGenesisId(args.genesisID);
	const network = args.networks.find((item) => item.genesisID === genesisID);

	if (!network) {
		throw new ProtocolError("Unknown Network", protocolErrorCodes.invalidRequest);
	}

	return network;
}

export function buildConnectResponse(addresses: string[], debug = false): ConnectProtocolResponse {
	for (const address of addresses) {
		if (!algosdk.isValidAddress(address)) {
			throw new ProtocolError("Invalid Address", protocolErrorCodes.invalidRequest, { address });
		}
	}

	return { action: "connect", addrs: addresses, debug };
}
