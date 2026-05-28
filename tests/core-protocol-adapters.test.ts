import { describe, expect, it, vi } from "vitest";
import {
	buildBanjoExtensionPanelPath,
	createInternalModalSigningAdapter,
	ExtensionTabTransport,
	WindowOpenerTransport,
} from "../src/lib/core/adapters";
import type { WalletProtocolResponse } from "../src/lib/core/protocol";
import type { WalletTransaction } from "../src/lib/core";

describe("wallet protocol adapters", () => {
	it("sends protocol responses to an injected window opener", async () => {
		const messages: Array<{ message: WalletProtocolResponse; origin: string }> = [];
		const transport = new WindowOpenerTransport({
			opener: {
				postMessage: (message, targetOrigin) => messages.push({ message, origin: targetOrigin }),
			},
		});

		await transport.send({ action: "ready" }, { origin: "https://dapp.example" });

		expect(messages).toEqual([{ message: { action: "ready" }, origin: "https://dapp.example" }]);
	});

	it("sends protocol responses through an injected extension tab sender", async () => {
		const send = vi.fn();
		const afterSend = vi.fn();
		const transport = new ExtensionTabTransport({ send }, { tabId: 42, afterSend });

		await transport.send({ action: "close" });

		expect(send).toHaveBeenCalledWith(42, { action: "close" });
		expect(afterSend).toHaveBeenCalledTimes(1);
	});

	it("delegates internal modal signing requests through a promise adapter", async () => {
		const walletTxns: WalletTransaction[] = [{ txn: "abc" }];
		const signed = [Uint8Array.from([1, 2, 3])];
		const requestWalletTransactionApproval = vi.fn(async () => signed);
		const controller = createInternalModalSigningAdapter({ requestWalletTransactionApproval });

		await expect(controller.requestSignatureReview(walletTxns)).resolves.toBe(signed);
		expect(requestWalletTransactionApproval).toHaveBeenCalledWith(walletTxns);
	});

	it("builds Banjo extension panel route paths without owning router behavior", () => {
		expect(buildBanjoExtensionPanelPath({
			action: "data",
			basePath: "/panel",
			params: { tabId: 7, name: "Example", ignored: undefined },
		})).toBe("/panel/auth?tabId=7&name=Example");
		expect(buildBanjoExtensionPanelPath({ action: "connect" })).toBe("/connect");
	});
});
