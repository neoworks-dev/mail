<!--
  An open thread: its toolbar along the top, then, scrolling, its subject as the title, what other
  plugins put above it, and its messages, the expanded ones with their bodies, parted by hairlines.
-->
<script lang="ts">
	import { Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, Divider, typeStyle } from '@neoworks/svelte-gpui-ui'
	import Slot from '../../kernel/slots/Slot.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import MessageCard from './MessageCard.svelte'
	import type { ReadingServices } from './services'
	import ThreadToolbar from './ThreadToolbar.svelte'

	let {
		services,
		tab,
		paneIndex
	}: { services: ReadingServices; tab: ReadingTab; paneIndex: number } = $props()

	const theme = $derived(currentTheme())

	const subject = $derived.by(() => {
		const first = tab.messages[0]
		if (!first || first.subject === '') return '(no subject)'
		return first.subject
	})
</script>

<View style={{ flex: 1, minHeight: 0 }}>
	<View
		style={{
			minHeight: 48,
			justify: 'center',
			paddingX: 12,
			paddingY: 6,
			borderBottomWidth: 1,
			borderColor: theme.colors.line
		}}
	>
		<ThreadToolbar {services} {tab} {paneIndex} />
	</View>
	<Scroll style={{ flex: 1 }}>
		<View style={{ paddingX: 8, paddingTop: 20, paddingBottom: 24 }}>
			<Text
				style={{
					...typeStyle('title'),
					fontWeight: 600,
					color: theme.colors.text,
					paddingX: 20,
					paddingBottom: 12
				}}>{subject}</Text
			>
			<Slot name="thread.header" props={{ tab }} />
			{#each tab.messages as message, index (message.messageId)}
				{#if index > 0}
					<Divider style={{ marginX: 20 }} />
				{/if}
				<MessageCard {services} {tab} {message} {paneIndex} />
			{/each}
		</View>
	</Scroll>
</View>
