import type { WalletProtocolRequestAction, WalletProtocolResponse } from "$core/protocol";

export const banjoRequestEvent = "banjo-connect";

export const banjoResponseEvents: Record<WalletProtocolRequestAction, string> = {
	connect: "banjo-connect-response",
	sign: "banjo-sign-txns-response",
	data: "banjo-sign-data-response",
	network: "banjo-add-network-response",
	swap: "banjo-swap-response",
};

export interface BanjoPageRequest {
	id: string;
	action: WalletProtocolRequestAction;
	name?: string;
	genesisID?: string;
	txns?: unknown;
	opts?: unknown;
	data?: unknown;
	metadata?: unknown;
	authenticatorData?: unknown;
	network?: unknown;
	tx1?: string;
	tx2?: string;
}

export interface BanjoExtensionRequestMessage {
	type: "banjo-extension-request";
	request: BanjoPageRequest;
	origin: string;
}

export interface BanjoExtensionResponseMessage {
	type: "banjo-extension-response";
	requestId: string;
	action: WalletProtocolRequestAction;
	response: WalletProtocolResponse | Record<string, unknown>;
}

export interface BanjoPanelReadyMessage {
	type: "banjo-panel-ready";
	requestId?: string;
}

export interface BanjoPanelResponseMessage {
	type: "banjo-panel-response";
	tabId: number;
	requestId: string;
	action: WalletProtocolRequestAction;
	response: WalletProtocolResponse | Record<string, unknown>;
}

export type BanjoExtensionMessage =
	| BanjoExtensionRequestMessage
	| BanjoExtensionResponseMessage
	| BanjoPanelReadyMessage
	| BanjoPanelResponseMessage;
