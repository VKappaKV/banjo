import { Algodv2, Indexer, Kmd, type Indexer as IndexerClient } from "algosdk";
import { describe, expect, it } from "vitest";
import type { Network } from "../src/lib/core";
import {
  addCustomNetworkFromDapp,
  createAlgodClient,
  createIndexerClient,
  createKmdClient,
  getAuthorizedAccounts,
  NetworkClientError,
  selectNetworkClientConfig,
  validateAddNetworkRequest,
  validateCustomNetworkList,
  validateDappAddNetwork,
  validateNetworkConfig,
} from "../src/lib/core/network";
import { walletSettingKeys } from "../src/lib/core/state";
import { MockWalletStorage } from "../src/lib/core/testing/mock-storage";

const network: Network = {
  name: "UnitNet",
  algod: { url: "https://algod.example", port: "443", token: "algod-token" },
  indexer: {
    url: "https://indexer.example",
    port: "443",
    token: "indexer-token",
  },
  kmd: { url: "https://kmd.example", port: "443", token: "kmd-token" },
  fallback: {
    algod: {
      url: "https://fallback-algod.example",
      port: "",
      token: "fallback-algod-token",
    },
    indexer: {
      url: "https://fallback-indexer.example",
      port: "",
      token: "fallback-indexer-token",
    },
  },
  genesisID: "unitnet-v1",
  genesisHash: "hash",
  explorer: "https://explorer.example",
};

describe("network client helpers", () => {
  it("selects primary and fallback endpoint configs", () => {
    expect(selectNetworkClientConfig(network, "algod")?.url).toBe(
      "https://algod.example",
    );
    expect(selectNetworkClientConfig(network, "algod", true)?.url).toBe(
      "https://fallback-algod.example",
    );
    expect(selectNetworkClientConfig(network, "indexer", true)?.url).toBe(
      "https://fallback-indexer.example",
    );
  });

  it("creates Algorand SDK clients", () => {
    expect(createAlgodClient(network)).toBeInstanceOf(Algodv2);
    expect(createIndexerClient(network)).toBeInstanceOf(Indexer);
    expect(createKmdClient(network)).toBeInstanceOf(Kmd);
  });

  it("returns undefined for missing indexer and throws typed errors for missing KMD", () => {
    const algodOnly = { ...network, indexer: undefined, kmd: undefined };

    expect(createIndexerClient(algodOnly)).toBeUndefined();
    expect(() => createKmdClient(algodOnly)).toThrow(NetworkClientError);
  });

  it("validates single network configs and custom network lists", () => {
    expect(validateNetworkConfig(network)).toMatchObject({
      valid: true,
      network,
    });
    expect(validateNetworkConfig({})).toMatchObject({ valid: false });

    const listResult = validateCustomNetworkList([network]);

    expect(listResult.valid).toBe(true);
    expect(listResult.networks).toEqual([network]);
    expect(validateCustomNetworkList({})).toMatchObject({ valid: false });
  });

  it("rejects dApp add-network requests with duplicate genesis IDs", () => {
    expect(validateDappAddNetwork(network, [])).toMatchObject({ valid: true });
    expect(validateDappAddNetwork(network, [network.genesisID])).toMatchObject({
      valid: false,
      errors: [`Network genesisID ${network.genesisID} is already configured`],
    });
    expect(validateAddNetworkRequest(network, [])).toBe(network);
    expect(() => validateAddNetworkRequest(network, [network])).toThrow(
      `Network genesisID ${network.genesisID} is already configured`,
    );
  });

  it("persists approved dApp add-network requests as custom networks", async () => {
    const storage = new MockWalletStorage();
    const storedNetwork = { ...network, name: "StoredNet", genesisID: "stored-v1" };
    const newNetwork = { ...network, name: "NewNet", genesisID: "new-v1" };

    await storage.setAppValue(walletSettingKeys.customNetworks, [storedNetwork]);

    await expect(addCustomNetworkFromDapp(storage, newNetwork, [network])).resolves.toEqual([
      storedNetwork,
      newNetwork,
    ]);
    await expect(storage.getAppValue(walletSettingKeys.customNetworks)).resolves.toEqual([
      storedNetwork,
      newNetwork,
    ]);
  });

  it("rejects dApp add-network persistence when genesis ID is already configured", async () => {
    const storage = new MockWalletStorage();
    const storedNetwork = { ...network, name: "StoredNet", genesisID: "stored-v1" };

    await storage.setAppValue(walletSettingKeys.customNetworks, [storedNetwork]);

    await expect(addCustomNetworkFromDapp(storage, network, [network])).rejects.toThrow(
      `Network genesisID ${network.genesisID} is already configured`,
    );
    await expect(addCustomNetworkFromDapp(storage, storedNetwork)).rejects.toThrow(
      "Network genesisID stored-v1 is already configured",
    );
    await expect(storage.getAppValue(walletSettingKeys.customNetworks)).resolves.toEqual([storedNetwork]);
  });

  it("looks up accounts authorized to a signer through indexer", async () => {
    let authAddress = "";
    const indexer = {
      searchAccounts: () => ({
        authAddr: (address: string) => {
          authAddress = address;

          return {
            do: async () => ({
              accounts: [{ address: "REKEYED1" }, {}, { address: "REKEYED2" }],
            }),
          };
        },
      }),
    } as unknown as IndexerClient;

    await expect(getAuthorizedAccounts("SIGNER", undefined)).resolves.toEqual(
      [],
    );
    await expect(getAuthorizedAccounts("SIGNER", indexer)).resolves.toEqual([
      "REKEYED1",
      "REKEYED2",
    ]);
    expect(authAddress).toBe("SIGNER");
  });
});
