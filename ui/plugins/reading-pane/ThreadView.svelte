<!--
  An open thread: its toolbar along the top, after back and forward, then, scrolling, its subject
  as the title with its category under it, what other plugins put above it, and its messages,
  the expanded ones with their bodies, parted by hairlines. The thread sits in a centred column
  of a readable width, however wide the pane.
-->
<script lang="ts">
	import { Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, Divider, typeStyle } from '@neoworks/svelte-gpui-ui'
	import Slot from '../../kernel/slots/Slot.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import CategoryPicker from './CategoryPicker.svelte'
	import MessageCard from './MessageCard.svelte'
	import type { ReadingServices } from './services'
	import ThreadToolbar from './ThreadToolbar.svelte'

	let {
		services,
		tab,
		paneIndex
	}: { services: ReadingServices; tab: ReadingTab; paneIndex: number } = $props()

	const theme = $derived(currentTheme())

	/** About 75 characters of body text a line, past which lines get hard to follow. */
	const READING_WIDTH = 760

	const subject = $derived.by(() => {
		const first = tab.messages[0]
		if (!first || first.subject === '') return '(no subject)'
		return first.subject
	})
</script>

<View style={{ flex: 1, minHeight: 0 }}>
	<View
		style={{
			direction: 'row',
			align: 'center',
			gap: 2,
			minHeight: 52,
			paddingX: 12,
			paddingY: 6
		}}
	>
		<Slot name="thread.navigation" />
		<View style={{ flex: 1, minWidth: 0 }}>
			<ThreadToolbar {services} {tab} {paneIndex} />
		</View>
	</View>
	<Scroll style={{ flex: 1 }}>
		<View
			style={{
				width: '100%',
				maxWidth: READING_WIDTH,
				alignSelf: 'center',
				paddingX: 8,
				paddingTop: 12,
				paddingBottom: 24
			}}
		>
			<Text
				style={{
					...typeStyle('title'),
					fontSize: 24,
					lineHeight: 30,
					fontWeight: 600,
					color: theme.colors.text,
					paddingX: 20
				}}>{subject}</Text
			>
			<View style={{ direction: 'row', paddingX: 14, paddingTop: 6, paddingBottom: 14 }}>
				<CategoryPicker {services} {tab} />
			</View>
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
