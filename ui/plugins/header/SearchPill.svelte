<!--
  The search field look-alike in the middle of the bar. Pressing it opens the palette in search
  mode; it shows the key that opens the palette.
-->
<script lang="ts">
	import { Button, Icon, Text, View } from '@neoworks/svelte-gpui/ui'
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
		width: 520,
		height: 34,
		gap: 8,
		paddingX: 12,
		align: 'center',
		radius: theme.radii.control,
		borderWidth: 1,
		borderColor: theme.colors.line,
		background: theme.colors.surface,
		color: theme.colors.muted,
		transition: 120
	}}
	hover={{ borderColor: theme.colors.lineStrong, color: theme.colors.text }}
	onpress={open}
>
	<Icon svg={magnifyingGlass} size={14} />
	<Text style={{ ...typeStyle('bodySmall'), flex: 1, truncate: true }}>Search mail…</Text>
	{#if shortcut}
		<View
			style={{
				paddingX: 6,
				paddingY: 2,
				radius: 4,
				borderWidth: 1,
				borderColor: theme.colors.line
			}}
		>
			<Text style={{ ...typeStyle('caption'), fontSize: 11, color: theme.colors.faint }}
				>{shortcut}</Text
			>
		</View>
	{/if}
</Button>
