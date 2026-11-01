<!--
  The gap between two panes, dragged sideways to resize them. It reports how far the pointer
  moved since the last report; the pane owner clamps and keeps the width.
-->
<script lang="ts">
	import { View } from '@neoworks/svelte-gpui/ui'
	import type { PointerEvent } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'

	let { onresize, onend }: { onresize: (deltaX: number) => void; onend?: () => void } = $props()

	const theme = $derived(currentTheme())
	let dragging = $state(false)
	let lastX = 0

	const gripColor = $derived.by(() => {
		if (dragging) return theme.colors.lineStrong
		return 'transparent'
	})

	function start(event: PointerEvent): void {
		dragging = true
		lastX = event.windowX
	}

	function move(event: PointerEvent): void {
		if (!dragging) return
		const delta = event.windowX - lastX
		lastX = event.windowX
		if (delta !== 0) onresize(delta)
	}

	function end(): void {
		if (!dragging) return
		dragging = false
		if (onend) onend()
	}
</script>

<View
	style={{ width: 8, alignSelf: 'stretch', align: 'center', justify: 'center', cursor: 'col-resize' }}
	ondown={start}
	onmove={move}
	onup={end}
>
	<View
		style={{
			width: 2,
			height: 32,
			radius: 1,
			background: gripColor,
			transition: 120
		}}
	/>
</View>
