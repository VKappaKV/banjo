import type { Network } from "$core/types";

const ENV_KEY_BY_NETWORK: Record<string, string> = {
  MainNet: "VITE_BEACON_PROTOCOL_ADDRESS_MAINNET",
  TestNet: "VITE_BEACON_PROTOCOL_ADDRESS_TESTNET",
  LocalNet: "VITE_BEACON_PROTOCOL_ADDRESS_LOCALNET",
};

export function getBeaconProtocolAddress(network: Network): string | undefined {
  const key = ENV_KEY_BY_NETWORK[network.name] ?? `VITE_BEACON_PROTOCOL_ADDRESS_${network.name.toUpperCase()}`;
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value?.trim() || undefined;
}

export function getBeaconProtocolEnvName(network: Network): string {
  return ENV_KEY_BY_NETWORK[network.name] ?? `VITE_BEACON_PROTOCOL_ADDRESS_${network.name.toUpperCase()}`;
}

export function getBeaconDomainGenesis(network: Network): { genesisID: string; genesisHash: string } {
  if (!network.genesisHash || !network.genesisID) {
    throw new Error(`Network ${network.name} is missing BEACON domain genesis metadata.`);
  }
  return { genesisID: network.genesisID, genesisHash: network.genesisHash };
}
