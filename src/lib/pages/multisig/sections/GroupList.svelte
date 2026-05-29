<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Separator } from "$lib/components/ui/separator";
	import { getMultisigPageState } from "../multisig-page-state.svelte";

	const state = getMultisigPageState();
</script>

{#if state.arc55App && state.arc55App.groups.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title>Transaction Groups ({state.arc55App.groups.length})</Card.Title>
			<Card.Description>
				Expand a group to view transactions, member signatures, and perform actions.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3">
			{#each state.arc55App.groups as group (group.nonce.toString())}
				{@const expanded = state.isExpanded(group.nonce)}
				{@const sigCount = state.signatureCount(group)}
				{@const sigNeeded = state.signatureNeeded(group)}
				{@const canSubmit = state.canSubmit(group)}
				<div class="rounded-lg border">
					<button
						type="button"
						class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
						onclick={() => state.toggleGroup(group.nonce)}
					>
						<div class="flex items-center gap-3 min-w-0">
							<span class="text-sm font-medium shrink-0">Group #{group.nonce.toString()}</span>
							<Badge variant="outline" class="shrink-0">{group.txns.length} txns</Badge>
							<Badge
								variant={sigCount >= sigNeeded ? "default" : "secondary"}
								class="shrink-0"
							>
								{sigCount}/{sigNeeded} sigs
							</Badge>
						</div>
						<span class="text-muted-foreground shrink-0">{expanded ? "▾" : "▸"}</span>
					</button>
					{#if expanded}
						<Separator />
						<div class="grid gap-3 p-4">
							{#if group.txns.length === 0}
								<p class="text-sm text-muted-foreground">No transactions in this group.</p>
							{:else}
								{#each group.txns as txn, txnIndex}
									<div class="rounded border bg-muted/30 px-3 py-2">
										<div class="mb-1 flex items-center gap-2">
											<span class="text-xs font-medium text-muted-foreground">
												Txn #{txnIndex}
											</span>
											<span class="font-mono text-xs break-all text-muted-foreground">
												{txn.txID().slice(0, 16)}...
											</span>
										</div>
										<div class="flex flex-wrap items-center gap-1.5">
											{#if group.sigs.some((m) => m.sigs.length > txnIndex && m.sigs[txnIndex] != null)}
												<span class="text-xs text-muted-foreground">Signed by:</span>
												{#each group.sigs as member}
													{#if member.sigs.length > txnIndex && member.sigs[txnIndex] != null}
														<Badge variant="outline" class="text-xs">
															{member.addr.slice(0, 8)}...
														</Badge>
													{/if}
												{/each}
											{:else}
												<span class="text-xs text-muted-foreground">No signatures yet</span>
											{/if}
										</div>
									</div>
								{/each}
							{/if}
							<div class="flex flex-wrap gap-2">
								{#if canSubmit}
									<Button
										size="sm"
										onclick={() => state.submitGroup(group.nonce)}
									>
										Submit Group
									</Button>
								{:else if group.txns.length > 0}
									<Button size="sm" variant="outline" disabled>
										Needs {sigNeeded - sigCount} more sigs
									</Button>
								{/if}
								{#if state.isMember && group.sigs.length > 0}
									<Button
										size="sm"
										variant="outline"
										onclick={() => state.clearSignatures(group.nonce)}
									>
										Clear My Signatures
									</Button>
								{/if}
								{#if state.isMember}
									<Button
										size="sm"
										variant="destructive"
										onclick={() => state.deleteGroup(group.nonce)}
									>
										Delete Group
									</Button>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{:else if state.arc55App}
	<Card.Root>
		<Card.Header>
			<Card.Title>Transaction Groups</Card.Title>
			<Card.Description>No transaction groups yet.</Card.Description>
		</Card.Header>
	</Card.Root>
{/if}
