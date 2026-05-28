<script lang="ts">
	import algosdk, { type modelsv2, type SuggestedParams, type Transaction } from "algosdk";
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Select from "$lib/components/ui/select";
	import { createArc59AppClient, executeArc59SendAssetPlan } from "$core/apps";
	import { getAssetInfo } from "$core/assets";
	import { createAlgodClient, searchNames } from "$core/network";
	import { selectNetwork } from "$core/state";
	import {
		buildArc59SendAssetPlan,
		buildAssetTransferPlan,
		buildOfflineKeyreg,
		buildOnlineKeyreg,
		buildPaymentTransaction,
		buildRekeyTransaction,
		estimateAverageBlockTimeMs,
		parseGoalPartkeyInfo,
		submitSignedTransactions,
	} from "$core/transactions";
	import {
		createBanjoTransactionSigner,
		signWalletTransactionRequest,
		transactionRequestNeedsPassword,
		walletTransactionsFromGroup,
	} from "$core/signing";
	import { builtInNetworks } from "$core/data/networks";
	import { assetHoldingAmount, assetHoldingId, formatAssetAmount, formatMicroAlgos } from "$lib/app/portfolio";
	import { queryClient } from "$lib/app/query-client";
	import { queryKeys } from "$lib/app/query-keys";
	import { getWalletAppContext } from "$lib/app/context";

	type SendMode = "algo" | "asa" | "rekey" | "online-keyreg" | "offline-keyreg";
	type Step = "form" | "review" | "submitting" | "done";
	type ReviewPlan =
		| { type: "direct"; transactions: Transaction[]; needsPassword: boolean; warnings: string[] }
		| {
				type: "arc59";
				needsPassword: boolean;
				warnings: string[];
				assetId: bigint;
				assetDecimals: number;
				suggestedParams: SuggestedParams;
				mbrPaymentAmount: bigint;
				appCallFee: bigint;
				totalInnerTransactionCount: bigint;
			};

	const app = getWalletAppContext();

	let step = $state<Step>("form");
	let mode = $state<SendMode>("algo");
	let sender = $state("");
	let receiver = $state("");
	let amount = $state("");
	let note = $state("");
	let closeTo = $state("");
	let clawbackSender = $state("");
	let rekeyTo = $state("");
	let recipientSearch = $state("");
	let recipientResults = $state<Array<{ title: string; value: string }>>([]);
	let recipientSearching = $state(false);
	let selectedAssetId = $state("");
	let partkeyText = $state("");
	let voteFirst = $state("");
	let voteLast = $state("");
	let voteKeyDilution = $state("");
	let voteKey = $state("");
	let selectionKey = $state("");
	let stateProofKey = $state("");
	let incentiveEligible = $state(false);
	let nonParticipation = $state(false);
	let averageBlockMs = $state<number | undefined>();
	let password = $state("");
	let error = $state("");
	let txId = $state("");
	let review = $state<ReviewPlan | null>(null);

	let signableAccounts = $derived(app.accounts.filter((account) => account.canSign));
	let selectedAccount = $derived(signableAccounts.find((account) => account.addr === sender) ?? signableAccounts[0]);
	let assetHoldings = $derived(selectedAccount?.info?.assets ?? []);
	let noteBytes = $derived(new TextEncoder().encode(note).byteLength);
	let selectedNetwork = $derived(selectNetwork(app.state, builtInNetworks));
	let selectedStoredAccount = $derived(app.state.accounts.find((account) => account.addr === sender));
	let ledgerReview = $derived(!!selectedStoredAccount && selectedStoredAccount.slot !== undefined && selectedStoredAccount.seedId === undefined && !selectedStoredAccount.falcon);

	$effect(() => {
		if (!sender && selectedAccount) sender = selectedAccount.addr;
		if (!selectedAssetId && assetHoldings[0]) selectedAssetId = assetHoldingId(assetHoldings[0]).toString();
	});

	function resetReview() {
		error = "";
		password = "";
		review = null;
		step = "form";
	}

	function requireAddress(address: string, label: string) {
		if (!algosdk.isValidAddress(address.trim())) {
			throw new Error(`${label} must be a valid Algorand address.`);
		}

		return address.trim();
	}

	function validateCommon() {
		if (!app.core) throw new Error("Wallet not initialized.");
		if (!sender) throw new Error("Select a sender account.");
		if (noteBytes > 1000) throw new Error("Note must be 1000 bytes or less.");
	}

	async function searchRecipient() {
		recipientSearching = true;
		recipientResults = [];
		try {
			if (!app.core || !recipientSearch.trim()) return;

			recipientResults = await searchNames({
				query: recipientSearch.trim(),
				network: selectedNetwork,
				fetchJson: app.core.fetchJson,
			});
		} catch {
			recipientResults = [];
		} finally {
			recipientSearching = false;
		}
	}

	function applyPartkeyPaste() {
		const parsed = parseGoalPartkeyInfo(partkeyText);
		voteFirst = parsed.voteFirst?.toString() ?? voteFirst;
		voteLast = parsed.voteLast?.toString() ?? voteLast;
		voteKeyDilution = parsed.voteKeyDilution?.toString() ?? voteKeyDilution;
		voteKey = parsed.voteKey ?? voteKey;
		selectionKey = parsed.selectionKey ?? selectionKey;
		stateProofKey = parsed.stateProofKey ?? stateProofKey;
	}

	async function estimateBlockTime() {
		error = "";
		try {
			const algod = createAlgodClient(selectedNetwork, app.state.fallbackEnabled);
			const estimate = await estimateAverageBlockTimeMs(algod);
			averageBlockMs = estimate.averageBlockTimeMs;
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to estimate block time.";
		}
	}

	async function suggestedParams(algod: ReturnType<typeof createAlgodClient>): Promise<SuggestedParams> {
		return (await algod.getTransactionParams().do()) as SuggestedParams;
	}

	async function selectedAsset(algod: ReturnType<typeof createAlgodClient>) {
		if (!selectedAssetId) throw new Error("Select an asset.");

		const assetId = BigInt(selectedAssetId);
		const asset = await getAssetInfo({
			assetId,
			networkName: app.state.networkName,
			algod,
			storage: app.core!.storage,
			fetchJson: app.core!.fetchJson,
		});

		return { assetId, decimals: asset?.params.decimals ?? 0 };
	}

	function directNeedsPassword(transactions: Transaction[]) {
		const walletTransactions = walletTransactionsFromGroup(transactions);

		return transactionRequestNeedsPassword({
			walletTransactions,
			transactions,
			context: { state: app.state },
		});
	}

	function senderNeedsPassword() {
		const account = app.state.accounts.find((item) => item.addr === sender);
		const seedId = account?.seedId;
		if (seedId == null) return false;

		const seed = app.state.seeds.find((item) => item.id === seedId);
		return !!seed && !seed.credentialId;
	}

	async function buildReview() {
		error = "";
		try {
			validateCommon();

			const algod = createAlgodClient(selectedNetwork, app.state.fallbackEnabled);
			const params = await suggestedParams(algod);

			if (mode === "algo") {
				const txn = buildPaymentTransaction({
					sender,
					receiver: requireAddress(receiver, "Receiver"),
					amount,
					closeRemainderTo: closeTo.trim() ? requireAddress(closeTo, "Close remainder address") : undefined,
					note: note || undefined,
					suggestedParams: params,
				});
				review = { type: "direct", transactions: [txn], needsPassword: directNeedsPassword([txn]), warnings: [] };
			} else if (mode === "rekey") {
				const txn = buildRekeyTransaction({
					sender,
					rekeyTo: requireAddress(rekeyTo, "New auth address"),
					note: note || undefined,
					suggestedParams: params,
				});
				review = {
					type: "direct",
					transactions: [txn],
					needsPassword: directNeedsPassword([txn]),
					warnings: ["Rekeying changes who can authorize future transactions for this account."],
				};
			} else if (mode === "offline-keyreg") {
				const txn = buildOfflineKeyreg({
					sender,
					suggestedParams: params,
					note: note || undefined,
					nonParticipation,
				});
				review = {
					type: "direct",
					transactions: [txn],
					needsPassword: directNeedsPassword([txn]),
					warnings: [nonParticipation ? "Non-participation is intended to be irreversible." : "This will register offline participation keys."],
				};
			} else if (mode === "online-keyreg") {
				const txn = buildOnlineKeyreg({
					sender,
					voteFirst: BigInt(voteFirst),
					voteLast: BigInt(voteLast),
					voteKeyDilution: BigInt(voteKeyDilution),
					voteKey,
					selectionKey,
					stateProofKey: stateProofKey.trim() || undefined,
					incentiveEligible,
					suggestedParams: params,
					note: note || undefined,
				});
				review = {
					type: "direct",
					transactions: [txn],
					needsPassword: directNeedsPassword([txn]),
					warnings: incentiveEligible ? ["Incentive-eligible online registration uses a flat 2 ALGO fee."] : [],
				};
			} else {
				const { assetId, decimals } = await selectedAsset(algod);
				const recipient = requireAddress(receiver, "Receiver");
				const receiverAccount = (await algod.accountInformation(recipient).do()) as modelsv2.Account;
				const plan = buildAssetTransferPlan({
					sender,
					receiver: recipient,
					assetId,
					assetDecimals: decimals,
					amount,
					closeRemainderTo: closeTo.trim() ? requireAddress(closeTo, "Close asset address") : undefined,
					assetSender: clawbackSender.trim() ? requireAddress(clawbackSender, "Clawback sender") : undefined,
					note: note || undefined,
					suggestedParams: params,
					receiverAccount,
					network: selectedNetwork,
				});

				if (plan.type === "direct") {
					review = { type: "direct", transactions: [plan.transaction], needsPassword: directNeedsPassword([plan.transaction]), warnings: [] };
				} else if (plan.type === "requires-arc59") {
					if (!app.core?.approvalController) throw new Error("Signing approval controller is not available.");

					const signer = createBanjoTransactionSigner({
						state: app.state,
						storage: app.core.storage,
						ledgerProvider: app.core.ledgerProvider,
						credentialProvider: app.core.credentialProvider,
						cryptoProvider: app.core.cryptoProvider,
						algod,
					});
					const arc59Client = createArc59AppClient({ appId: plan.routerAppId, sender, algod, signer });
					const arc59Plan = await buildArc59SendAssetPlan({
						arc59Client,
						sender,
						receiver: recipient,
						assetId,
						assetDecimals: decimals,
						amount,
						suggestedParams: params,
						note: note || undefined,
						closeRemainderTo: closeTo.trim() || undefined,
						assetSender: clawbackSender.trim() || undefined,
						signer,
					});

					if (arc59Plan.type === "direct") {
						review = { type: "direct", transactions: [arc59Plan.transaction], needsPassword: directNeedsPassword([arc59Plan.transaction]), warnings: [] };
					} else {
						review = {
							type: "arc59",
							needsPassword: senderNeedsPassword(),
							warnings: ["Receiver is not opted in. Banjo will route this ASA through ARC-59."],
							assetId,
							assetDecimals: decimals,
							suggestedParams: params,
							mbrPaymentAmount: arc59Plan.mbrPaymentAmount,
							appCallFee: arc59Plan.appCallFee,
							totalInnerTransactionCount: arc59Plan.totalInnerTransactionCount,
						};
					}
				} else {
					throw new Error("Receiver is not opted into this asset and no ARC-59 router is configured.");
				}
			}

			step = "review";
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to build transaction.";
		}
	}

	async function signDirect(transactions: Transaction[]) {
		if (!app.core) throw new Error("Wallet not initialized.");
		const response = await signWalletTransactionRequest({
			walletTransactions: walletTransactionsFromGroup(transactions),
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

		return response.signedTransactions.filter((txn): txn is Uint8Array => !!txn);
	}

	async function executeArc59(plan: Extract<ReviewPlan, { type: "arc59" }>) {
		if (!app.core) throw new Error("Wallet not initialized.");

		const algod = createAlgodClient(selectedNetwork, app.state.fallbackEnabled);
		const signer = createBanjoTransactionSigner({
			state: app.state,
			storage: app.core.storage,
			ledgerProvider: app.core.ledgerProvider,
			credentialProvider: app.core.credentialProvider,
			cryptoProvider: app.core.cryptoProvider,
			algod,
			password: password || undefined,
		});
		const routerAppId = selectedNetwork.inboxRouter;
		if (routerAppId === undefined) throw new Error("No ARC-59 router configured for this network.");

		const arc59Client = createArc59AppClient({ appId: routerAppId, sender, algod, signer });
		const arc59Plan = await buildArc59SendAssetPlan({
			arc59Client,
			sender,
			receiver: requireAddress(receiver, "Receiver"),
			assetId: plan.assetId,
			assetDecimals: plan.assetDecimals,
			amount,
			suggestedParams: plan.suggestedParams,
			note: note || undefined,
			closeRemainderTo: closeTo.trim() || undefined,
			assetSender: clawbackSender.trim() || undefined,
			signer,
		});

		return executeArc59SendAssetPlan(arc59Plan);
	}

	async function submitReview() {
		if (!review) return;
		error = "";
		step = "submitting";

		try {
			if (review.needsPassword && !password) throw new Error("Password is required to sign with this account.");

			const algod = createAlgodClient(selectedNetwork, app.state.fallbackEnabled);
			if (review.type === "direct") {
				const signed = await signDirect(review.transactions);
				await submitSignedTransactions({ algod, signedTransactions: signed });
				txId = review.transactions[0]?.txID() ?? "Submitted";
			} else {
				await executeArc59(review);
				txId = "ARC-59 group submitted";
			}

			await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(app.state.networkName) });
			step = "done";
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to submit transaction.";
			step = "review";
		}
	}
