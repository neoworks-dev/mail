<!--
  The session's chat, newest at the bottom. The list sticks to its end while the agent streams,
  until the user scrolls up.
-->
<script lang="ts">
	import { List, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { AssistantItem } from '../../../shared/assistant'
	import type { AssistantService } from '../assistant/service.svelte'
	import ChatItem from './ChatItem.svelte'
	import NotConnected from './NotConnected.svelte'

	let {
		assistant,
		onopenlink
	}: { assistant: AssistantService; onopenlink: (href: string) => void } = $props()

	const theme = $derived(currentTheme())
	const status = $derived(assistant.state.status)
	const items = $derived(assistant.state.view.items)

	function keyOf(item: AssistantItem): string {
		return item.ref
	}
</script>

{#if status.state === 'open'}
	{#if items.length === 0}
		<View style={{ flex: 1, padding: 24, justify: 'center', align: 'center', gap: 6 }}>
			<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.text }}
				>No conversation yet</Text
			>
			<Text style={{ ...typeStyle('caption'), color: theme.colors.muted, textAlign: 'center' }}>
				Ask about your mail, or pick a prompt below.
			</Text>
		</View>
	{:else}
		<List {items} key={keyOf} estimatedRowHeight={56} stickToEnd style={{ flex: 1, minHeight: 0 }}>
			{#snippet row(item)}
				<ChatItem {item} {assistant} {onopenlink} />
			{/snippet}
		</List>
	{/if}
{:else}
	<NotConnected {status} />
{/if}
