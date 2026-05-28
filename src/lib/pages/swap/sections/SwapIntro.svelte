<script lang="ts">
	import algosdk, { type SuggestedParams, type Transaction } from "algosdk";
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Select from "$lib/components/ui/select";
	import { getAssetInfo } from "$core/assets";
	import { createAlgodClient } from "$core/network";
	import { selectNetwork } from "$core/state";
	import {
		assembleSwapSignedTransactions,
		buildAtomicSwapProposal,
		buildSwapAcceptancePlan,
		serializeSwapProposal,
		submitSignedTransactions,
		validateSwapProposal,
	} from "$core/transactions";
	import { signWalletTransactionRequest, walletTransactionsFromGroup } from "$core/signing";
	import { builtInNetworks } from "$core/data/networks";
	import { assetHoldingId } from "$lib/app/portfolio";
	import { queryClient } from "$lib/app/query-client";
	import { queryKeys } from "$lib/app/query-keys";
	import { getWalletAppContext } from "$lib/app/context";

	type SwapMode = "propose" | "accept";

	const app = getWalletAppContext();

	let mode = $state<SwapMode>("propose");
	let sender = $state("");
	let receiver = $state("");
	let senderAssetId = $state("0");
	let senderAmount = $state("");
	let receiverAssetId = $state("0");
	let receiverAmount = $state("");
	let acceptTx1 = $state("");
	let acceptTx2 = $state("");
	let password = $state("");
	let proposal = $state("");
	let error = $state("");
	let result = $state("");
	let accepting = $state(false);

	let signableAccounts = $derived(app.accounts.filter((account) => account.canSign));
	let selectedAccount = $derived(signableAccounts.find((account) => account.addr === sender) ?? signableAccounts[0]);
	let selectedNetwork = $derived(selectNetwork(app.state, builtInNetworks));
	let assetChoices = $derived([
		{ id: "0", label: "ALGO" },
		...(selectedAccount?.info?.assets ?? []).map((holding) => ({ id: assetHoldingId(holding).toString(), label: `Asset ${assetHoldingId(holding).toString()}` })),
	]);

	$effect(() => {
		if (!sender && selectedAccount) sender = selectedAccount.addr;
	});

	async function suggestedParams(algod: ReturnType<typeof createAlgodClient>): Promise<SuggestedParams> {
		return (await algod.getTransactionParams().do()) as SuggestedParams;
	}

	async function swapAsset(assetId: string, algod: ReturnType<typeof createAlgodClient>) {
		if (assetId === "0") return { index: 0n, params: { decimals: 6 } };

		const asset = await getAssetInfo({
			assetId: BigInt(assetId),
			networkName: app.state.networkName,
			algod,
			storage: app.core!.storage,
			fetchJson: app.core!.fetchJson,
		});

		return asset ?? { index: BigInt(assetId), params: { decimals: 0 } };
	}

	async function signTransactions(transactions: Transaction[], indexesToSign?: number[]) {
		if (!app.core) throw new Error("Wallet not initialized.");

		const response = await signWalletTransactionRequest({
			walletTransactions: walletTransactionsFromGroup(transactions, indexesToSign),
			context: {
				state: app.state,
				storage: app.core.storage,
				ledgerProvider: app.core.ledgerProvider,
				credentialProvider: app.core.credentialProvider,
				cryptoProvider: app.core.cryptoProvider,
				algod: createAlgodClient(selectedNetwork, app.state.fallbackEnabled),
				password: password || undefined,
			},
		});

		return response.signedTransactions;
	}

	async function buildProposal() {
		error = "";
		proposal = "";
		try {
			if (!app.core) throw new Error("Wallet not initialized.");
			if (!algosdk.isValidAddress(receiver.trim())) throw new Error("Receiver must be a valid Algorand address.");

			const algod = createAlgodClient(selectedNetwork, app.state.fallbackEnabled);
			const params = await suggestedParams(algod);
			const built = buildAtomicSwapProposal({
				sender,
				receiver: receiver.trim(),
				senderAsset: await swapAsset(senderAssetId, algod),
				senderAmount,
				receiverAsset: await swapAsset(receiverAssetId, algod),
				receiverAmount,
				suggestedParams: params,
			});
			const [signedTxn1] = await signTransactions([built.txn1, built.txn2], [0]);
			if (!signedTxn1) throw new Error("First swap transaction was not signed.");

			proposal = JSON.stringify(serializeSwapProposal({ signedTxn1, unsignedTxn2: built.txn2 }));
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to build swap proposal.";
		}
	}

	async function acceptProposal() {
		error = "";
		result = "";
		accepting = true;
		try {
			let tx1 = acceptTx1.trim();
			let tx2 = acceptTx2.trim();
			if (acceptTx1.trim().startsWith("{")) {
				const parsed = JSON.parse(acceptTx1) as { tx1?: string; tx2?: string };
				tx1 = parsed.tx1 ?? "";
				tx2 = parsed.tx2 ?? "";
			}

			const validated = await validateSwapProposal({
				tx1,
				tx2,
				networks: app.allNetworks,
				algodForNetwork: (network) => createAlgodClient(network, app.state.fallbackEnabled),
			});
			const plan = buildSwapAcceptancePlan(validated);
			const signed = await signTransactions([...plan.transactions], plan.indexesToSign);
			const signedTxn2 = signed[1];
			if (!signedTxn2) throw new Error("Second swap transaction was not signed.");

			const algod = createAlgodClient(validated.network, app.state.fallbackEnabled);
			await submitSignedTransactions({
				algod,
				signedTransactions: assembleSwapSignedTransactions({ signedTxn1: plan.signedTxn1, signedTxn2 }),
			});
			await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(app.state.networkName) });
			result = "Swap accepted and submitted.";
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to accept swap.";
		} finally {
			accepting = false;
		}
	}
