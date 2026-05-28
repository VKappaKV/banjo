import { createContext } from "svelte";
import type { WalletAppState } from "./wallet-app-state.svelte";

export const [getWalletAppContext, setWalletAppContext] = createContext<WalletAppState>();
