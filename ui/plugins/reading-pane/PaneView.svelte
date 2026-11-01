<!--
  One reading pane: its tab strip, when there is more than one tab or pane, and what the
  active tab shows: a thread, another plugin's view, or the list of open tabs.
-->
<script lang="ts">
	import { View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, LoadingSpinner } from '@neoworks/svelte-gpui-ui'
	import Slot from '../../kernel/slots/Slot.svelte'
	import { paneStyle } from '../frame/layout'
	import type { ReadingTab } from '../reader/service.svelte'
	import EmptyPane from './EmptyPane.svelte'
	import type { ReadingServices } from './services'
	import TabStrip from './TabStrip.svelte'
	import ThreadView from './ThreadView.svelte'

	let { services, paneIndex }: { services: ReadingServices; paneIndex: number } = $props()

	const theme = $derived(currentTheme())
	const reader = $derived(services.reader)
	const pane = $derived(reader.state.panes[paneIndex])

	const tab = $derived.by((): ReadingTab | null => {
		if (!pane || pane.tabs.length === 0) return null
		return pane.tabs[Math.min(pane.activeTabIndex, pane.tabs.length - 1)]
	})

	const split = $derived(reader.state.panes.length > 1)
	const showTabStrip = $derived(pane !== undefined && (pane.tabs.length > 1 || split))
	const highlighted = $derived(split && reader.state.activePaneIndex === paneIndex)

	/** When split, the active pane is marked by a line across its top. */
	const topLineWidth = $derived.by(() => {
		if (split) return 2
		return 0
	})
	const topLineColor = $derived.by(() => {
		if (highlighted) return theme.colors.accent
		return 'transparent'
	})

	function customKey(current: ReadingTab): string {
		if (current.view.kind !== 'custom') return ''
		return current.view.key
	}
</script>

<View
	style={{
		...paneStyle(theme),
		flex: 1,
		minWidth: 0,
		borderTopWidth: topLineWidth,
		borderColor: topLineColor
	}}
>
	{#if showTabStrip}
		<TabStrip {reader} {paneIndex} />
	{/if}
	{#if tab && tab.view.kind === 'custom'}
		<View style={{ flex: 1, minHeight: 0 }}>
			<Slot name="reading.view" key={customKey(tab)} props={{ tab }} />
		</View>
	{:else if tab && tab.messages.length > 0}
		<ThreadView {services} {tab} {paneIndex} />
	{:else if tab}
		<View style={{ flex: 1, align: 'center', justify: 'center' }}>
			<LoadingSpinner size={24} />
		</View>
	{:else}
		<EmptyPane {reader} />
	{/if}
</View>
