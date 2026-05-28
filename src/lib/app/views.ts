export const walletViews = [
	"accounts",
	"add-account",
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
	label: string;
	description: string;
}

export const walletViewDefinitions: WalletViewDefinition[] = [
	{ value: "accounts", label: "Accounts", description: "Balances and refreshed wallet accounts" },
	{ value: "add-account", label: "Add Account", description: "Onboarding flows start in Milestone 11" },
	{ value: "send", label: "Send", description: "Payment and asset send flows" },
	{ value: "sign", label: "Sign", description: "Transaction review and signing" },
	{ value: "connect", label: "Connect", description: "dApp account connection approval" },
	{ value: "network-add", label: "Network Add", description: "dApp custom network approval" },
	{ value: "swap", label: "Swap", description: "Atomic swap acceptance" },
	{ value: "settings", label: "Settings", description: "Wallet preferences and network settings" },
	{ value: "multisig", label: "Multisig", description: "ARC-55 account workflows" },
];

export function getWalletViewDefinition(view: WalletView): WalletViewDefinition {
	return walletViewDefinitions.find((definition) => definition.value === view) ?? walletViewDefinitions[0]!;
}
