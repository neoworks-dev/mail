<!--
  The reading area: one pane, or two side by side when split.
-->
<script lang="ts">
	import { View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import PaneView from './PaneView.svelte'
	import type { ReadingServices } from './services'

	let { services }: { services: ReadingServices } = $props()

	const theme = $derived(currentTheme())
</script>

<View style={{ flex: 1, direction: 'row', minWidth: 0 }}>
	{#each services.reader.state.panes as _pane, paneIndex (paneIndex)}
		{#if paneIndex > 0}
			<View style={{ width: 1, background: theme.colors.line }} />
		{/if}
		<PaneView {services} {paneIndex} />
	{/each}
</View>
