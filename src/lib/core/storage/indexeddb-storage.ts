import type { modelsv2 } from "algosdk";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BanjoAccount, SeedData } from "../types";
import { getAssetStoreName, type AssetStoreName } from "./asset-cache";
import type { WalletStorage } from "./wallet-storage";

interface BanjoDb extends DBSchema {
	app: {
		key: string;
		value: unknown;
	};
	"assets-betanet": {
		key: number;
		value: modelsv2.Asset;
	};
	"assets-mainnet": {
		key: number;
		value: modelsv2.Asset;
	};
	"assets-testnet": {
		key: number;
		value: modelsv2.Asset;
	};
	"assets-voi mainnet": {
		key: number;
		value: modelsv2.Asset;
	};
	"assets-voi testnet": {
		key: number;
		value: modelsv2.Asset;
	};
	keys: {
		key: string;
		value: CryptoKey;
	};
	seeds: {
		key: number;
		value: SeedData;
	};
}

export interface IndexedDbWalletStorageOptions {
	databaseName?: string;
}

const defaultDatabaseName = "banjo";

function createDatabase(databaseName: string): Promise<IDBPDatabase<BanjoDb>> {
	return openDB<BanjoDb>(databaseName, 1, {
		upgrade(database) {
			database.createObjectStore("app");
			database.createObjectStore("assets-betanet");
			database.createObjectStore("assets-mainnet");
			database.createObjectStore("assets-testnet");
			database.createObjectStore("assets-voi mainnet");
			database.createObjectStore("assets-voi testnet");
			database.createObjectStore("keys");
			database.createObjectStore("seeds", { keyPath: "id", autoIncrement: true });
		},
	});
}

export function createIndexedDbWalletStorage(
	options: IndexedDbWalletStorageOptions = {},
): WalletStorage {
	const database = createDatabase(options.databaseName ?? defaultDatabaseName);

	async function db() {
		return database;
	}

	async function getAssetStore(storeName: AssetStoreName, assetId: number) {
		return (await db()).get(storeName, assetId);
	}

	async function putAssetStore(storeName: AssetStoreName, asset: modelsv2.Asset) {
		await (await db()).put(storeName, asset, Number(asset.index));
	}

	return {
		async getAppValue<T = unknown>(key: string): Promise<T | undefined> {
			return ((await db()).get("app", key) as Promise<T | undefined>);
		},
		async setAppValue<T = unknown>(key: string, value: T): Promise<void> {
			await (await db()).put("app", value, key);
		},
		async deleteAppValue(key: string): Promise<void> {
			await (await db()).delete("app", key);
		},
		async getAccounts(): Promise<BanjoAccount[]> {
			return ((await this.getAppValue<BanjoAccount[]>("accounts")) ?? []);
		},
		async setAccounts(accounts: BanjoAccount[]): Promise<void> {
			await this.setAppValue("accounts", accounts);
		},
		async getAllSeeds(): Promise<SeedData[]> {
			return (await db()).getAll("seeds");
		},
		async putSeed(seed: Omit<SeedData, "id"> | SeedData): Promise<number> {
			return Number(await (await db()).put("seeds", seed as SeedData));
		},
		async getHotKey(address: string): Promise<CryptoKey | undefined> {
			return (await db()).get("keys", address);
		},
		async putHotKey(address: string, key: CryptoKey): Promise<void> {
			await (await db()).put("keys", key, address);
		},
		async listHotKeyAddresses(): Promise<string[]> {
			return (await (await db()).getAllKeys("keys")).map(String);
		},
		async getAsset(networkName: string, assetId: number): Promise<modelsv2.Asset | undefined> {
			const storeName = getAssetStoreName(networkName);

			if (!storeName) {
				return undefined;
			}

			return getAssetStore(storeName, assetId);
		},
		async putAsset(networkName: string, asset: modelsv2.Asset): Promise<void> {
			const storeName = getAssetStoreName(networkName);

			if (!storeName) {
				return;
			}

			await putAssetStore(storeName, asset);
		},
	};
}
