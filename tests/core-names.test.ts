import { describe, expect, it, vi } from "vitest";
import type { Network } from "../src/lib/core";
import { getNfdsByAddress, reverseLookupNames, searchNames } from "../src/lib/core/network";

const network: Network = {
	name: "MainNet",
	algod: { url: "https://algod.example", port: "", token: "" },
	genesisID: "mainnet-v1.0",
	explorer: "https://explorer.example",
	nfdUrl: "https://api.nf.domains/",
};

describe("NFD name helpers", () => {
	it("gets NFDs by address", async () => {
		const fetchJson = vi.fn(async () => ({ ADDR: [{ name: "banjo.algo" }] }));

		await expect(getNfdsByAddress("https://api.nf.domains/", "ADDR", fetchJson)).resolves.toEqual([
			{ name: "banjo.algo" },
		]);
		expect(fetchJson).toHaveBeenCalledWith(
			"https://api.nf.domains/nfd/v2/address?address=ADDR&allowUnverified=false",
		);
	});

	it("searches NFD names and filters records without deposit accounts", async () => {
		const fetchJson = vi.fn(async () => ({
			nfds: [
				{ name: "banjo.algo", depositAccount: "ADDR1" },
				{ name: "empty.algo" },
				{ depositAccount: "ADDR2" },
			],
		}));

		await expect(searchNames({ query: "ban", network, fetchJson, limit: 5 })).resolves.toEqual([
			{ title: "banjo.algo", value: "ADDR1" },
		]);
		expect(fetchJson).toHaveBeenCalledWith(
			"https://api.nf.domains/nfd/v2/search?prefix=ban&view=thumbnail&limit=5",
		);
	});

	it("returns no search results when the network has no NFD URL", async () => {
		const fetchJson = vi.fn();

		await expect(
			searchNames({ query: "ban", network: { ...network, nfdUrl: undefined }, fetchJson }),
		).resolves.toEqual([]);
		expect(fetchJson).not.toHaveBeenCalled();
	});

	it("reverse looks up NFD names in batches", async () => {
		const fetchJson = vi
			.fn()
			.mockResolvedValueOnce({
				ADDR1: { name: "one.algo", appID: 1, timeExpires: "2030-01-01" },
				ADDR2: { name: "two.algo" },
			})
			.mockResolvedValueOnce({ ADDR3: { name: "three.algo" } });

		await expect(
			reverseLookupNames({ addresses: ["ADDR1", "ADDR2", "ADDR3"], network, fetchJson, batchSize: 2 }),
		).resolves.toEqual({
			ADDR1: { name: "one.algo", appID: 1, timeExpires: "2030-01-01" },
			ADDR2: { name: "two.algo" },
			ADDR3: { name: "three.algo" },
		});
		expect(fetchJson).toHaveBeenNthCalledWith(
			1,
			"https://api.nf.domains/nfd/lookup?view=brief&address=ADDR1&address=ADDR2",
		);
		expect(fetchJson).toHaveBeenNthCalledWith(
			2,
			"https://api.nf.domains/nfd/lookup?view=brief&address=ADDR3",
		);
	});
});