</script>

<div class="grid gap-6">
	<div>
		<h2 class="text-2xl font-semibold tracking-tight">Atomic Swap</h2>
		<p class="text-muted-foreground text-sm">Create or accept a two-party reciprocal swap proposal.</p>
	</div>

	<div class="flex flex-wrap gap-2">
		<Button variant={mode === "propose" ? "default" : "outline"} onclick={() => (mode = "propose")}>Create Proposal</Button>
		<Button variant={mode === "accept" ? "default" : "outline"} onclick={() => (mode = "accept")}>Accept Proposal</Button>
	</div>

	{#if signableAccounts.length === 0}
		<Alert.Root variant="destructive"><Alert.Description>No signable accounts available.</Alert.Description></Alert.Root>
	{:else if mode === "propose"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Create swap proposal</Card.Title>
				<Card.Description>Sign your side and share the serialized proposal with the counterparty.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<Select.Root type="single" value={sender} onValueChange={(value) => typeof value === "string" && (sender = value)}>
					<Select.Trigger>{selectedAccount?.ns?.name ?? selectedAccount?.title ?? "Select sender"}</Select.Trigger>
					<Select.Content>
						{#each signableAccounts as account (account.addr)}
							<Select.Item value={account.addr} label={account.ns?.name ?? account.title} />
						{/each}
					</Select.Content>
				</Select.Root>
				<input bind:value={receiver} class="rounded border border-input bg-background p-2 text-sm" placeholder="Counterparty address" />
				<div class="grid gap-2 sm:grid-cols-2">
					<Select.Root type="single" value={senderAssetId} onValueChange={(value) => typeof value === "string" && (senderAssetId = value)}>
						<Select.Trigger>Send {assetChoices.find((asset) => asset.id === senderAssetId)?.label ?? senderAssetId}</Select.Trigger>
						<Select.Content>{#each assetChoices as asset (asset.id)}<Select.Item value={asset.id} label={asset.label} />{/each}</Select.Content>
					</Select.Root>
					<input bind:value={senderAmount} class="rounded border border-input bg-background p-2 text-sm" placeholder="You send amount" />
				</div>
				<div class="grid gap-2 sm:grid-cols-2">
					<input bind:value={receiverAssetId} class="rounded border border-input bg-background p-2 text-sm" placeholder="Counterparty asset ID (0 for ALGO)" />
					<input bind:value={receiverAmount} class="rounded border border-input bg-background p-2 text-sm" placeholder="They send amount" />
				</div>
				{#if password !== undefined}
					<input type="password" bind:value={password} class="rounded border border-input bg-background p-2 text-sm" placeholder="Signing password if required" />
				{/if}
				{#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
				{#if proposal}
					<textarea readonly class="min-h-32 rounded border border-input bg-muted p-2 text-xs" value={proposal}></textarea>
				{/if}
			</Card.Content>
			<Card.Footer><Button onclick={buildProposal}>Build Signed Proposal</Button></Card.Footer>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Accept swap proposal</Card.Title>
				<Card.Description>Paste the JSON proposal or both serialized transaction fields.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<textarea bind:value={acceptTx1} class="min-h-32 rounded border border-input bg-background p-2 text-sm" placeholder='Paste proposal JSON or tx1'></textarea>
				<input bind:value={acceptTx2} class="rounded border border-input bg-background p-2 text-sm" placeholder="tx2 if not using JSON" />
				<input type="password" bind:value={password} class="rounded border border-input bg-background p-2 text-sm" placeholder="Signing password if required" />
				{#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
				{#if result}<Alert.Root><Alert.Description>{result}</Alert.Description></Alert.Root>{/if}
			</Card.Content>
			<Card.Footer><Button onclick={acceptProposal} disabled={accepting}>{accepting ? "Submitting" : "Accept & Submit"}</Button></Card.Footer>
		</Card.Root>
	{/if}
</div>
