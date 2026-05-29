import {
	buildCloseResponse,
	buildReadyResponse,
	normalizeProtocolError,
	serializeSignDataResponseForExtension,
	serializeSignTransactionsResponseForExtension,
	type WalletProtocolRequestAction,
	type WalletProtocolResponse,
} from "$core/protocol";

export interface DappPageRequest {
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

export interface DappPendingRequest {
	request: DappPageRequest;
	tabId?: number;
	origin?: string;
}

interface ExtensionRuntime {
	sendMessage(message: unknown): Promise<unknown>;
}

function extensionRuntime(): ExtensionRuntime | undefined {
	return (globalThis as typeof globalThis & { chrome?: { runtime?: ExtensionRuntime } }).chrome?.runtime;
}

function searchParams(): URLSearchParams {
	return new URLSearchParams(globalThis.location?.search ?? "");
}

function actionFromParams(params: URLSearchParams): WalletProtocolRequestAction | undefined {
	const action = params.get("action");

	if (action === "auth") return "data";
	if (action === "connect" || action === "sign" || action === "data" || action === "network" || action === "swap") return action;
	return undefined;
}

function requestFromParams(params: URLSearchParams): DappPageRequest | undefined {
	const action = actionFromParams(params);
	if (!action) return undefined;

	return {
		id: params.get("requestId") ?? `query-${Date.now()}`,
		action,
		name: params.get("name") ?? undefined,
		genesisID: params.get("genesisID") ?? undefined,
		tx1: params.get("tx1") ?? undefined,
		tx2: params.get("tx2") ?? undefined,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProtocolAction(value: unknown): value is WalletProtocolRequestAction {
	return value === "connect" || value === "sign" || value === "data" || value === "network" || value === "swap";
}

function coercePageRequest(value: unknown, fallbackId: string | undefined): DappPageRequest | undefined {
	const request = isRecord(value) && isRecord(value.request) ? value.request : value;
	if (!isRecord(request) || !isProtocolAction(request.action)) return undefined;

	return {
		...request,
		id: typeof request.id === "string" ? request.id : fallbackId ?? `web-${Date.now()}`,
		action: request.action,
	};
}

function openerRequestFromMessage(args: {
	params: URLSearchParams;
	expectedAction: WalletProtocolRequestAction;
	origin?: string;
	timeoutMs?: number;
}): Promise<DappPageRequest | undefined> {
	const opener = globalThis.opener;
	const canListen = typeof globalThis.addEventListener === "function" && typeof globalThis.removeEventListener === "function";
	if (!opener || !canListen) return Promise.resolve(undefined);

	return new Promise((resolve) => {
		const timeout = globalThis.setTimeout(() => finish(undefined), args.timeoutMs ?? 1500);
		const fallbackId = args.params.get("requestId") ?? undefined;

		function finish(request: DappPageRequest | undefined) {
			globalThis.clearTimeout(timeout);
			globalThis.removeEventListener("message", onMessage);
			resolve(request);
		}

		function onMessage(event: MessageEvent<unknown>) {
			if (args.origin && event.origin && event.origin !== args.origin) return;

			const request = coercePageRequest(event.data, fallbackId);
			if (!request || request.action !== args.expectedAction) return;

			finish(request);
		}

		globalThis.addEventListener("message", onMessage);
		opener.postMessage(buildReadyResponse(), args.origin ?? "*");
	});
}

function serializeResponseForExtension(action: WalletProtocolRequestAction, response: WalletProtocolResponse): unknown {
	if (action === "sign" && response.action === "signed" && "txns" in response) {
		return serializeSignTransactionsResponseForExtension(response);
	}

	if (action === "data" && response.action === "signed" && "signature" in response) {
		return serializeSignDataResponseForExtension(response);
	}

	return response;
}

export class DappRequestState {
	request = $state<DappPageRequest | undefined>();
	tabId = $state<number | undefined>();
	origin = $state<string | undefined>();
	loading = $state(false);
	error = $state("");
	done = $state(false);

	get hasRequest() {
		return !!this.request;
	}

	load = async (): Promise<void> => {
		this.loading = true;
		this.error = "";

		try {
			const params = searchParams();
			const requestId = params.get("requestId");
			const runtime = extensionRuntime();
			this.origin = params.get("origin") ?? undefined;

			if (requestId && runtime) {
				const pending = await runtime.sendMessage({ type: "banjo-panel-ready", requestId }) as DappPendingRequest | null;

				if (!pending?.request) {
					throw new Error("No pending dApp request was found.");
				}

				this.request = pending.request;
				this.tabId = pending.tabId;
				this.origin = pending.origin;
				return;
			}

			const action = actionFromParams(params);
			if (action) {
				const openerRequest = await openerRequestFromMessage({
					params,
					expectedAction: action,
					origin: this.origin,
				});

				if (openerRequest) {
					this.request = openerRequest;
					this.tabId = undefined;
					return;
				}
			}

			this.request = requestFromParams(params);
			this.tabId = params.has("tabId") ? Number(params.get("tabId")) : undefined;
		} catch (error) {
			this.error = error instanceof Error ? error.message : "Failed to load dApp request.";
		} finally {
			this.loading = false;
		}
	};

	respond = async (response: WalletProtocolResponse): Promise<void> => {
		if (!this.request) return;

		const runtime = extensionRuntime();
		const serialized = serializeResponseForExtension(this.request.action, response);

		if (runtime && this.tabId != null) {
			await runtime.sendMessage({
				type: "banjo-panel-response",
				tabId: this.tabId,
				requestId: this.request.id,
				action: this.request.action,
				response: serialized,
			});
		} else if (globalThis.opener) {
			globalThis.opener.postMessage(serialized, this.origin ?? "*");
		}

		this.done = true;
	};

	reject = async (): Promise<void> => {
		await this.respond(buildCloseResponse());
	};

	fail = async (error: unknown): Promise<void> => {
		await this.respond(normalizeProtocolError(error));
	};
}
