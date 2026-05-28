import type { Network, SignTxnsOpts, WalletTransaction } from "../types";
import type { SignDataMetadata } from "../signing";

export type WalletProtocolRequestAction = "connect" | "sign" | "data" | "network" | "swap";
export type WalletProtocolResponseAction = "ready" | "connect" | "signed" | "added" | "error" | "close";

export interface ReadyProtocolResponse {
	action: "ready";
}

export interface CloseProtocolResponse {
	action: "close";
}

export interface ProtocolErrorResponse {
	action: "error";
	code: number;
	error: string;
	data?: unknown;
}

export interface ConnectProtocolRequest {
	action: "connect";
	name?: string;
	genesisID: string;
	debug?: boolean;
}

export interface ConnectProtocolResponse {
	action: "connect";
	addrs: string[];
	debug: boolean;
}

export interface SignTransactionsProtocolRequest {
	action: "sign";
	txns: WalletTransaction[];
	opts?: SignTxnsOpts;
}

export interface SignTransactionsProtocolResponse {
	action: "signed";
	txns: Array<Uint8Array | null>;
}

export interface SignDataProtocolRequest {
	action: "data";
	data: string;
	metadata: SignDataMetadata;
	authenticatorData: Uint8Array;
}

export interface SignDataWalletProtocolResponse {
	action: "signed";
	signature: Uint8Array;
	signer: string;
	authenticatorData: Uint8Array;
}

export interface AddNetworkProtocolRequest {
	action: "network";
	network: unknown;
}

export interface AddNetworkProtocolResponse {
	action: "added";
	network: Network;
	networks?: Network[];
}

export interface SwapProtocolRequest {
	action: "swap";
	tx1: string;
	tx2: string;
}

export type WalletProtocolRequest =
	| ConnectProtocolRequest
	| SignTransactionsProtocolRequest
	| SignDataProtocolRequest
	| AddNetworkProtocolRequest
	| SwapProtocolRequest;

export type WalletProtocolResponse =
	| ReadyProtocolResponse
	| CloseProtocolResponse
	| ProtocolErrorResponse
	| ConnectProtocolResponse
	| SignTransactionsProtocolResponse
	| SignDataWalletProtocolResponse
	| AddNetworkProtocolResponse;

export function buildReadyResponse(): ReadyProtocolResponse {
	return { action: "ready" };
}

export function buildCloseResponse(): CloseProtocolResponse {
	return { action: "close" };
}
