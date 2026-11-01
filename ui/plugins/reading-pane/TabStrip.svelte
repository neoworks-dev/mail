<!--
  A pane's tabs: press one to show it, its cross to close it; the button at the end splits or
  joins the reading area.
-->
<script lang="ts">
	import { Button, Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, IconButton, typeStyle } from '@neoworks/svelte-gpui-ui'
	import splitIcon from '@phosphor-icons/core/regular/square-split-horizontal.svg'
	import closeIcon from '@phosphor-icons/core/regular/x.svg'
	import type { ReaderService } from '../reader/service.svelte'

	let { reader, paneIndex }: { reader: ReaderService; paneIndex: number } = $props()

	const theme = $derived(currentTheme())
	const pane = $derived(reader.state.panes[paneIndex])

	const splitLabel = $derived.by(() => {
		if (reader.state.panes.length > 1) return 'Close split'
		return 'Split view'
	})

	function tabBackground(tabIndex: number): string {
		if (tabIndex === pane.activeTabIndex) return theme.colors.sunken
		return 'transparent'
	}

	function tabColor(tabIndex: number): string {
		if (tabIndex === pane.activeTabIndex) return theme.colors.text
		return theme.colors.muted
	}
</script>

<View
	style={{
		direction: 'row',
		align: 'center',
		gap: 2,
		paddingX: 6,
		paddingY: 4,
		borderBottomWidth: 1,
		borderColor: theme.colors.line
	}}
>
	{#each pane.tabs as paneTab, tabIndex (paneTab.id)}
		<View
			style={{
				direction: 'row',
				align: 'center',
				gap: 4,
				maxWidth: 200,
				minWidth: 0,
				paddingLeft: 10,
				paddingRight: 4,
				paddingY: 4,
				radius: 8,
				background: tabBackground(tabIndex),
				transition: 120
			}}
			hover={{ background: theme.colors.hover }}
		>
			<Button style={{ flex: 1, minWidth: 0 }} onpress={() => reader.setActiveTab(paneIndex, tabIndex)}>
				<Text style={{ ...typeStyle('caption'), color: tabColor(tabIndex), truncate: true }}>{paneTab.title}</Text>
			</Button>
			<Button
				style={{ padding: 3, radius: 6, color: theme.colors.faint }}
				hover={{ color: theme.colors.text, background: theme.colors.pressed }}
				onpress={() => reader.closeTab(paneIndex, tabIndex)}
			>
				<Icon svg={closeIcon} size={11} />
			</Button>
		</View>
	{/each}
	<View style={{ flex: 1 }} />
	<IconButton icon={splitIcon} label={splitLabel} size="sm" onpress={() => void reader.toggleSplit()} />
</View>
