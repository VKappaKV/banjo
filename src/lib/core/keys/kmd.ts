import algosdk, { type Algodv2, type Kmd, type modelsv2 } from "algosdk";
import type { CryptoProvider } from "../runtime";
import type { WalletStorage } from "../storage";
import type { BanjoAccount } from "../types";
import type { WalletState } from "../state";
import { filterNewAccounts, saveAccounts } from "../accounts";
import { storeHotAccountKey } from "./hot";

export const defaultKmdWalletName = "unencrypted-default-wallet";

export class KmdImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "KmdImportError";
	}
}

interface KmdWalletListResponse {
	wallets?: Array<{ id?: string; name?: string }>;
}

interface KmdHandleResponse {
	wallet_handle_token: string;
}

interface KmdListKeysResponse {
	addresses?: string[];
}

interface KmdExportKeyResponse {
	private_key: Uint8Array;
}

export interface KmdImportCandidates {
	accountInfo: modelsv2.Account[];
	privateAccounts: algosdk.Account[];
}

function buildAccountFromPrivateKey(privateKey: Uint8Array): algosdk.Account {
	return {
		addr: new algosdk.Address(privateKey.slice(32)),
		sk: privateKey,
	};
}

export async function loadKmdImportCandidates(args: {
	kmd: Kmd;
	algod: Algodv2;
	walletName?: string;
	walletPassword?: string;
}): Promise<KmdImportCandidates> {
	const walletPassword = args.walletPassword ?? "";
	const { wallets = [] } = (await args.kmd.listWallets()) as KmdWalletListResponse;
	const wallet = wallets.find((candidate) => candidate.name === (args.walletName ?? defaultKmdWalletName));

	if (!wallet?.id) {
		throw new KmdImportError(`No ${args.walletName ?? defaultKmdWalletName}`);
	}

	const { wallet_handle_token } = (await args.kmd.initWalletHandle(wallet.id, walletPassword)) as KmdHandleResponse;

	try {
		const { addresses = [] } = (await args.kmd.listKeys(wallet_handle_token)) as KmdListKeysResponse;
		const privateAccounts: algosdk.Account[] = [];
		const accountInfo: modelsv2.Account[] = [];

		await Promise.all(
			addresses.map(async (address) => {
				const key = (await args.kmd.exportKey(wallet_handle_token, walletPassword, address)) as KmdExportKeyResponse;
				privateAccounts.push(buildAccountFromPrivateKey(key.private_key));
				accountInfo.push((await args.algod.accountInformation(address).do()) as modelsv2.Account);
			}),
		);

		return { accountInfo, privateAccounts };
	} finally {
		await args.kmd.releaseWalletHandle(wallet_handle_token);
	}
}

export async function importKmdAccounts(args: {
	selectedAddresses: string[];
	privateAccounts: algosdk.Account[];
	state: WalletState;
	storage: WalletStorage;
	cryptoProvider?: Pick<CryptoProvider, "subtle">;
}): Promise<BanjoAccount[]> {
	const selected = args.selectedAddresses.map((addr) => ({ addr }));
	const newSelected = filterNewAccounts(args.state.accounts, selected);
	const add: BanjoAccount[] = [];

	for (const candidate of newSelected) {
		const account = args.privateAccounts.find((privateAccount) => privateAccount.addr.toString() === candidate.addr);

		if (!account) {
			throw new KmdImportError("Invalid Account");
		}

		await storeHotAccountKey({ account, storage: args.storage, cryptoProvider: args.cryptoProvider });
		add.push({ addr: candidate.addr, hot: true });
	}

	const accounts = args.state.accounts.concat(add);
	await saveAccounts(args.storage, accounts);
	args.state.accounts = accounts;

	return add;
}
