import type { WalletRuntime } from "../runtime";

export interface BrowserWalletRuntimeOptions {
	onNotify?: WalletRuntime["notify"];
	onOverlay?: WalletRuntime["setOverlay"];
	onLoading?: WalletRuntime["setLoading"];
	onSendMessage?: WalletRuntime["sendMessage"];
}

export function createBrowserWalletRuntime(options: BrowserWalletRuntimeOptions = {}): WalletRuntime {
	return {
		notify(message, color = "info", timeout = color === "error" ? 15000 : 4000) {
			options.onNotify?.(message, color, timeout);
		},
		setOverlay(value) {
			options.onOverlay?.(value);
		},
		setLoading(delta) {
			options.onLoading?.(delta);
		},
		logDebug(label, value) {
			console.debug("[Banjo Debug]", label, value);
		},
		confirm(message) {
			return globalThis.confirm(message);
		},
		closeWindow() {
			globalThis.close();
		},
		sendMessage(message, tabId) {
			return options.onSendMessage?.(message, tabId);
		},
	};
}