</script>

<div class="grid gap-6">
	<div>
		<h2 class="text-2xl font-semibold tracking-tight">Send</h2>
		<p class="text-muted-foreground text-sm">Build, review, sign, and submit wallet-initiated transactions.</p>
	</div>

	{#if signableAccounts.length === 0}
		<Alert.Root variant="destructive">
			<Alert.Title>No signable accounts</Alert.Title>
			<Alert.Description>Add or import a signing account before sending transactions.</Alert.Description>
		</Alert.Root>
	{:else if step === "form"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Transaction details</Card.Title>
				<Card.Description>Choose a sender and transaction type.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<div class="grid gap-2">
					<label class="text-sm font-medium" for="sender">Sender</label>
					<Select.Root type="single" value={sender} onValueChange={(value) => typeof value === "string" && (sender = value)}>
						<Select.Trigger id="sender">{selectedAccount?.ns?.name ?? selectedAccount?.title ?? "Select sender"}</Select.Trigger>
						<Select.Content>
							{#each signableAccounts as account (account.addr)}
								<Select.Item value={account.addr} label={account.ns?.name ?? account.title} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="flex flex-wrap gap-2">
					{#each ["algo", "asa", "rekey", "online-keyreg", "offline-keyreg"] as item (item)}
						<Button variant={mode === item ? "default" : "outline"} onclick={() => (mode = item as SendMode)}>
							{item === "algo" ? "ALGO" : item === "asa" ? "ASA" : item === "rekey" ? "Rekey" : item === "online-keyreg" ? "Online keyreg" : "Offline keyreg"}
						</Button>
					{/each}
				</div>

				{#if mode === "asa"}
					<div class="grid gap-2">
						<label class="text-sm font-medium" for="asset">Asset</label>
						<Select.Root type="single" value={selectedAssetId} onValueChange={(value) => typeof value === "string" && (selectedAssetId = value)}>
							<Select.Trigger id="asset">{selectedAssetId ? `Asset ${selectedAssetId}` : "Select asset"}</Select.Trigger>
							<Select.Content>
								{#each assetHoldings as holding (assetHoldingId(holding).toString())}
									<Select.Item
										value={assetHoldingId(holding).toString()}
										label={`Asset ${assetHoldingId(holding).toString()} (${formatAssetAmount(assetHoldingAmount(holding), 0)})`}
									/>
								{/each}
							</Select.Content>
						</Select.Root>
						{#if assetHoldings.length === 0}
							<p class="text-muted-foreground text-sm">The selected account has no ASA holdings.</p>
						{/if}
					</div>
				{/if}

				{#if mode === "algo" || mode === "asa"}
					<div class="grid gap-2">
						<label class="text-sm font-medium" for="receiver">Receiver</label>
						<input id="receiver" bind:value={receiver} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Algorand address" />
						<div class="flex gap-2">
							<input bind:value={recipientSearch} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Search NFD name" />
							<Button variant="outline" onclick={searchRecipient} disabled={recipientSearching || !recipientSearch.trim()}>
								{recipientSearching ? "Searching" : "Search"}
							</Button>
						</div>
						{#if recipientResults.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each recipientResults as result (result.value)}
									<Button variant="outline" size="sm" onclick={() => (receiver = result.value)}>{result.title}</Button>
								{/each}
							</div>
						{/if}
					</div>
					<div class="grid gap-2">
						<label class="text-sm font-medium" for="amount">Amount</label>
						<input id="amount" bind:value={amount} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="0.00" />
					</div>
				{:else if mode === "rekey"}
					<Alert.Root>
						<Alert.Title>Rekey warning</Alert.Title>
						<Alert.Description>Rekeying changes the account authorized to sign future transactions.</Alert.Description>
					</Alert.Root>
					<div class="grid gap-2">
						<label class="text-sm font-medium" for="rekeyTo">New auth address</label>
						<input id="rekeyTo" bind:value={rekeyTo} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Algorand address" />
					</div>
				{:else if mode === "online-keyreg"}
					<div class="grid gap-3">
						<div class="grid gap-2">
							<label class="text-sm font-medium" for="partkey">Paste partkey info</label>
							<textarea id="partkey" bind:value={partkeyText} class="min-h-28 w-full rounded border border-input bg-background p-2 text-sm" placeholder="Paste goal account partkeyinfo output"></textarea>
							<div class="flex flex-wrap gap-2">
								<Button variant="outline" onclick={applyPartkeyPaste}>Parse Partkey</Button>
								<Button variant="outline" onclick={estimateBlockTime}>Estimate Block Time</Button>
								{#if averageBlockMs}<Badge variant="secondary">~{(averageBlockMs / 1000).toFixed(1)}s/block</Badge>{/if}
							</div>
						</div>
						<div class="grid gap-2 sm:grid-cols-3">
							<input bind:value={voteFirst} class="rounded border border-input bg-background p-2 text-sm" placeholder="First round" />
							<input bind:value={voteLast} class="rounded border border-input bg-background p-2 text-sm" placeholder="Last round" />
							<input bind:value={voteKeyDilution} class="rounded border border-input bg-background p-2 text-sm" placeholder="Key dilution" />
						</div>
						<input bind:value={voteKey} class="rounded border border-input bg-background p-2 text-sm" placeholder="Voting key (base64)" />
						<input bind:value={selectionKey} class="rounded border border-input bg-background p-2 text-sm" placeholder="Selection key (base64)" />
						<input bind:value={stateProofKey} class="rounded border border-input bg-background p-2 text-sm" placeholder="State proof key (base64, optional)" />
						<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={incentiveEligible} /> Incentive eligible</label>
					</div>
				{:else if mode === "offline-keyreg"}
					<Alert.Root>
						<Alert.Title>Offline participation</Alert.Title>
						<Alert.Description>Build an offline key registration transaction. Non-participation should be used with care.</Alert.Description>
					</Alert.Root>
					<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={nonParticipation} /> Mark account non-participating</label>
				{/if}

				<div class="grid gap-2">
					<label class="text-sm font-medium" for="note">Note</label>
					<textarea id="note" bind:value={note} class="min-h-20 w-full rounded border border-input bg-background p-2 text-sm" placeholder="Optional note"></textarea>
					<p class={noteBytes > 1000 ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{noteBytes}/1000 bytes</p>
				</div>

				{#if mode === "algo" || mode === "asa"}
					<div class="grid gap-2">
						<label class="text-sm font-medium" for="closeTo">{mode === "algo" ? "Close remainder to" : "Close asset to"}</label>
						<input id="closeTo" bind:value={closeTo} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Optional address" />
					</div>
				{/if}

				{#if mode === "asa"}
					<div class="grid gap-2">
						<label class="text-sm font-medium" for="clawbackSender">Clawback sender</label>
						<input id="clawbackSender" bind:value={clawbackSender} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Optional clawback target" />
					</div>
				{/if}

				{#if error}
					<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
				{/if}
			</Card.Content>
			<Card.Footer>
				<Button onclick={buildReview}>Review Transaction</Button>
			</Card.Footer>
		</Card.Root>
	{:else if step === "review" && review}
		<Card.Root>
			<Card.Header>
				<Card.Title>Review transaction</Card.Title>
				<Card.Description>Confirm these details before signing.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<div class="flex flex-wrap gap-2">
					<Badge variant="outline">{mode.toUpperCase()}</Badge>
					<Badge variant="secondary">{sender.slice(0, 8)}...</Badge>
					{#if review.type === "arc59"}<Badge variant="default">ARC-59</Badge>{/if}
				</div>
				<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
					<span class="text-muted-foreground">Sender</span><span class="break-all">{sender}</span>
					{#if mode !== "rekey"}<span class="text-muted-foreground">Receiver</span><span class="break-all">{receiver}</span>{/if}
					{#if mode !== "rekey"}<span class="text-muted-foreground">Amount</span><span>{amount}</span>{/if}
					{#if mode === "rekey"}<span class="text-muted-foreground">New auth</span><span class="break-all">{rekeyTo}</span>{/if}
					{#if selectedAssetId && mode === "asa"}<span class="text-muted-foreground">Asset</span><span>{selectedAssetId}</span>{/if}
					{#if closeTo}<span class="text-muted-foreground">Close to</span><span class="break-all">{closeTo}</span>{/if}
					{#if clawbackSender}<span class="text-muted-foreground">Clawback sender</span><span class="break-all">{clawbackSender}</span>{/if}
					{#if note}<span class="text-muted-foreground">Note</span><span>{note}</span>{/if}
					{#if review.type === "arc59"}
						<span class="text-muted-foreground">MBR payment</span><span>{formatMicroAlgos(review.mbrPaymentAmount)}</span>
						<span class="text-muted-foreground">App call fee</span><span>{formatMicroAlgos(review.appCallFee)}</span>
						<span class="text-muted-foreground">Inner transactions</span><span>{review.totalInnerTransactionCount.toString()}</span>
					{/if}
				</div>
				{#each review.warnings as warning}
					<Alert.Root><Alert.Description>{warning}</Alert.Description></Alert.Root>
				{/each}
				{#if review.needsPassword}
					<div class="grid gap-2">
						<label class="text-sm font-medium" for="password">Signing password</label>
						<input id="password" type="password" bind:value={password} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Required for this seed" />
					</div>
				{/if}
				{#if error}
					<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="flex flex-wrap gap-2">
				<Button onclick={submitReview}>Sign & Submit</Button>
				<Button variant="outline" onclick={resetReview}>Back</Button>
			</Card.Footer>
		</Card.Root>
	{:else if step === "submitting"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Submitting transaction</Card.Title>
				<Card.Description>{ledgerReview ? "Review the transaction on your Ledger device, then wait for confirmation." : "Signing and waiting for confirmation."}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if step === "done"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Transaction submitted</Card.Title>
				<Card.Description class="break-all">{txId}</Card.Description>
			</Card.Header>
			<Card.Footer class="flex gap-2">
				<Button onclick={() => { step = "form"; review = null; txId = ""; }}>Send Another</Button>
				<Button href="#/accounts" variant="outline">View Accounts</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
