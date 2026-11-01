<!--
  Every key binding with the command it runs. Pressing a shortcut waits for the next combination
  and binds it; Reset goes back to the default.
-->
<script lang="ts">
	import { Button as PlainButton, Scroll, Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, Divider, IconButton, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import closeIcon from '@phosphor-icons/core/regular/x.svg'
	import ModalScrim from '../../components/modal/ModalScrim.svelte'
	import type { KeymapService } from '../../kernel/keymap/service'
	import { comboLabel } from '../../lib/keycombo'
	import type { ShortcutsState } from './state.svelte'

	let { shortcuts, keymap }: { shortcuts: ShortcutsState; keymap: KeymapService } = $props()

	const theme = $derived(currentTheme())

	function close(): void {
		shortcuts.capturing = null
		shortcuts.open = false
	}

	function toggleCapture(command: string): void {
		if (shortcuts.capturing === command) {
			shortcuts.capturing = null
			return
		}
		shortcuts.capturing = command
	}

	function keyLabel(command: string, combo: Parameters<typeof comboLabel>[0]): string {
		if (shortcuts.capturing === command) return 'Press keys…'
		return comboLabel(combo)
	}

	function keyBorder(command: string): string {
		if (shortcuts.capturing === command) return theme.colors.focus
		return theme.colors.line
	}
</script>

{#if shortcuts.open}
	<ModalScrim onclose={close} panelStyle={{ width: 520, maxWidth: '100%', maxHeight: '80%' }}>
		<View style={{ direction: 'row', align: 'center', paddingLeft: 20, paddingRight: 8, paddingY: 8 }}>
			<Text style={{ ...typeStyle('title'), flex: 1 }}>Keyboard shortcuts</Text>
			<IconButton icon={closeIcon} label="Close" onpress={close} />
		</View>
		<Divider />
		<Scroll style={{ shrink: 1, minHeight: 0 }}>
			<View style={{ padding: 8, gap: 2 }}>
				{#each keymap.describe() as binding (binding.command)}
					<View style={{ direction: 'row', align: 'center', gap: 8, paddingX: 12, minHeight: 40, radius: theme.radii.control }} hover={{ background: theme.colors.hover }}>
						<Text style={{ ...typeStyle('bodySmall'), flex: 1, minWidth: 0, truncate: true }}>{binding.title}</Text>
						{#if binding.overridden}
							<Button variant="ghost" size="sm" onpress={() => keymap.resetOverride(binding.command)}><Text>Reset</Text></Button>
						{/if}
						<PlainButton
							style={{ minWidth: 72, justify: 'center', paddingX: 8, paddingY: 4, radius: 6, borderWidth: 1, borderColor: keyBorder(binding.command), cursor: 'pointer' }}
							hover={{ borderColor: theme.colors.lineStrong }}
							onpress={() => toggleCapture(binding.command)}
						>
							<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>{keyLabel(binding.command, binding.combo)}</Text>
						</PlainButton>
					</View>
				{/each}
			</View>
		</Scroll>
		<Divider />
		<View style={{ direction: 'row', align: 'center', paddingX: 20, paddingY: 12, gap: 12 }}>
			<Text style={{ ...typeStyle('caption'), color: theme.colors.faint, flex: 1 }}>Press a shortcut, then the new combination. Escape cancels.</Text>
			<Button size="sm" variant="secondary" onpress={close}><Text>Done</Text></Button>
		</View>
	</ModalScrim>
{/if}
