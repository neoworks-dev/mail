<!--
  The reading area: one pane, or two side by side when split.
-->
<script lang="ts">
	import { View } from '@neoworks/svelte-gpui/ui'
	import PaneView from './PaneView.svelte'
	import type { ReadingServices } from './services'

	let { services }: { services: ReadingServices } = $props()
</script>

<View style={{ flex: 1, direction: 'row', gap: 8, minWidth: 0 }}>
	{#each services.reader.state.panes as _pane, paneIndex (paneIndex)}
		<PaneView {services} {paneIndex} />
	{/each}
</View>
