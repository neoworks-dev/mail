<!--
  What a pane shows with no tab: the tabs open anywhere, to go back to one, or a hint.
-->
<script lang="ts">
	import { Button, Icon, Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import envelopeIcon from '@phosphor-icons/core/regular/envelope-simple-open.svg'
	import closeIcon from '@phosphor-icons/core/regular/x.svg'
	import type { ReaderService, ReadingTab } from '../reader/service.svelte'

	let { reader }: { reader: ReaderService } = $props()

	const theme = $derived(currentTheme())

	interface OpenTab {
		paneIndex: number
		tabIndex: number
		tab: ReadingTab
	}

	const openTabs = $derived.by(() => {
		const entries: OpenTab[] = []
		reader.state.panes.forEach((pane, paneIndex) => {
			pane.tabs.forEach((tab, tabIndex) => entries.push({ paneIndex, tabIndex, tab }))
		})
		return entries
	})

	function subtitle(entry: OpenTab): string {
		if (entry.tab.view.kind === 'custom') return entry.tab.view.title
		const newest = entry.tab.messages[entry.tab.messages.length - 1]
		if (!newest) return ''
		if (newest.fromName !== '') return newest.fromName
		return newest.fromAddress
	}
</script>

{#if openTabs.length > 0}
	<Scroll style={{ flex: 1 }}>
		<View style={{ padding: 24, gap: 8, align: 'center' }}>
			<View style={{ width: '100%', maxWidth: 560, gap: 6 }}>
				<Text style={{ ...typeStyle('label'), uppercase: true, color: theme.colors.faint, marginBottom: 4 }}>
					Open tabs
				</Text>
				{#each openTabs as entry (entry.tab.id)}
					<View
						style={{
							direction: 'row',
							align: 'center',
							gap: 8,
							paddingX: 14,
							paddingY: 10,
							radius: theme.radii.control,
							borderWidth: 1,
							borderColor: theme.colors.line,
							background: theme.colors.surface,
							transition: 120
						}}
						hover={{ background: theme.colors.hover }}
					>
						<Button style={{ flex: 1, minWidth: 0 }} onpress={() => reader.setActiveTab(entry.paneIndex, entry.tabIndex)}>
							<View style={{ flex: 1, minWidth: 0, gap: 2 }}>
								<Text style={{ ...typeStyle('bodySmall'), fontWeight: 500, truncate: true }}>{entry.tab.title}</Text>
								{#if subtitle(entry) !== ''}
									<Text style={{ ...typeStyle('caption'), color: theme.colors.muted, truncate: true }}>
										{subtitle(entry)}
									</Text>
								{/if}
							</View>
						</Button>
						<Button
							style={{ padding: 4, radius: 6, color: theme.colors.faint }}
							hover={{ color: theme.colors.text, background: theme.colors.pressed }}
							onpress={() => reader.closeTab(entry.paneIndex, entry.tabIndex)}
						>
							<Icon svg={closeIcon} size={12} />
						</Button>
					</View>
				{/each}
			</View>
		</View>
	</Scroll>
{:else}
	<View style={{ flex: 1, align: 'center', justify: 'center', gap: 12, color: theme.colors.faint }}>
		<Icon svg={envelopeIcon} size={40} />
		<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.faint }}>Select a conversation to read</Text>
	</View>
{/if}
