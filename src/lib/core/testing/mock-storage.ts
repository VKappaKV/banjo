import type { modelsv2 } from "algosdk";
import type { WalletStorage } from "../storage";
import type { BanjoAccount, SeedData } from "../types";

export class MockWalletStorage implements WalletStorage {
	readonly appValues = new Map<string, unknown>();
	readonly hotKeys = new Map<string, CryptoKey>();
	readonly assets = new Map<string, modelsv2.Asset>();
	readonly seeds = new Map<number, SeedData>();
	private nextSeedId = 1;

	async getAppValue<T = unknown>(key: string): Promise<T | undefined> {
		return this.appValues.get(key) as T | undefined;
	}

	async setAppValue<T = unknown>(key: string, value: T): Promise<void> {
		this.appValues.set(key, value);
	}

	async deleteAppValue(key: string): Promise<void> {
		this.appValues.delete(key);
	}

	async getAccounts(): Promise<BanjoAccount[]> {
		return (await this.getAppValue<BanjoAccount[]>("accounts")) ?? [];
	}

	async setAccounts(accounts: BanjoAccount[]): Promise<void> {
		await this.setAppValue("accounts", accounts);
	}

	async getAllSeeds(): Promise<SeedData[]> {
		return [...this.seeds.values()];
	}

	async putSeed(seed: Omit<SeedData, "id"> | SeedData): Promise<number> {
		const id = "id" in seed && seed.id ? seed.id : this.nextSeedId++;
		this.seeds.set(id, { ...seed, id });

		return id;
	}

	async getHotKey(address: string): Promise<CryptoKey | undefined> {
		return this.hotKeys.get(address);
	}

	async putHotKey(address: string, key: CryptoKey): Promise<void> {
		this.hotKeys.set(address, key);
	}

	async listHotKeyAddresses(): Promise<string[]> {
		return [...this.hotKeys.keys()];
	}

	async getAsset(networkName: string, assetId: number): Promise<modelsv2.Asset | undefined> {
		return this.assets.get(`${networkName}:${assetId}`);
	}

	async putAsset(networkName: string, asset: modelsv2.Asset): Promise<void> {
		this.assets.set(`${networkName}:${Number(asset.index)}`, asset);
	}
}
