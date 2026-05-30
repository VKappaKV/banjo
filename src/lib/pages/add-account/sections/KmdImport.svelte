<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { createAlgodClient, createKmdClient } from "$core/network";
  import { builtInNetworks } from "$core/data/networks";
  import { selectNetwork } from "$core/state";
  import { loadKmdImportCandidates, importKmdAccounts } from "$core/keys";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  type Step = "loading" | "select" | "done";
  let step = $state<Step>("loading");
  let error = $state("");
  let candidates = $state<Awaited<
    ReturnType<typeof loadKmdImportCandidates>
  > | null>(null);
  let selectedAddresses = $state<Set<string>>(new Set());
  let addedCount = $state(0);

  function toggleCandidate(addr: string) {
    const next = new Set(selectedAddresses);
    if (next.has(addr)) next.delete(addr);
    else next.add(addr);
    selectedAddresses = next;
  }

  async function loadCandidates() {
    error = "";
    step = "loading";
    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }

	try {
		app.core.logger.info({ namespace: "onboarding", event: "kmd-load-started" });
		const network = selectNetwork(app.state, builtInNetworks);
      const kmd = createKmdClient(network);
      const algod = createAlgodClient(network, app.state.fallbackEnabled);

		const result = await loadKmdImportCandidates({ kmd, algod });
		candidates = result;
		app.core.logger.info({ namespace: "onboarding", event: "kmd-load-completed", fields: { candidateCount: result.privateAccounts.length } });
		step = "select";
	} catch (e) {
		error = e instanceof Error ? e.message : "Failed to load KMD accounts.";
		app.core.logger.error({ namespace: "onboarding", event: "kmd-load-failed", error: e });
		step = "select";
    }
  }

  async function handleImport() {
    if (!app.core || !candidates) return;
    error = "";
	try {
		app.core.logger.info({ namespace: "onboarding", event: "kmd-import-started", fields: { selectedCount: selectedAddresses.size } });
		const selected = candidates.privateAccounts.filter((a) =>
        selectedAddresses.has(a.addr as unknown as string),
      );
      if (selected.length === 0) {
        error = "Select at least one account.";
        return;
      }

      const added = await importKmdAccounts({
        selectedAddresses: [...selectedAddresses],
        privateAccounts: candidates.privateAccounts,
        state: app.state,
        storage: app.core.storage,
        cryptoProvider: app.core.cryptoProvider,
      });
		addedCount = added.length;
		app.core.logger.info({ namespace: "onboarding", event: "kmd-import-completed", fields: { addedCount: added.length } });
		step = "done";
      await app.refreshWallet();
	} catch (e) {
		error = e instanceof Error ? e.message : "Import failed.";
		app.core.logger.error({ namespace: "onboarding", event: "kmd-import-failed", error: e });
	}
}
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">KMD Import (LocalNet)</h2>
  </div>

  {#if step === "loading"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Loading KMD accounts</Card.Title>
        <Card.Description
          >Connecting to the LocalNet KMD wallet.</Card.Description
        >
      </Card.Header>
      <Card.Content>
        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
      <Card.Footer>
        <Button onclick={loadCandidates}>Load KMD Accounts</Button>
      </Card.Footer>
    </Card.Root>
  {:else if step === "select"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Select KMD accounts to import</Card.Title>
        <Card.Description
          >These accounts will be imported as hot accounts.</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-2">
        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if !candidates || candidates.privateAccounts.length === 0}
          <p class="text-sm text-muted-foreground">No KMD accounts found.</p>
        {/if}

        {#each candidates?.privateAccounts ?? [] as account (account.addr as unknown as string)}
          <label
            class="flex cursor-pointer items-center gap-3 rounded border p-3 hover:bg-accent/50"
          >
            <input
              type="checkbox"
              checked={selectedAddresses.has(account.addr as unknown as string)}
              onchange={() =>
                toggleCandidate(account.addr as unknown as string)}
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{account.addr}</p>
            </div>
          </label>
        {/each}
      </Card.Content>
      <Card.Footer class="flex gap-2">
        <Button onclick={handleImport} disabled={selectedAddresses.size === 0}>
          Import Selected ({selectedAddresses.size})
        </Button>
        <Button variant="outline" onclick={loadCandidates}>Refresh</Button>
      </Card.Footer>
    </Card.Root>
  {:else if step === "done"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Accounts Imported</Card.Title>
        <Card.Description
          >{addedCount} KMD account(s) imported as hot accounts.</Card.Description
        >
      </Card.Header>
      <Card.Footer class="flex gap-2">
        <Button onclick={onback}>Done</Button>
        <Button variant="outline" onclick={() => push("/accounts")}
          >View Accounts</Button
        >
      </Card.Footer>
    </Card.Root>
  {/if}
</div>
