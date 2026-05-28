type BanjoAction = "connect" | "sign" | "data" | "network" | "swap";

interface BanjoRequest {
	id: string;
	action: BanjoAction;
	[key: string]: unknown;
}

interface BanjoClient {
	isBanjo: true;
	request<T = unknown>(request: Omit<BanjoRequest, "id"> & { id?: string }): Promise<T>;
	connect(args: { name?: string; genesisID: string }): Promise<unknown>;
	signTxns(txns: unknown, opts?: unknown): Promise<unknown>;
	signData(args: { data: unknown; metadata: unknown; authenticatorData: unknown }): Promise<unknown>;
	addNetwork(network: unknown): Promise<unknown>;
	swap(args: { tx1: string; tx2: string }): Promise<unknown>;
}

declare global {
	interface Window {
		banjo?: BanjoClient;
	}
}

const requestEvent = "banjo-connect";
const responseEvents: Record<BanjoAction, string> = {
	connect: "banjo-connect-response",
	sign: "banjo-sign-txns-response",
	data: "banjo-sign-data-response",
	network: "banjo-add-network-response",
	swap: "banjo-swap-response",
};

function randomId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function request<T = unknown>(input: Omit<BanjoRequest, "id"> & { id?: string }): Promise<T> {
	const requestDetail = { ...input, id: input.id ?? randomId() } as BanjoRequest;
	const responseEvent = responseEvents[requestDetail.action];

	return new Promise((resolve, reject) => {
		function onResponse(event: Event) {
			const detail = (event as CustomEvent).detail as { id?: string; response?: unknown; error?: unknown };

			if (detail?.id && detail.id !== requestDetail.id) {
				return;
			}

			window.removeEventListener(responseEvent, onResponse);

			if (detail?.error) {
				reject(detail.error);
				return;
			}

			resolve((detail?.response ?? detail) as T);
		}

		window.addEventListener(responseEvent, onResponse);
		window.dispatchEvent(new CustomEvent(requestEvent, { detail: requestDetail }));
	});
}

if (!window.banjo) {
	window.banjo = {
		isBanjo: true,
		request,
		connect: (args) => request({ action: "connect", ...args }),
		signTxns: (txns, opts) => request({ action: "sign", txns, opts }),
		signData: (args) => request({ action: "data", ...args }),
		addNetwork: (network) => request({ action: "network", network }),
		swap: (args) => request({ action: "swap", ...args }),
	};
}
