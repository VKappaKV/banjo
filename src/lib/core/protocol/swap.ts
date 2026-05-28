import type { Algodv2 } from "algosdk";
import type { Network } from "../types";
import {
	assembleSwapSignedTransactions,
	buildSwapAcceptancePlan,
	validateSwapProposal,
	type SwapAcceptancePlan,
	type ValidatedSwapProposal,
} from "../transactions";
import type { SwapProtocolRequest } from "./models";

export async function prepareSwapProtocolRequest(args: {
	request: SwapProtocolRequest;
	networks: Network[];
	algodForNetwork: (network: Network) => Algodv2;
}): Promise<ValidatedSwapProposal> {
	return validateSwapProposal({
		tx1: args.request.tx1,
		tx2: args.request.tx2,
		networks: args.networks,
		algodForNetwork: args.algodForNetwork,
	});
}

export function buildSwapProtocolAcceptancePlan(validated: ValidatedSwapProposal): SwapAcceptancePlan {
	return buildSwapAcceptancePlan(validated);
}

export function completeSwapProtocolAcceptance(args: {
	signedTxn1: Uint8Array;
	signedTxn2: Uint8Array;
}): [Uint8Array, Uint8Array] {
	return assembleSwapSignedTransactions(args);
}
