export const walletViews = [
	"accounts",
	"add-account",
	"account-detail",
	"send",
	"sign",
	"connect",
	"network-add",
	"swap",
	"settings",
	"multisig",
] as const;

export type WalletView = (typeof walletViews)[number];

export interface WalletViewDefinition {
	value: WalletView;
	path: string;
	label: string;
	description: string;
}

export const walletViewDefinitions: WalletViewDefinition[] = [
	{ value: "accounts", path: "/accounts", label: "Accounts", description: "Balances and refreshed wallet accounts" },
	{ value: "add-account", path: "/add-account", label: "Add Account", description: "Import or create new accounts" },
	{ value: "account-detail", path: "/account-detail/:addr", label: "Account Detail", description: "View account details, balance, assets, and signers" },
	{ value: "send", path: "/send", label: "Send", description: "Payment and asset send flows" },
	{ value: "sign", path: "/sign", label: "Sign", description: "Transaction review and signing" },
	{ value: "connect", path: "/connect", label: "Connect", description: "dApp account connection approval" },
	{ value: "network-add", path: "/network-add", label: "Network Add", description: "dApp custom network approval" },
	{ value: "swap", path: "/swap", label: "Swap", description: "Atomic swap acceptance" },
	{ value: "settings", path: "/settings", label: "Settings", description: "Wallet preferences and network settings" },
	{ value: "multisig", path: "/multisig", label: "Multisig", description: "ARC-55 account workflows" },
];

export function getWalletViewDefinition(view: WalletView): WalletViewDefinition {
	return walletViewDefinitions.find((definition) => definition.value === view) ?? walletViewDefinitions[0]!;
}

export function getWalletViewDefinitionByPath(path: string): WalletViewDefinition {
	const normalizedPath = path === "/" ? "/accounts" : path;

	return walletViewDefinitions.find((definition) => definition.path === normalizedPath) ?? walletViewDefinitions[0]!;
}

export function routePathForExtensionAction(action: string | null): string | undefined {
	switch (action) {
		case "connect":
			return "/connect";
		case "sign":
		case "auth":
			return "/sign";
		case "network":
			return "/network-add";
		case "swap":
			return "/swap";
		default:
			return undefined;
	}
}
