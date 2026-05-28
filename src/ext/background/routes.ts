import { banjoExtensionActionRoutes } from "$core/adapters/protocol-transports";
import type { WalletProtocolRequestAction } from "$core/protocol";
import type { BanjoPageRequest } from "../protocol";

export function actionFromRoute(route: string | null): WalletProtocolRequestAction | undefined {
	if (!route) {
		return undefined;
	}

	return (Object.entries(banjoExtensionActionRoutes).find(([, value]) => value === route)?.[0] ?? route) as
		| WalletProtocolRequestAction
		| undefined;
}

export function buildSidePanelPath(args: {
	request: BanjoPageRequest;
	tabId: number;
	origin?: string;
}): string {
	const route = banjoExtensionActionRoutes[args.request.action];
	const params = new URLSearchParams({
		action: route,
		requestId: args.request.id,
		tabId: String(args.tabId),
	});

	if (args.origin) {
		params.set("origin", args.origin);
	}

	for (const key of ["name", "genesisID", "tx1", "tx2"] as const) {
		const value = args.request[key];

		if (typeof value === "string") {
			params.set(key, value);
		}
	}

	return `index.html?${params.toString()}`;
}

export const refererRuleDomains = ["ipfs.io", "nodely.io", "nodely.dev"] as const;

export function buildRefererRules(referer = "https://banjo.wallet/") {
	return refererRuleDomains.map((domain, index) => ({
		id: 10_000 + index,
		priority: 1,
		action: {
			type: "modifyHeaders" as const,
			requestHeaders: [{ header: "referer", operation: "set" as const, value: referer }],
		},
		condition: {
			urlFilter: `||${domain}/`,
			resourceTypes: ["xmlhttprequest" as const],
		},
	}));
}
