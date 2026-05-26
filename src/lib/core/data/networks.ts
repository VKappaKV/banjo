import networksJson from "./networks.json";
import type { Network } from "../types";

export const builtInNetworks = networksJson as Network[];
export const networks = builtInNetworks;
