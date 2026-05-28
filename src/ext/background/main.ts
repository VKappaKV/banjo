import type {
	BanjoExtensionMessage,
	BanjoExtensionRequestMessage,
	BanjoPanelReadyMessage,
	BanjoPanelResponseMessage,
	BanjoPageRequest,
} from "../protocol";
import { buildRefererRules, buildSidePanelPath } from "./routes";

interface ChromeTab {
	id?: number;
}

interface ChromeRuntimeSender {
	tab?: ChromeTab;
}

interface ChromeApi {
	runtime: {
		onInstalled: { addListener(listener: () => void): void };
		onMessage: {
			addListener(
				listener: (
					message: BanjoExtensionMessage,
					sender: ChromeRuntimeSender,
					sendResponse: (response?: unknown) => void,
				) => boolean | void,
			): void;
		};
	};
	sidePanel?: {
		setOptions(options: { tabId: number; path: string; enabled: boolean }): Promise<void>;
		open(options: { tabId: number }): Promise<void>;
	};
	tabs: {
		sendMessage(tabId: number, message: unknown): Promise<void>;
	};
	declarativeNetRequest?: {
		updateDynamicRules(options: { removeRuleIds: number[]; addRules: unknown[] }): Promise<void>;
	};
}

declare const chrome: ChromeApi;

const pendingRequests = new Map<string, { request: BanjoPageRequest; tabId: number; origin?: string }>();

async function openSidePanel(message: BanjoExtensionRequestMessage, tabId: number): Promise<void> {
	const path = buildSidePanelPath({ request: message.request, tabId, origin: message.origin });
	pendingRequests.set(message.request.id, { request: message.request, tabId, origin: message.origin });

	await chrome.sidePanel?.setOptions({ tabId, path, enabled: true });
	await chrome.sidePanel?.open({ tabId });
}

async function installRefererRules(): Promise<void> {
	const rules = buildRefererRules();

	await chrome.declarativeNetRequest?.updateDynamicRules({
		removeRuleIds: rules.map((rule) => rule.id),
		addRules: rules,
	});
}

chrome.runtime.onInstalled.addListener(() => {
	void installRefererRules();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "banjo-extension-request") {
		const tabId = sender.tab?.id;

		if (tabId == null) {
			sendResponse({ ok: false, error: "No source tab" });
			return;
		}

		void openSidePanel(message, tabId)
			.then(() => sendResponse({ ok: true, requestId: message.request.id }))
			.catch((error: unknown) => {
				sendResponse({ ok: false, error: error instanceof Error ? error.message : "Failed to open Banjo" });
			});

		return true;
	}

	if (message.type === "banjo-panel-ready") {
		const ready = message as BanjoPanelReadyMessage;
		const request = ready.requestId
			? pendingRequests.get(ready.requestId)
			: Array.from(pendingRequests.values()).at(-1);

		sendResponse(request ?? null);
		return;
	}

	if (message.type === "banjo-panel-response") {
		const response = message as BanjoPanelResponseMessage;
		pendingRequests.delete(response.requestId);
		void chrome.tabs.sendMessage(response.tabId, {
			type: "banjo-extension-response",
			requestId: response.requestId,
			action: response.action,
			response: response.response,
		});
		sendResponse({ ok: true });
	}
});
