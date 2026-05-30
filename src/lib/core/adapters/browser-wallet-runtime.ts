import type { BanjoLogger } from "$core/logging";
import type { WalletRuntime } from "../runtime";

export interface BrowserWalletRuntimeOptions {
	onNotify?: WalletRuntime["notify"];
	onOverlay?: WalletRuntime["setOverlay"];
	onLoading?: WalletRuntime["setLoading"];
	logger?: BanjoLogger;
	onConfirm?: WalletRuntime["confirm"];
	onSendMessage?: WalletRuntime["sendMessage"];
}

export function createBrowserWalletRuntime(options: BrowserWalletRuntimeOptions = {}): WalletRuntime {
	return {
		logger: options.logger,
		notify(message, color = "info", timeout = color === "error" ? 15000 : 4000) {
			options.logger?.info({ namespace: "ui", event: "notify", fields: { color, message, timeout } });
			options.onNotify?.(message, color, timeout);
		},
		setOverlay(value) {
			options.logger?.debug({ namespace: "ui", event: "overlay", fields: { value } });
			options.onOverlay?.(value);
		},
		setLoading(delta) {
			options.logger?.debug({ namespace: "ui", event: "loading", fields: { delta } });
			options.onLoading?.(delta);
		},
		logDebug(label, value) {
			options.logger?.debug({ namespace: "legacy", event: label, fields: { value } });
		},
		confirm(message) {
			return options.onConfirm?.(message) ?? globalThis.confirm(message);
		},
		closeWindow() {
			globalThis.close();
		},
		sendMessage(message, tabId) {
			return options.onSendMessage?.(message, tabId);
		},
	};
}
