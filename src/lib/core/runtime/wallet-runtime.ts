export type WalletNotificationColor = "info" | "success" | "warning" | "error";

export interface WalletRuntime {
	notify(message: string, color?: WalletNotificationColor, timeout?: number): void;
	setOverlay?(value: boolean): void;
	setLoading?(delta: number): void;
	logDebug?(label: string, value: unknown): void;
	confirm?(message: string): Promise<boolean> | boolean;
	closeWindow?(): void;
	sendMessage?(message: unknown, tabId?: number): Promise<void> | void;
}

export const noopWalletRuntime: WalletRuntime = {
	notify() {},
};
