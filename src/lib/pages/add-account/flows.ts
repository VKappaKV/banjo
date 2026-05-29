export type AddAccountFlow =
	| "hot-import"
	| "hot-create"
	| "bip39-import"
	| "bip39-create"
	| "passkey"
	| "hd"
	| "ledger"
	| "falcon"
	| "kmd"
	| "watch"
	| "msig-create"
	| "msig-import";

export interface AddAccountFlowOption {
	flow: AddAccountFlow;
	label: string;
	description: string;
	available: boolean;
}

export interface AddAccountFlowCard extends AddAccountFlowOption {
	cardClass: string;
}

export function addAccountFlowOptions(networkName: string): AddAccountFlowOption[] {
	return [
		{ flow: "hot-import", label: "Hot Mnemonic Import", description: "Import an existing 25-word Algorand mnemonic", available: true },
		{ flow: "hot-create", label: "New Hot Account", description: "Generate a new random hot key account", available: true },
		{ flow: "bip39-import", label: "BIP39 Seed Import", description: "Import a 24-word BIP39 seed phrase", available: true },
		{ flow: "bip39-create", label: "New BIP39 Seed", description: "Generate a new BIP39 seed with HD accounts", available: true },
		{ flow: "passkey", label: "Passkey Account", description: "Restore or register using a passkey", available: true },
		{ flow: "hd", label: "HD Account Discovery", description: "Discover and add HD wallet accounts from a seed", available: true },
		{ flow: "ledger", label: "Ledger Hardware", description: "Discover and add Ledger hardware wallet accounts", available: true },
		{ flow: "falcon", label: "Falcon Post-Quantum", description: "Add a Falcon post-quantum signing account", available: true },
		{ flow: "kmd", label: "KMD Import (LocalNet)", description: "Import accounts from the LocalNet KMD wallet", available: networkName === "LocalNet" },
		{ flow: "watch", label: "Watch Account", description: "Add an address to monitor without importing keys", available: true },
		{ flow: "msig-create", label: "ARC-55 Multisig Create", description: "Deploy a new multisig app", available: true },
		{ flow: "msig-import", label: "ARC-55 Multisig Import", description: "Import an existing multisig app", available: true },
	];
}
