import { encodeAddress, type Algodv2, type modelsv2 } from "algosdk";
import { describe, expect, it, vi } from "vitest";
import { getAssetInfo, resolveAssetUrl, resolveTemplateIpfsUrl } from "../src/lib/core/assets";
import type { WalletStorage } from "../src/lib/core/storage";

function asset(index: number, url?: string, reserve?: string): modelsv2.Asset {
	return {
		index: BigInt(index),
		params: { name: `Asset ${index}`, url, reserve },
	} as modelsv2.Asset;
}

function createAlgod(records: Record<number, modelsv2.Asset>): Algodv2 {
	return {
		getAssetByID: (assetId: number) => ({
			do: async () => records[assetId],
		}),
	} as unknown as Algodv2;
}

function createStorage(initial: Record<string, modelsv2.Asset> = {}) {
	const cache = new Map(Object.entries(initial));
	const storage = {
		getAsset: vi.fn(async (networkName: string, assetId: number) => cache.get(`${networkName}:${assetId}`)),
		putAsset: vi.fn(async (networkName: string, cachedAsset: modelsv2.Asset) => {
			cache.set(`${networkName}:${Number(cachedAsset.index)}`, cachedAsset);
		}),
	} as unknown as WalletStorage & {
		getAsset: ReturnType<typeof vi.fn>;
		putAsset: ReturnType<typeof vi.fn>;
	};

	return { storage, cache };
}

describe("asset URL resolution", () => {
	it("converts IPFS URLs to the configured gateway", async () => {
		await expect(resolveAssetUrl("ipfs://cid/image.png#i")).resolves.toBe(
			"https://ipfs.algonode.dev/ipfs/cid/image.png",
		);
	});

	it("resolves ARC-3 metadata image URLs", async () => {
		const fetchJson = vi.fn(async () => ({ image: "image.png" }));

		await expect(resolveAssetUrl("ipfs://cid/metadata.json#arc3", "", fetchJson)).resolves.toBe(
			"https://ipfs.algonode.dev/ipfs/cid/image.png",
		);
		expect(fetchJson).toHaveBeenCalledWith("https://ipfs.algonode.dev/ipfs/cid/metadata.json");
	});

	it("resolves template IPFS URLs from the reserve address", () => {
		const reserveAddress = encodeAddress(new Uint8Array(32).fill(1));
		const resolved = resolveTemplateIpfsUrl(
			"template-ipfs://{ipfscid:1:raw:reserve:sha2-256}/metadata.json#arc3",
			reserveAddress,
		);

		expect(resolved).toMatch(/^ipfs:\/\/b/);
		expect(resolved).toContain("/metadata.json#arc3");
	});
});

describe("getAssetInfo", () => {
	it("reads cached asset metadata for cacheable networks", async () => {
		const cachedAsset = asset(7, "https://cached.example/image.png");
		const { storage } = createStorage({ "MainNet:7": cachedAsset });
		const algod = createAlgod({ 7: asset(7, "https://network.example/image.png") });

		await expect(getAssetInfo({ assetId: 7n, networkName: "MainNet", algod, storage })).resolves.toEqual(
			cachedAsset,
		);
		expect(storage.getAsset).toHaveBeenCalledWith("MainNet", 7);
		expect(storage.putAsset).not.toHaveBeenCalled();
	});

	it("fetches and caches missing asset metadata", async () => {
		const fetchedAsset = asset(8, "ipfs://cid/logo.png#i");
		const { storage } = createStorage();

		const result = await getAssetInfo({
			assetId: 8,
			networkName: "TestNet",
			algod: createAlgod({ 8: fetchedAsset }),
			storage,
		});

		expect(result?.params.url).toBe("https://ipfs.algonode.dev/ipfs/cid/logo.png");
		expect(storage.putAsset).toHaveBeenCalledWith("TestNet", fetchedAsset);
	});

	it("skips cache for unsupported asset cache networks", async () => {
		const { storage } = createStorage();
		const fetchedAsset = asset(9, "https://local.example/asset.png");

		await expect(
			getAssetInfo({ assetId: 9, networkName: "LocalNet", algod: createAlgod({ 9: fetchedAsset }), storage }),
		).resolves.toEqual(fetchedAsset);
		expect(storage.getAsset).not.toHaveBeenCalled();
		expect(storage.putAsset).not.toHaveBeenCalled();
	});

	it("applies MainNet Tinyman logo replacements after lookup", async () => {
		const { storage } = createStorage();

		const result = await getAssetInfo({
			assetId: 10,
			networkName: "MainNet",
			algod: createAlgod({ 10: asset(10, "https://asset.example/logo.png") }),
			storage,
			tinyman: [
				{
					id: "10",
					name: "Asset 10",
					unit_name: "A10",
					decimals: 0,
					url: "https://asset.example",
					total_amount: "1",
					logo: { png: "https://tinyman.example/10.png", svg: "" },
					deleted: false,
				},
			],
		});

		expect(result?.params.url).toBe("https://tinyman.example/10.png");
	});
});
