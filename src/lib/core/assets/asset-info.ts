import type { Algodv2, modelsv2 } from "algosdk";
import type { FetchJson } from "../runtime";
import type { TinyAsset } from "../types";
import type { WalletStorage } from "../storage";
import { getAssetStoreName } from "../storage";
import { resolveAssetUrl } from "./asset-url";

export interface GetAssetInfoOptions {
	assetId: bigint | number;
	networkName: string;
	algod: Algodv2;
	storage: WalletStorage;
	tinyman?: TinyAsset[];
	noImage?: boolean;
	fetchJson?: FetchJson;
}

function assetIndex(asset: modelsv2.Asset): number {
	return Number(asset.index);
}

function cloneAsset(asset: modelsv2.Asset): modelsv2.Asset {
	return {
		...asset,
		params: { ...asset.params },
	} as modelsv2.Asset;
}

function findTinymanLogo(assetId: number, tinyman: TinyAsset[] | undefined): string | undefined {
	return tinyman?.find((asset) => Number(asset.id) === assetId && !asset.deleted)?.logo.png;
}

async function resolveAssetImageUrl(asset: modelsv2.Asset, fetchJson: FetchJson | undefined): Promise<modelsv2.Asset> {
	const params = asset.params as modelsv2.AssetParams & { reserve?: string; url?: string };
	const resolvedUrl = await resolveAssetUrl(params.url, params.reserve, fetchJson);

	if (!resolvedUrl) {
		return asset;
	}

	return {
		...asset,
		params: {
			...asset.params,
			url: resolvedUrl,
		},
	} as modelsv2.Asset;
}

export async function getAssetInfo({
	assetId,
	networkName,
	algod,
	storage,
	tinyman,
	noImage = false,
	fetchJson,
}: GetAssetInfoOptions): Promise<modelsv2.Asset | undefined> {
	const id = Number(assetId);
	const cacheable = !!getAssetStoreName(networkName);
	const cached = cacheable ? await storage.getAsset(networkName, id) : undefined;
	let asset = cached ? cloneAsset(cached) : undefined;

	if (!asset || (!noImage && asset.params.url?.startsWith("template-ipfs://"))) {
		asset = (await algod.getAssetByID(id).do()) as modelsv2.Asset;

		if (cacheable) {
			await storage.putAsset(networkName, asset);
		}
	} else {
		asset = cloneAsset(asset);
	}

	if (!noImage && asset) {
		asset = await resolveAssetImageUrl(asset, fetchJson);
		const tinymanLogo = networkName === "MainNet" ? findTinymanLogo(assetIndex(asset), tinyman) : undefined;

		if (tinymanLogo) {
			asset = {
				...asset,
				params: { ...asset.params, url: tinymanLogo },
			} as modelsv2.Asset;
		}
	}

	return asset;
}
