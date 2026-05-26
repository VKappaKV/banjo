import type { modelsv2 } from "algosdk";
import type { WalletState } from "./wallet-state";
import type { AccountHD, AccountInfo, Arc55App, BanjoAccount, Network } from "../types";

function formatAddress(address: string): string {
	return `${address.substring(0, 6)}...${address.substring(52)}`;
}

function cloneNetwork(network: Network): Network {
	return {
		...network,
		algod: { ...network.algod },
		indexer: network.indexer ? { ...network.indexer } : undefined,
		kmd: network.kmd ? { ...network.kmd } : undefined,
		fallback: network.fallback
			? {
					algod: { ...network.fallback.algod },
					indexer: { ...network.fallback.indexer },
				}
			: undefined,
		lutier: network.lutier ? { ...network.lutier } : undefined,
	};
}

function getCanSign(account: BanjoAccount, hotKeyAddresses: string[]) {
	const isHot = hotKeyAddresses.includes(account.addr);
	const canSign = isHot || account.slot != null || account.seedId != null || !!account.falcon;

	return { isHot, canSign };
}

function authAddress(accountInfo: AccountHD | undefined): string | undefined {
	return accountInfo?.authAddr?.toString();
}

export function selectAccountInfo(state: WalletState): AccountInfo[] {
	const result: AccountInfo[] = [];
	const accounts = state.accounts.filter(
		(account) => state.signDataMode || !account.network || account.network === state.networkName,
	);

	for (const account of accounts) {
		const info = state.accountInfo.find((item) => item.address === account.addr);
		const { isHot, canSign } = getCanSign(account, state.hotKeyAddresses);

		if (isHot && !state.hotWalletEnabled) {
			continue;
		}

		const authorizedAccount = state.accounts.find((item) => item.addr === authAddress(info));
		const authorizedSigning = authorizedAccount
			? getCanSign(authorizedAccount, state.hotKeyAddresses)
			: undefined;
		const globalIdx = state.accounts.findIndex((item) => item.addr === account.addr);

		if (!authorizedSigning || (!canSign && !account.appId && !authorizedSigning.canSign)) {
			result.push({
				...account,
				title: formatAddress(account.addr),
				isHot,
				canSign,
				info,
				globalIdx,
				ns: state.namespaceRecords[account.addr],
			});
		}

		if (canSign || account.appId) {
			state.accountInfo
				.filter((item) => authAddress(item) === account.addr)
				.sort((left, right) => left.address.localeCompare(right.address))
				.forEach((item) => {
					result.push({
						addr: item.address,
						title: formatAddress(item.address),
						isHot: false,
						canSign,
						subType: "rekey",
						info: item,
						globalIdx,
						ns: state.namespaceRecords[item.address],
					});
				});
		}

		if (account.xpub) {
			state.accountInfo
				.filter((item) => item.sibling === account.addr)
				.sort((left, right) => (left.addrIdx ?? 0) - (right.addrIdx ?? 0))
				.forEach((item) => {
					result.push({
						addr: item.address,
						title: formatAddress(item.address),
						isHot: false,
						canSign,
						subType: "hd",
						info: item,
						globalIdx,
						ns: state.namespaceRecords[item.address],
						slot: account.slot,
						seedId: account.seedId,
					});
				});
		}
	}

	return result;
}

export function selectSendAccounts(state: WalletState): AccountInfo[] {
	return selectAccountInfo(state).filter((account) => account.canSign || account.appId);
}

export function selectSigningAccounts(state: WalletState): AccountInfo[] {
	return selectSendAccounts(state).filter((account) => !account.appId);
}

export function selectAllNetworks(builtIns: Network[], customNetworks: Network[]): Network[] {
	const result = builtIns.map(cloneNetwork);

	for (const customNetwork of customNetworks) {
		const index = result.findIndex((network) => network.genesisID === customNetwork.genesisID);

		if (index === -1) {
			result.push(cloneNetwork(customNetwork));
			continue;
		}

		result[index] = {
			...result[index],
			algod: { ...customNetwork.algod },
			indexer: customNetwork.indexer ? { ...customNetwork.indexer } : undefined,
			fallback: customNetwork.fallback
				? {
						algod: { ...customNetwork.fallback.algod },
						indexer: { ...customNetwork.fallback.indexer },
					}
				: undefined,
		};
	}

	return result;
}

export function selectNetwork(state: WalletState, builtIns: Network[]): Network {
	const allNetworks = selectAllNetworks(builtIns, state.customNetworks);
	const selected = allNetworks.find((network) => network.name === state.networkName) ?? allNetworks[0];

	if (!selected) {
		throw new Error("No networks configured");
	}

	const network = cloneNetwork(selected);

	if (network.name === "LocalNet") {
		network.inboxRouter = state.sandboxRouter;
	}

	return network;
}

export function selectMsigSigner(app: Arc55App, signingAccounts: AccountInfo[]): string {
	const voteMap = app.addrs.reduce<Record<string, number>>((votes, address) => {
		votes[address] = (votes[address] ?? 0) + 1;
		return votes;
	}, {});
	const orderedAddresses = Object.keys(voteMap).sort((left, right) => voteMap[right] - voteMap[left]);
	const member = orderedAddresses.find((address) => signingAccounts.some((account) => account.addr === address));

	if (!member) {
		throw new Error("Not a Member of Multi-Sig");
	}

	return member;
}

export function isVoiNetwork(networkName: string): boolean {
	return networkName.startsWith("Voi");
}

export function getNativeAsset(networkName: string): modelsv2.Asset {
	return {
		index: 0n,
		params: { name: isVoiNetwork(networkName) ? "Voi" : "Algo" },
	} as modelsv2.Asset;
}
