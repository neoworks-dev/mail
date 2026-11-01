<!--
  The thread's summary while the agent writes it and once it is there; the cross dismisses it.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, IconButton, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import sparkleIcon from '@phosphor-icons/core/regular/sparkle.svg'
	import closeIcon from '@phosphor-icons/core/regular/x.svg'
	import type { AssistantService } from '../assistant/service.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import { threadOf } from './threadOf'

	let { tab, assistant }: { tab: ReadingTab; assistant: AssistantService } = $props()

	const theme = $derived(currentTheme())
	const threadId = $derived(threadOf(tab))
	const summary = $derived.by(() => {
		if (threadId === null) return null
		const found = assistant.state.summaries[threadId]
		if (!found) return null
		return found
	})

	function dismiss(): void {
		if (threadId !== null) assistant.dismissSummary(threadId)
	}
</script>

{#if summary}
	<View
		style={{
			padding: 14,
			gap: 6,
			radius: theme.radii.control,
			borderWidth: 1,
			borderColor: theme.colors.line,
			background: theme.colors.sunken
		}}
	>
		<View style={{ direction: 'row', align: 'center', gap: 6, color: theme.colors.accent }}>
			<Icon svg={sparkleIcon} size={14} />
			<Text style={{ ...typeStyle('label'), uppercase: true, color: theme.colors.faint, flex: 1 }}>Summary · AI</Text>
			<IconButton icon={closeIcon} label="Dismiss summary" size="sm" onpress={dismiss} />
		</View>
		{#if summary.pending}
			<View style={{ direction: 'row', align: 'center', gap: 8 }}>
				<LoadingSpinner size={14} />
				<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>The agent is reading the thread…</Text>
			</View>
		{:else}
			<Text style={typeStyle('bodySmall')}>{summary.text}</Text>
		{/if}
		{#if summary.pending && assistant.state.error}
			<Text style={{ ...typeStyle('caption'), color: theme.colors.danger }}>{assistant.state.error}</Text>
		{/if}
	</View>
{/if}
