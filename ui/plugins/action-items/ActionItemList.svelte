<!--
  The action items stored on a message, each with its due date when it has one.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { MessageBody, ThreadMessage } from '../../../shared/mail'
	import type { AssistantService } from '../assistant/service.svelte'

	let {
		message,
		body,
		assistant
	}: { message: ThreadMessage; body: MessageBody; assistant: AssistantService } = $props()

	const theme = $derived(currentTheme())
	const extracting = $derived(assistant.state.extracting[message.messageId] === 'actions')
	const items = $derived.by(() => {
		if (!body.actions) return []
		return body.actions.items
	})
</script>

{#if extracting}
	<View style={{ direction: 'row', align: 'center', gap: 8, paddingX: 20, paddingBottom: 14 }}>
		<LoadingSpinner size={14} />
		<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}
			>The agent is collecting action items…</Text
		>
	</View>
{:else if items.length > 0}
	<View
		style={{
			marginX: 20,
			marginBottom: 14,
			padding: 12,
			gap: 4,
			radius: theme.radii.control,
			borderWidth: 1,
			borderColor: theme.colors.line,
			background: theme.colors.sunken
		}}
	>
		<Text
			style={{ ...typeStyle('label'), uppercase: true, color: theme.colors.faint, marginBottom: 2 }}
			>Action items · AI</Text
		>
		{#each items as item, index (index)}
			<View style={{ direction: 'row', align: 'start', gap: 8 }}>
				<Text style={{ ...typeStyle('caption'), color: theme.colors.faint, marginTop: 2 }}>○</Text>
				<Text style={{ ...typeStyle('bodySmall'), flex: 1, minWidth: 0 }}>{item.title}</Text>
				{#if item.due}
					<Text
						style={{
							...typeStyle('caption'),
							color: theme.colors.warning,
							nowrap: true,
							marginTop: 2
						}}>{item.due}</Text
					>
				{/if}
			</View>
		{/each}
	</View>
{/if}
