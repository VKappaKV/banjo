<script lang="ts">
  import { router } from "svelte-spa-router";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import { getWalletAppContext } from "$lib/app/context";
  import { useSwitchNetworkMutation } from "$lib/app/queries/wallet-queries.svelte";
  import { getWalletViewDefinitionByPath } from "$lib/app/views";

  const app = getWalletAppContext();
  const switchNetworkMutation = useSwitchNetworkMutation(app);
  let activeView = $derived(getWalletViewDefinitionByPath(router.location));

  async function onNetworkChange(
    value: string | string[] | undefined,
  ): Promise<void> {
    if (typeof value === "string") {
      try {
        await switchNetworkMutation.mutateAsync(value);
        app.notify(`Switched to ${value}`, "success");
      } catch (error) {
        app.notify(
          error instanceof Error ? error.message : "Failed to switch network",
          "error",
        );
      }
    }
  }
</script>

<header
  class="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
>
  <div>
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="outline"
        >{app.initialized ? "Core loaded" : "Starting"}</Badge
      >
      <Badge variant="secondary">{app.selectedNetwork.genesisID}</Badge>
    </div>
    <h2 class="mt-3 text-3xl font-mono tracking-tight">{activeView.label}</h2>
    <p class="text-muted-foreground mt-1 text-sm">{activeView.description}</p>
  </div>

  <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
    <Select.Root
      type="single"
      value={app.state.networkName}
      onValueChange={onNetworkChange}
    >
      <Select.Trigger class="w-full sm:w-56" aria-label="Selected network">
        {app.state.networkName}
      </Select.Trigger>
      <Select.Content>
        {#each app.allNetworks as network (network.genesisID)}
          <Select.Item value={network.name} label={network.name} />
        {/each}
      </Select.Content>
    </Select.Root>
    <Button
      variant="outline"
      onclick={() => app.refreshWallet()}
      disabled={app.isLoading || !app.initialized}
    >
      Refresh
    </Button>
  </div>
</header>
