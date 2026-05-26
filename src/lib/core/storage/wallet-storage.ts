import type { modelsv2 } from "algosdk";
import type { BanjoAccount, SeedData } from "../types";

export interface WalletStorage {
	getAppValue<T = unknown>(key: string): Promise<T | undefined>;
	setAppValue<T = unknown>(key: string, value: T): Promise<void>;
	deleteAppValue(key: string): Promise<void>;
	getAccounts(): Promise<BanjoAccount[]>;
	setAccounts(accounts: BanjoAccount[]): Promise<void>;
	getAllSeeds(): Promise<SeedData[]>;
	putSeed(seed: Omit<SeedData, "id"> | SeedData): Promise<number>;
	getHotKey(address: string): Promise<CryptoKey | undefined>;
	putHotKey(address: string, key: CryptoKey): Promise<void>;
	listHotKeyAddresses(): Promise<string[]>;
	getAsset(networkName: string, assetId: number): Promise<modelsv2.Asset | undefined>;
	putAsset(networkName: string, asset: modelsv2.Asset): Promise<void>;
}
