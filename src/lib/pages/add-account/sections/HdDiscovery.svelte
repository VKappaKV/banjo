<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { createAlgodClient, createIndexerClient } from "$core/network";
  import { builtInNetworks } from "$core/data/networks";
  import { selectNetwork } from "$core/state";
  import {
    decryptStoredSeed,
    deriveHdAccounts,
    defaultHdDiscoveryCount,
  } from "$core/keys";
  import { addHdAccounts } from "$core/accounts";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  type Step =
    | "select-seed"
    | "password"
    | "discovering"
    | "select-accounts"
    | "done";
  let step = $state<Step>("select-seed");
  let error = $state("");
  let passphrase = $state("");
  let seedBuffer = $state<Buffer | null>(null);
  let candidates = $state<Awaited<ReturnType<typeof deriveHdAccounts>>>([]);
  let selectedAddresses = $state<Set<string>>(new Set());
  let addedCount = $state(0);
  let startIndex = $state(0);

  const seeds = $derived(app.state.seeds);

  function toggleCandidate(addr: string) {
    const next = new Set(selectedAddresses);
    if (next.has(addr)) next.delete(addr);
    else next.add(addr);
    selectedAddresses = next;
  }

  async function proceedToPassword(seedId: number) {
    error = "";
    passphrase = "";
    step = "password";
  }

  async function handlePassword() {
    error = "";
    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }

    const seedData = seeds.find((s) => s.data);
    if (!seedData) {
      error = "No encrypted seed found.";
      return;
    }

    try {
      seedBuffer = await decryptStoredSeed({
        passphrase,
        seedData,
        cryptoProvider: app.core.cryptoProvider,
      });
      step = "discovering";
      await discover(0);
    } catch (e) {
      error = e instanceof Error ? e.message : "Incorrect passphrase.";
    }
  }

  async function discover(offset: number) {
    if (!seedBuffer || !app.core) return;
    error = "";
    try {
      const network = selectNetwork(app.state, builtInNetworks);
      const algod = createAlgodClient(network, app.state.fallbackEnabled);
      const indexer = createIndexerClient(network, app.state.fallbackEnabled);

      const result = await deriveHdAccounts({
        seed: seedBuffer,
        startIndex: offset,
        count: defaultHdDiscoveryCount,
        algod,
        indexer,
      });
      candidates = result;
      startIndex = offset;
      step = "select-accounts";
    } catch (e) {
      error = e instanceof Error ? e.message : "Discovery failed.";
    }
  }

  async function handleAdd() {
    if (!seedBuffer || !app.core) return;
    error = "";
    try {
      const selected = candidates.filter((c) =>
        selectedAddresses.has(c.address),
      );
      if (selected.length === 0) {
        error = "Select at least one account.";
        return;
      }

      const added = await addHdAccounts({
        selected,
        allCandidates: candidates,
        seedId: seeds.find((s) => s.data)!.id,
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
    <h2 class="text-xl font-mono tracking-tight">HD Account Discovery</h2>
  </div>

  {#if step === "select-seed"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Select a BIP39 seed</Card.Title>
        <Card.Description
          >Choose a seed to discover HD accounts from.</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-2">
        {#if seeds.length === 0}
          <p class="text-sm text-muted-foreground">
            No seeds found. Import or create a BIP39 seed first.
          </p>
        {/if}
        {#each seeds as seed (seed.id)}
          <Card.Root
            class="cursor-pointer hover:bg-accent/50"
            onclick={() => proceedToPassword(seed.id)}
          >
            <Card.Header>
              <Card.Title class="text-sm">Seed ID {seed.id}</Card.Title>
              <Card.Description>
                {seed.credentialId ? "Passkey seed" : "Encrypted BIP39 seed"}
              </Card.Description>
            </Card.Header>
          </Card.Root>
        {/each}
      </Card.Content>
    </Card.Root>
  {:else if step === "password"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Enter seed passphrase</Card.Title>
        <Card.Description
          >Unlock the seed to discover HD accounts.</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-3">
        <input
          type="password"
          bind:value={passphrase}
          class="w-full rounded border border-input bg-background p-2 text-sm"
          placeholder="Seed passphrase"
        />
        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
      <Card.Footer>
        <Button onclick={handlePassword} disabled={!passphrase}
          >Unlock & Discover</Button
        >
      </Card.Footer>
    </Card.Root>
  {:else if step === "discovering"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Discovering accounts...</Card.Title>
        <Card.Description
          >Scanning the blockchain for HD accounts.</Card.Description
        >
      </Card.Header>
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
            discover(Math.max(0, startIndex - defaultHdDiscoveryCount))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          onclick={() => discover(startIndex + defaultHdDiscoveryCount)}
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
          >{addedCount} HD account(s) added to the wallet.</Card.Description
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
