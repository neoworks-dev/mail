<!--
  Sends waiting out the undo window, at the bottom of the window: a countdown with Undo, or for a
  send that failed, the error with Edit & retry and Dismiss.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, currentTheme, surfacePanelLook, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { ComposerService, PendingSend } from '../composer/service.svelte'

	let { composer }: { composer: ComposerService } = $props()

	const TICK_MS = 250

	const theme = $derived(currentTheme())
	let now = $state(Date.now())

	// One ticker drives every countdown, and runs only while one is counting.
	$effect(() => {
		const counting = composer.state.pendingSends.some((entry) => entry.status === 'pending')
		if (!counting) return
		const ticker = setInterval(() => (now = Date.now()), TICK_MS)
		return () => clearInterval(ticker)
	})

	function secondsLeft(pending: PendingSend): number {
		return Math.max(0, Math.ceil((pending.sendAt - now) / 1000))
	}

	function recipientLabel(to: string): string {
		const first = to.split(',')[0].trim()
		if (first === '') return 'recipient'
		return first
	}
</script>

{#if composer.state.pendingSends.length > 0}
	<View style={{ position: 'absolute', left: 0, right: 0, bottom: 20, align: 'center', gap: 8 }}>
		{#each composer.state.pendingSends as pending (pending.sendId)}
			<View
				style={{
					...surfacePanelLook(theme),
					direction: 'row',
					align: 'center',
					gap: 12,
					paddingLeft: 18,
					paddingRight: 8,
					paddingY: 8,
					radius: theme.radii.card,
					borderWidth: 1,
					borderColor: theme.colors.line,
					maxWidth: 640
				}}
			>
				{#if pending.status === 'pending'}
					<Text style={typeStyle('bodySmall')}>Sending to {recipientLabel(pending.to)} in {secondsLeft(pending)}s</Text>
					<Button size="sm" variant="secondary" onpress={() => void composer.undoSend(pending.sendId)}><Text>Undo</Text></Button>
				{:else}
					<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.danger, flex: 1, minWidth: 0, truncate: true }}>
						Send failed: {pending.errorMessage}
					</Text>
					<Button size="sm" variant="secondary" onpress={() => composer.reopenFailed(pending.sendId)}><Text>Edit &amp; retry</Text></Button>
					<Button size="sm" variant="ghost" onpress={() => composer.dropPending(pending.sendId)}><Text>Dismiss</Text></Button>
				{/if}
			</View>
		{/each}
	</View>
{/if}
