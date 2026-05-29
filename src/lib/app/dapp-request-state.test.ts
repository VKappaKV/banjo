import { afterEach, describe, expect, it, vi } from "vitest";
import { DappRequestState } from "./dapp-request-state.svelte";

describe("DappRequestState", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("loads a query-param request when extension runtime is unavailable", async () => {
		vi.stubGlobal("location", { search: "?action=swap&requestId=req-1&tx1=one&tx2=two" });
		const state = new DappRequestState();

		await state.load();

		expect(state.request).toMatchObject({ id: "req-1", action: "swap", tx1: "one", tx2: "two" });
	});

	it("hydrates extension requests and serializes signed transactions for the page", async () => {
		vi.stubGlobal("location", { search: "?action=sign&requestId=req-2&tabId=7" });
		const messages: unknown[] = [];
		vi.stubGlobal("chrome", {
			runtime: {
				sendMessage: vi.fn(async (message: unknown) => {
					messages.push(message);
					if ((message as { type?: string }).type === "banjo-panel-ready") {
						return { request: { id: "req-2", action: "sign" }, tabId: 7, origin: "https://dapp.example" };
					}

					return { ok: true };
				}),
			},
		});
		const state = new DappRequestState();

		await state.load();
		await state.respond({ action: "signed", txns: [Uint8Array.from([1, 2]), null] });

		expect(messages.at(-1)).toMatchObject({
			type: "banjo-panel-response",
			tabId: 7,
			requestId: "req-2",
			action: "sign",
			response: { action: "signed", txns: ["AQI=", null] },
		});
	});

	it("posts ready to an opener and receives the web request", async () => {
		vi.stubGlobal("location", { search: "?action=connect&origin=https%3A%2F%2Fdapp.example" });
		const posted: unknown[] = [];
		let messageHandler: ((event: MessageEvent<unknown>) => void) | undefined;
		vi.stubGlobal("opener", { postMessage: vi.fn((message: unknown) => posted.push(message)) });
		vi.stubGlobal("addEventListener", vi.fn((type: string, handler: EventListenerOrEventListenerObject) => {
			if (type === "message") messageHandler = handler as (event: MessageEvent<unknown>) => void;
		}));
		vi.stubGlobal("removeEventListener", vi.fn());
		const state = new DappRequestState();
		const loading = state.load();

		await Promise.resolve();
		messageHandler?.({
			data: { id: "web-1", action: "connect", genesisID: "testnet-v1", name: "Example dApp" },
			origin: "https://dapp.example",
		} as MessageEvent<unknown>);
		await loading;

		expect(posted[0]).toEqual({ action: "ready" });
		expect(state.request).toMatchObject({ id: "web-1", action: "connect", genesisID: "testnet-v1" });

		await state.respond({ action: "connect", addrs: ["ADDR"], debug: false });

		expect(posted[1]).toEqual({ action: "connect", addrs: ["ADDR"], debug: false });
	});
});
