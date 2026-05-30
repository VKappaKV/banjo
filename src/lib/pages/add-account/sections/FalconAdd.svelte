<script lang="ts">
  import { push } from "svelte-spa-router";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { createAlgodClient } from "$core/network";
  import { builtInNetworks } from "$core/data/networks";
  import { selectNetwork } from "$core/state";
  import { addFalconAccount } from "$core/keys";
  import { getWalletAppContext } from "$lib/app/context";

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const app = getWalletAppContext();

  type Step = "select-seed" | "password" | "deriving" | "done";
  let step = $state<Step>("select-seed");
  let error = $state("");
  let passphrase = $state("");
  let savedAddr = $state("");

  const seeds = $derived(app.state.seeds.filter((s) => !s.credentialId));

  async function proceedToPassword(seedId: number) {
    error = "";
    passphrase = "";
    step = "password";
  }

  async function handleDerive() {
    error = "";
    if (!app.core) {
      error = "Wallet not initialized.";
      return;
    }

    const seedData = seeds.find((s) => s.data);
    if (!seedData) {
      error = "No seed found.";
      return;
    }

	let seed: Buffer;
	try {
		app.core.logger.info({ namespace: "onboarding", event: "falcon-seed-decrypt-started" });
		const { decryptStoredSeed } = await import("$core/keys");
      seed = await decryptStoredSeed({
        passphrase,
        seedData,
        cryptoProvider: app.core.cryptoProvider,
		});
		app.core.logger.info({ namespace: "onboarding", event: "falcon-seed-decrypt-completed" });
	} catch (e) {
		error = e instanceof Error ? e.message : "Incorrect passphrase.";
		app.core.logger.error({ namespace: "onboarding", event: "falcon-seed-decrypt-failed", error: e });
		return;
    }

    step = "deriving";
	try {
		app.core.logger.info({ namespace: "onboarding", event: "falcon-add-started" });
		const network = selectNetwork(app.state, builtInNetworks);
      const algod = createAlgodClient(network, app.state.fallbackEnabled);

      const account = await addFalconAccount({
        seedId: seedData.id,
        seed: new Uint8Array(seed),
        algod,
        state: app.state,
        storage: app.core.storage,
        zeroizeSeed: true,
      });
		savedAddr = account.addr;
		app.core.logger.info({ namespace: "onboarding", event: "falcon-add-completed", fields: { address: account.addr } });
		step = "done";
      await app.refreshWallet();
	} catch (e) {
		error = e instanceof Error ? e.message : "Falcon derivation failed.";
		app.core.logger.error({ namespace: "onboarding", event: "falcon-add-failed", error: e });
		step = "select-seed";
    }
  }
</script>

<div class="grid gap-4">
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
    <h2 class="text-xl font-mono tracking-tight">Falcon Account</h2>
  </div>

  {#if step === "select-seed"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Select a seed</Card.Title>
        <Card.Description
          >Choose a BIP39 seed for Falcon key derivation. Derivation may take a
          moment.</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-2">
        {#if seeds.length === 0}
          <p class="text-sm text-muted-foreground">
            No BIP39 seeds found. Import a seed first.
          </p>
        {/if}
        {#each seeds as seed (seed.id)}
          <Card.Root
            class="cursor-pointer hover:bg-accent/50"
            onclick={() => proceedToPassword(seed.id)}
          >
            <Card.Header>
              <Card.Title class="text-sm">Seed ID {seed.id}</Card.Title>
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
          >Unlock the seed for Falcon derivation.</Card.Description
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
        <Button onclick={handleDerive} disabled={!passphrase}
          >Derive Falcon Account</Button
        >
      </Card.Footer>
    </Card.Root>
  {:else if step === "deriving"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Deriving Falcon account...</Card.Title>
        <Card.Description
          >This may take a few moments as the key is generated and the
          blockchain is queried.</Card.Description
        >
      </Card.Header>
      <Card.Content>
        {#if error}
          <Alert.Root variant="destructive">
            <Alert.Description>{error}</Alert.Description>
          </Alert.Root>
        {/if}
      </Card.Content>
    </Card.Root>
  {:else if step === "done"}
    <Card.Root>
      <Card.Header>
        <Card.Title>Falcon Account Added</Card.Title>
        <Card.Description>Address: {savedAddr.slice(0, 8)}...</Card.Description>
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
