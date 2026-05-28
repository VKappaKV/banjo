import { describe, expect, it } from "vitest";
import type { AccountInfo } from "../src/lib/core/types";
import { accountKind, calculatePortfolioSummary, formatAssetAmount, formatMicroAlgos } from "../src/lib/app/portfolio";
import { queryKeys } from "../src/lib/app/query-keys";

describe("app portfolio helpers", () => {
	it("formats native and ASA units", () => {
		expect(formatMicroAlgos(1_234_500n)).toBe("1.2345 ALGO");
		expect(formatAssetAmount(12_345n, 2)).toBe("123.45");
		expect(formatAssetAmount(10n, 0)).toBe("10");
	});

	it("calculates portfolio totals from refreshed account data", () => {
		const accounts = [
			{
				addr: "A",
				title: "A",
				isHot: true,
				canSign: true,
				globalIdx: 0,
				info: { amount: 2_000_000n, assets: [{ assetId: 10n, amount: 1n, isFrozen: false }] },
				ns: { name: "a.algo" },
			},
			{
				addr: "B",
				title: "B",
				isHot: false,
				canSign: false,
				globalIdx: 1,
				info: { amount: 500_000n, assets: [{ assetId: 10n, amount: 2n, isFrozen: false }] },
			},
		] as AccountInfo[];

		expect(calculatePortfolioSummary(accounts)).toMatchObject({
			totalAccounts: 2,
			signableAccounts: 1,
			watchAccounts: 1,
			totalMicroAlgos: 2_500_000n,
			totalAssets: 2,
			distinctAssets: 1,
			namedAccounts: 1,
		});
	});

	it("labels account kinds and builds stable query keys", () => {
		expect(accountKind({ addr: "A", title: "A", isHot: true, canSign: true, globalIdx: 0 })).toBe("Hot");
		expect(accountKind({ addr: "A", title: "A", isHot: false, canSign: false, globalIdx: 0 })).toBe("Watch");
		expect(queryKeys.account("MainNet", "ADDR")).toEqual(["banjo", "accounts", "MainNet", "ADDR"]);
	});
});
