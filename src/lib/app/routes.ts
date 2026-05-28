import type { RouteDefinition } from "svelte-spa-router";
import { wrap } from "svelte-spa-router/wrap";

export const routes: RouteDefinition = {
	"/": wrap({ asyncComponent: () => import("$lib/pages/accounts/AccountsPage.svelte") }),
	"/accounts": wrap({ asyncComponent: () => import("$lib/pages/accounts/AccountsPage.svelte") }),
	"/add-account": wrap({ asyncComponent: () => import("$lib/pages/add-account/AddAccountPage.svelte") }),
	"/send": wrap({ asyncComponent: () => import("$lib/pages/send/SendPage.svelte") }),
	"/sign": wrap({ asyncComponent: () => import("$lib/pages/sign/SignPage.svelte") }),
	"/connect": wrap({ asyncComponent: () => import("$lib/pages/connect/ConnectPage.svelte") }),
	"/network-add": wrap({ asyncComponent: () => import("$lib/pages/network-add/NetworkAddPage.svelte") }),
	"/swap": wrap({ asyncComponent: () => import("$lib/pages/swap/SwapPage.svelte") }),
	"/settings": wrap({ asyncComponent: () => import("$lib/pages/settings/SettingsPage.svelte") }),
	"/account-detail/:addr": wrap({ asyncComponent: () => import("$lib/pages/account-detail/AccountDetailPage.svelte") }),
	"/multisig": wrap({ asyncComponent: () => import("$lib/pages/multisig/MultisigPage.svelte") }),
	"*": wrap({ asyncComponent: () => import("$lib/pages/accounts/AccountsPage.svelte") }),
};
