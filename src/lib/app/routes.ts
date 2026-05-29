import type { RouteDefinition } from "svelte-spa-router";
import AccountsPage from "$lib/pages/accounts/AccountsPage.svelte";
import AddAccountPage from "$lib/pages/add-account/AddAccountPage.svelte";
import SendPage from "$lib/pages/send/SendPage.svelte";
import SignPage from "$lib/pages/sign/SignPage.svelte";
import ConnectPage from "$lib/pages/connect/ConnectPage.svelte";
import NetworkAddPage from "$lib/pages/network-add/NetworkAddPage.svelte";
import SwapPage from "$lib/pages/swap/SwapPage.svelte";
import SettingsPage from "$lib/pages/settings/SettingsPage.svelte";
import AccountDetailPage from "$lib/pages/account-detail/AccountDetailPage.svelte";
import MultisigPage from "$lib/pages/multisig/MultisigPage.svelte";

export const routes: RouteDefinition = {
  "/": AccountsPage,
  "/accounts": AccountsPage,
  "/add-account": AddAccountPage,
  "/send": SendPage,
  "/sign": SignPage,
  "/connect": ConnectPage,
  "/network-add": NetworkAddPage,
  "/swap": SwapPage,
  "/settings": SettingsPage,
  "/account-detail/:addr": AccountDetailPage,
  "/multisig": MultisigPage,
  "/multisig/:appId": MultisigPage,
  "*": AccountsPage,
};
