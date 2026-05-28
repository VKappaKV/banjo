import type { SigningApprovalController, WalletSignedTransaction } from "../signing";
import type { WalletTransaction } from "../types";
import type { WalletProtocolRequestAction, WalletProtocolResponse } from "../protocol";

export interface WalletProtocolTarget {
	origin?: string;
	tabId?: number;
}

export interface WalletMessageTransport {
	send(message: WalletProtocolResponse, target?: WalletProtocolTarget): Promise<void>;
}

export interface PostMessageTarget {
	postMessage(message: WalletProtocolResponse, targetOrigin: string): void;
}

export interface WindowOpenerSource {
	opener: PostMessageTarget | null;
}

export class WindowOpenerTransport implements WalletMessageTransport {
	constructor(
		private readonly source: WindowOpenerSource,
		private readonly defaultOrigin = "*",
	) {}

	async send(message: WalletProtocolResponse, target?: WalletProtocolTarget): Promise<void> {
		if (!this.source.opener) {
			throw new Error("Window opener is not available");
		}

		this.source.opener.postMessage(message, target?.origin ?? this.defaultOrigin);
	}
}

export interface ExtensionMessageSender {
	send(tabId: number, message: WalletProtocolResponse): Promise<void> | void;
}

export class ExtensionTabTransport implements WalletMessageTransport {
	constructor(
		private readonly sender: ExtensionMessageSender,
		private readonly options: { tabId?: number; afterSend?: () => Promise<void> | void } = {},
	) {}

	async send(message: WalletProtocolResponse, target?: WalletProtocolTarget): Promise<void> {
		const tabId = target?.tabId ?? this.options.tabId;

		if (tabId == null) {
			throw new Error("Extension tab id is required");
		}

		await this.sender.send(tabId, message);
		await this.options.afterSend?.();
	}
}

export interface InternalSigningAdapter {
	requestWalletTransactionApproval(walletTxns: WalletTransaction[]): Promise<WalletSignedTransaction[]>;
}

export function createInternalModalSigningAdapter(adapter: InternalSigningAdapter): SigningApprovalController {
	return {
		requestSignatureReview: (request) => adapter.requestWalletTransactionApproval(request),
	};
}

export const banjoExtensionActionRoutes: Record<WalletProtocolRequestAction, string> = {
	connect: "connect",
	sign: "sign",
	data: "auth",
	network: "network",
	swap: "swap",
};

export function buildBanjoExtensionPanelPath(args: {
	action: WalletProtocolRequestAction;
	basePath?: string;
	params?: Record<string, string | number | boolean | undefined>;
}): string {
	const basePath = args.basePath ?? "/";
	const route = banjoExtensionActionRoutes[args.action];
	const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
	const params = new URLSearchParams();

	for (const [key, value] of Object.entries(args.params ?? {})) {
		if (value !== undefined) {
			params.set(key, String(value));
		}
	}

	const query = params.toString();

	return `${prefix}${route}${query ? `?${query}` : ""}`;
}
