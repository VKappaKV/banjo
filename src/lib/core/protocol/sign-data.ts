import { sha256 } from "@noble/hashes/sha2.js";
import type { CredentialProvider, CryptoProvider, LedgerProvider } from "../runtime";
import type { WalletState } from "../state";
import type { WalletStorage } from "../storage";
import {
	formatSiwaSummary,
	signDataRequest,
	signDataRequestNeedsPassword,
	validateSignDataRequest,
	type ValidatedSignDataRequest,
} from "../signing";
import type { SignDataProtocolRequest, SignDataWalletProtocolResponse } from "./models";

export interface PreparedSignDataProtocolRequest {
	request: ValidatedSignDataRequest;
	title: string;
	summary: string;
}

export function hashDomainForAuthenticatorData(domain: string): Uint8Array {
	return sha256(new TextEncoder().encode(domain));
}

export async function prepareSignDataProtocolRequest(args: {
	request: SignDataProtocolRequest;
}): Promise<PreparedSignDataProtocolRequest> {
	const request = await validateSignDataRequest({
		data: args.request.data,
		metadata: args.request.metadata,
		authenticatorData: args.request.authenticatorData,
	});

	return {
		request,
		title: `Sign in to ${request.siwa.domain}`,
		summary: formatSiwaSummary(request.siwa),
	};
}

export function preparedSignDataRequestNeedsPassword(args: {
	prepared: PreparedSignDataProtocolRequest;
	state: WalletState;
}): boolean {
	return signDataRequestNeedsPassword({ request: args.prepared.request, state: args.state });
}

export async function completeSignDataProtocolRequest(args: {
	prepared: PreparedSignDataProtocolRequest;
	state: WalletState;
	storage: WalletStorage;
	password?: string;
	ledgerProvider: LedgerProvider;
	credentialProvider: CredentialProvider;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<SignDataWalletProtocolResponse> {
	const response = await signDataRequest({
		request: args.prepared.request,
		state: args.state,
		storage: args.storage,
		password: args.password,
		ledgerProvider: args.ledgerProvider,
		credentialProvider: args.credentialProvider,
		cryptoProvider: args.cryptoProvider,
		isWebResponse: true,
	});

	return {
		action: "signed",
		signature: response.signature as Uint8Array,
		signer: response.signer,
		authenticatorData: response.authenticatorData as Uint8Array,
	};
}
