<!--
  Above the list: what it shows and how many conversations, or, while conversations are selected,
  how many and what can be done to them all.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, IconButton, typeStyle } from '@neoworks/svelte-gpui-ui'
	import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
	import envelopeOpenIcon from '@phosphor-icons/core/regular/envelope-open.svg'
	import trashIcon from '@phosphor-icons/core/regular/trash.svg'
	import xIcon from '@phosphor-icons/core/regular/x.svg'
	import type { CommandsService } from '../../kernel/commands'

	interface Props {
		title: string
		total: number
		selectedCount: number
		commands: CommandsService
	}

	let { title, total, selectedCount, commands }: Props = $props()

	const theme = $derived(currentTheme())

	function countLabel(): string {
		if (total === 1) return '1 conversation'
		return `${total} conversations`
	}
</script>

<View style={{ direction: 'row', align: 'center', gap: 4, height: 48, paddingLeft: 16, paddingRight: 8, borderBottomWidth: 1, borderColor: theme.colors.line }}>
	{#if selectedCount > 0}
		<Text style={{ ...typeStyle('caption'), fontWeight: 500, color: theme.colors.text, flex: 1, minWidth: 0 }}>{selectedCount} selected</Text>
		<IconButton icon={envelopeOpenIcon} label="Mark as read" size="sm" onpress={() => void commands.run('selection.markRead')} />
		<IconButton icon={archiveIcon} label="Archive" size="sm" onpress={() => void commands.run('selection.archive')} />
		<IconButton icon={trashIcon} label="Delete" size="sm" onpress={() => void commands.run('selection.delete')} />
		<IconButton icon={xIcon} label="Clear selection" size="sm" onpress={() => void commands.run('selection.clear')} />
	{:else}
		<Text style={{ ...typeStyle('caption'), fontSize: 14, fontWeight: 500, color: theme.colors.text, flex: 1, minWidth: 0, truncate: true }}>{title}</Text>
		<Text style={{ fontSize: 12, color: theme.colors.faint }}>{countLabel()}</Text>
	{/if}
</View>
