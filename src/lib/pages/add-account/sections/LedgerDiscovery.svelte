<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { createAlgodClient, createIndexerClient } from "$core/network";
  import { builtInNetworks } from "$core/data/networks";
  import { selectNetwork } from "$core/state";
  import {
    discoverLedgerAccounts,
    defaultLedgerDiscoveryCount,
  } from "$core/keys";
  import { addLedgerAccounts } from "$core/accounts";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  type Step = "discovering" | "select-accounts" | "done";
  let step = $state<Step>("discovering");
  let error = $state("");
  let candidates = $state<Awaited<ReturnType<typeof discoverLedgerAccounts>>>(
    [],
  );
  let selectedAddresses = $state<Set<string>>(new Set());
  let addedCount = $state(0);
  let startIndex = $state(0);

  function toggleCandidate(addr: string) {
    const next = new Set(selectedAddresses);
    if (next.has(addr)) next.delete(addr);
    else next.add(addr);
    selectedAddresses = next;
  }

  async function discover(offset: number) {
    error = "";
    step = "discovering";
    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }

    try {
      const network = selectNetwork(app.state, builtInNetworks);
      const algod = createAlgodClient(network, app.state.fallbackEnabled);
      const indexer = createIndexerClient(network, app.state.fallbackEnabled);

      const result = await discoverLedgerAccounts({
        ledgerProvider: app.core.ledgerProvider,
        startIndex: offset,
        count: defaultLedgerDiscoveryCount,
        algod,
        indexer,
      });
      candidates = result;
      startIndex = offset;
      step = "select-accounts";
    } catch (e) {
      error = e instanceof Error ? e.message : "Ledger discovery failed.";
      step = "select-accounts";
    }
  }

  async function handleAdd() {
    if (!app.core) return;
    error = "";
    try {
      const selected = candidates.filter((c) =>
        selectedAddresses.has(c.address),
      );
      if (selected.length === 0) {
        error = "Select at least one account.";
        return;
      }

      const added = await addLedgerAccounts({
        selected,
        allCandidates: candidates,
        state: app.state,
        storage: app.core.storage,
      });
      addedCount = added.length;
      step = "done";
      await app.refreshWallet();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to add accounts.";
    }
  }
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">Ledger Account Discovery</h2>
  </div>

  {#if step === "discovering"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Connect and discover</Card.Title>
        <Card.Description>
          Connect your Ledger device and open the Algorand app. Click below to
          start discovery.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
      <Card.Footer>
        <Button onclick={() => discover(0)}>Discover Ledger Accounts</Button>
      </Card.Footer>
    </Card.Root>
  {:else if step === "select-accounts"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Select accounts to add</Card.Title>
        <Card.Description>Page starting at index {startIndex}.</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-2">
        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}

        {#each candidates as candidate (candidate.address)}
          <label
            class="flex cursor-pointer items-center gap-3 rounded border p-3 hover:bg-accent/50"
          >
            <input
              type="checkbox"
              checked={selectedAddresses.has(candidate.address)}
              onchange={() => toggleCandidate(candidate.address)}
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{candidate.address}</p>
              <p class="text-xs text-muted-foreground">
                Balance: {candidate.amount ?? 0} microALGO
              </p>
            </div>
          </label>
        {/each}
      </Card.Content>
      <Card.Footer class="flex flex-wrap gap-2">
        <Button onclick={handleAdd} disabled={selectedAddresses.size === 0}>
          Add Selected ({selectedAddresses.size})
        </Button>
        <Button
          variant="outline"
          onclick={() =>
            discover(Math.max(0, startIndex - defaultLedgerDiscoveryCount))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onclick={() => discover(startIndex + defaultLedgerDiscoveryCount)}
        >
          Next
        </Button>
      </Card.Footer>
    </Card.Root>
  {:else if step === "done"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Accounts Added</Card.Title>
        <Card.Description
          >{addedCount} Ledger account(s) added to the wallet.</Card.Description
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
