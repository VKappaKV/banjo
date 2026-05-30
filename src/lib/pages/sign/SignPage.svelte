<script lang="ts">
  import { onMount } from "svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { getWalletAppContext } from "$lib/app/context";
  import { SignPageState } from "./sign-page-state.svelte";
  import SigningWarnings from "./sections/SigningWarnings.svelte";
  import TransactionReviewList from "./sections/TransactionReviewList.svelte";

  const app = getWalletAppContext();
  const state = new SignPageState(app);

  onMount(() => {
    void state.load();
  });
</script>

<div class="grid gap-6">
  <div>
    <h2 class="text-2xl font-mono tracking-tight">Review dApp request</h2>
    <p class="text-muted-foreground text-sm">
      Inspect the request before signing.
    </p>
  </div>

  {#if state.request.loading || state.preparing}
    <Card.Root
      ><Card.Header><Card.Title>Loading request</Card.Title></Card.Header
      ></Card.Root
    >
  {:else if state.request.done}
    <Card.Root
      ><Card.Header
        ><Card.Title>Signing response sent</Card.Title><Card.Description
          >You can close this panel.</Card.Description
        ></Card.Header
      ></Card.Root
    >
  {:else if state.request.error}
    <Alert.Root variant="destructive"
      ><Alert.Description>{state.request.error}</Alert.Description></Alert.Root
    >
  {:else if state.error && !state.preparedSign && !state.preparedData}
    <Alert.Root variant="destructive"
      ><Alert.Description>{state.error}</Alert.Description></Alert.Root
    >
  {:else if state.preparedSign}
    <Card.Root>
      <Card.Header>
        <Card.Title>Transaction signing request</Card.Title>
        <Card.Description
          >{state.preparedSign.networkName} · {state.preparedSign.transactions
            .length} transaction(s)</Card.Description
        >
      </Card.Header>
      <Card.Content class="grid gap-4">
        <SigningWarnings {state} />
        <TransactionReviewList
          prepared={state.preparedSign}
          assetLabels={state.assetLabels}
        />
        {#if state.needsPassword}
          <div class="grid gap-2">
            <label class="text-sm font-medium" for="password"
              >Signing password</label
            >
            <input
              id="password"
              type="password"
              bind:value={state.password}
              class="w-full rounded border border-input bg-background p-2 text-sm"
            />
          </div>
        {/if}
        {#if state.error}<Alert.Root variant="destructive"
            ><Alert.Description>{state.error}</Alert.Description></Alert.Root
          >{/if}
      </Card.Content>
      <Card.Footer class="flex flex-wrap gap-2">
        <Button onclick={state.approve}>Approve & Sign</Button>
		<Button variant="outline" onclick={state.reject}>Reject</Button>
      </Card.Footer>
    </Card.Root>
  {:else if state.preparedData}
    <Card.Root>
      <Card.Header>
        <Card.Title>{state.preparedData.title}</Card.Title>
        <Card.Description>Sign in with Algorand</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-4">
        <div class="rounded border bg-muted p-3 text-sm whitespace-pre-wrap">
          {state.preparedData.summary}
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <span class="text-muted-foreground">Domain</span><span
            >{state.preparedData.request.siwa.domain}</span
          >
          <span class="text-muted-foreground">Signer</span><span
            class="break-all"
            >{state.preparedData.request.siwa.account_address}</span
          >
        </div>
        {#if state.needsPassword}
          <div class="grid gap-2">
            <label class="text-sm font-medium" for="data-password"
              >Signing password</label
            >
            <input
              id="data-password"
              type="password"
              bind:value={state.password}
              class="w-full rounded border border-input bg-background p-2 text-sm"
            />
          </div>
        {/if}
        {#if state.error}<Alert.Root variant="destructive"
            ><Alert.Description>{state.error}</Alert.Description></Alert.Root
          >{/if}
      </Card.Content>
      <Card.Footer class="flex flex-wrap gap-2">
        <Button onclick={state.approve}>Approve & Sign</Button>
		<Button variant="outline" onclick={state.reject}>Reject</Button>
      </Card.Footer>
    </Card.Root>
  {:else}
    <Alert.Root variant="destructive"
      ><Alert.Description>No sign request is pending.</Alert.Description
      ></Alert.Root
    >
  {/if}
</div>
