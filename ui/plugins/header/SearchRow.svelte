<!--
  The "Search" row at the top of the sidebar, as in Notion Mail. Pressing it opens the palette in
  search mode; it shows the key that opens the palette.
-->
<script lang="ts">
	import { Button, Icon, Text } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import magnifyingGlass from '@phosphor-icons/core/regular/magnifying-glass.svg'
	import type { CommandsService } from '../../kernel/commands'
	import type { KeymapService } from '../../kernel/keymap/service'
	import { comboLabel } from '../../lib/keycombo'

	let { commands, keymap }: { commands: CommandsService; keymap: KeymapService } = $props()

	const theme = $derived(currentTheme())

	const shortcut = $derived.by(() => {
		const combo = keymap.comboFor('palette.open')
		if (!combo) return null
		return comboLabel(combo)
	})

	function open(): void {
		if (commands.get('palette.search')) {
			void commands.run('palette.search')
			return
		}
		void commands.run('palette.open')
	}
</script>

<Button
	style={{
		direction: 'row',
		align: 'center',
		gap: 10,
		height: 32,
		paddingX: 10,
		radius: theme.radii.control,
		color: theme.colors.muted,
		cursor: 'pointer',
		transition: 120,
		...typeStyle('nav')
	}}
	hover={{ background: theme.colors.hover, color: theme.colors.text }}
	active={{ background: theme.colors.pressed }}
	onpress={open}
>
	<Icon svg={magnifyingGlass} size={16} />
	<Text style={{ flex: 1, minWidth: 0, truncate: true }}>Search</Text>
	{#if shortcut}
		<Text style={{ ...typeStyle('caption'), fontSize: 11.5, color: theme.colors.faint }}
			>{shortcut}</Text
		>
	{/if}
</Button>
