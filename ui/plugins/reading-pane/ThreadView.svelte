<!--
  An open thread: its subject and toolbar, what other plugins put above it, and its messages,
  the expanded ones with their bodies.
-->
<script lang="ts">
	import { Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
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

	/** Below this the toolbar goes under the subject instead of beside it. */
	const STACKED_HEADER_WIDTH = 720
	let headerWidth = $state(0)
	const stacked = $derived(headerWidth > 0 && headerWidth < STACKED_HEADER_WIDTH)
	const headerDirection = $derived.by(() => {
		if (stacked) return 'column'
		return 'row'
	})
	const headerAlign = $derived.by(() => {
		if (stacked) return 'start'
		return 'center'
	})

	const subjectStyle = $derived.by((): Style => {
		const look: Style = { ...typeStyle('bodySmall'), fontWeight: 600, minWidth: 0, maxLines: 2 }
		if (stacked) return look
		return { ...look, flex: 1 }
	})

	const subject = $derived.by(() => {
		const first = tab.messages[0]
		if (!first || first.subject === '') return '(no subject)'
		return first.subject
	})
</script>

<View style={{ flex: 1, minHeight: 0 }}>
	<View
		onlayout={(layout) => (headerWidth = layout.width)}
		style={{
			direction: headerDirection,
			align: headerAlign,
			gap: 8,
			paddingLeft: 20,
			paddingRight: 10,
			paddingY: 8,
			borderBottomWidth: 1,
			borderColor: theme.colors.line
		}}
	>
		<Text style={subjectStyle}>{subject}</Text>
		<ThreadToolbar {services} {tab} {paneIndex} />
	</View>
	<Scroll style={{ flex: 1 }}>
		<View style={{ padding: 16, gap: 10 }}>
			<Slot name="thread.header" props={{ tab }} />
			{#each tab.messages as message (message.messageId)}
				<MessageCard {services} {tab} {message} {paneIndex} />
			{/each}
		</View>
	</Scroll>
</View>
