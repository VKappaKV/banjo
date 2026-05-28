type BanjoAction = "connect" | "sign" | "data" | "network" | "swap";

interface ChromeRuntime {
	getURL(path: string): string;
	sendMessage(message: unknown): Promise<unknown>;
	onMessage: {
		addListener(listener: (message: unknown) => void): void;
	};
}

declare const chrome: { runtime: ChromeRuntime };

const requestEvent = "banjo-connect";
const responseEvents: Record<BanjoAction, string> = {
	connect: "banjo-connect-response",
	sign: "banjo-sign-txns-response",
	data: "banjo-sign-data-response",
	network: "banjo-add-network-response",
	swap: "banjo-swap-response",
};

function injectClient(): void {
	const script = document.createElement("script");
	script.type = "module";
	script.src = chrome.runtime.getURL("assets/page-client.js");
	script.onload = () => script.remove();
	(document.head || document.documentElement).append(script);
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

function normalizeResponseForPage(response: Record<string, unknown>): Record<string, unknown> {
	if (response.action !== "signed") {
		return response;
	}

	if (Array.isArray(response.txns)) {
		return {
			...response,
			txns: response.txns.map((txn) => (typeof txn === "string" ? base64ToBytes(txn) : txn)),
		};
	}

	return {
		...response,
		signature: typeof response.signature === "string" ? base64ToBytes(response.signature) : response.signature,
		signer: typeof response.signer === "string" ? base64ToBytes(response.signer) : response.signer,
		authenticatorData: typeof response.authenticatorData === "string"
			? base64ToBytes(response.authenticatorData)
			: response.authenticatorData,
	};
}

injectClient();

window.addEventListener(requestEvent, (event) => {
	const detail = (event as CustomEvent).detail as { id?: string; action?: BanjoAction };

	if (!detail?.id || !detail.action) {
		return;
	}

	void chrome.runtime.sendMessage({
		type: "banjo-extension-request",
		request: detail,
		origin: window.location.origin,
	});
});

chrome.runtime.onMessage.addListener((message) => {
	const typed = message as {
		type?: string;
		requestId?: string;
		action?: BanjoAction;
		response?: Record<string, unknown>;
	};

	if (typed.type !== "banjo-extension-response" || !typed.action || !typed.response) {
		return;
	}

	window.dispatchEvent(new CustomEvent(responseEvents[typed.action], {
		detail: {
			id: typed.requestId,
			response: normalizeResponseForPage(typed.response),
		},
	}));
});
