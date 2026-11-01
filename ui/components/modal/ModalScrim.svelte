<!--
  A window-filling dimmed layer with a panel on it, for the overlays plugins draw into the frame's
  `overlays` slot. A press on the dim area outside the panel calls `onclose`.
-->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import { View } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, scrimColor, surfacePanelLook } from '@neoworks/svelte-gpui-ui'

	interface Props {
		onclose: () => void
		/** `center` for dialogs, `top` for a command bar that stays put while its list grows. */
		placement?: 'center' | 'top'
		/** The panel's size and layout. */
		panelStyle?: Style
		children: Snippet
	}

	let { onclose, placement = 'center', panelStyle = {}, children }: Props = $props()

	const theme = $derived(currentTheme())

	function layerStyle(): Style {
		const layer: Style = {
			position: 'absolute',
			inset: 0,
			background: scrimColor(theme),
			align: 'center',
			padding: 24
		}
		if (placement === 'top') return { ...layer, justify: 'start', paddingTop: 96 }
		return { ...layer, justify: 'center' }
	}

	// The panel takes presses itself, so they never reach the scrim and close it.
	function absorb(): void {}
</script>

<View style={layerStyle()} onpress={onclose}>
	<View
		style={{
			...surfacePanelLook(theme),
			radius: theme.radii.card,
			borderWidth: 1,
			borderColor: theme.colors.line,
			overflow: 'hidden',
			...panelStyle
		}}
		onpress={absorb}
	>
		{@render children()}
	</View>
</View>
