<script lang="ts">
	import { Button } from '@neoworks-dev/ui'
	import { onDestroy } from 'svelte'
	import { mailState } from '../state/mail.svelte'

	// One shared ticker drives every countdown; runs only while toasts exist.
	let now = $state(Date.now())
	let ticker: ReturnType<typeof setInterval> | null = null

	$effect(() => {
		const hasPending = mailState.pendingSends.some((entry) => entry.status === 'pending')
		if (hasPending && ticker === null) {
			ticker = setInterval(() => (now = Date.now()), 250)
		}
		if (!hasPending && ticker !== null) {
			clearInterval(ticker)
			ticker = null
		}
	})

	onDestroy(() => {
		if (ticker !== null) clearInterval(ticker)
	})

	function secondsLeft(sendAt: number): number {
		return Math.max(0, Math.ceil((sendAt - now) / 1000))
	}

	function recipientLabel(to: string): string {
		const first = to.split(',')[0].trim()
		if (first === '') return 'recipient'
		return first
	}
</script>

{#if mailState.pendingSends.length > 0}
	<div class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
		{#each mailState.pendingSends as pending (pending.sendId)}
			<div
				class="border-line bg-elevated flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-lg"
			>
				{#if pending.status === 'pending'}
					<span class="text-sm">
						Sending to {recipientLabel(pending.to)} in {secondsLeft(pending.sendAt)}s
					</span>
					<Button size="sm" onclick={() => void mailState.undoSend(pending.sendId)}>Undo</Button>
				{:else}
					<span class="text-red min-w-0 max-w-96 truncate text-sm" title={pending.errorMessage}>
						Send failed: {pending.errorMessage}
					</span>
					<Button size="sm" onclick={() => mailState.reopenFailedSend(pending.sendId)}>
						Edit &amp; retry
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onclick={() => mailState.dismissPendingSend(pending.sendId)}
					>
						Dismiss
					</Button>
				{/if}
			</div>
		{/each}
	</div>
{/if}
