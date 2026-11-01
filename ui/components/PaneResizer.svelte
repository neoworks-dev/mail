<!--
  The hairline between two panes, dragged sideways to resize them. It grabs a few pixels either
  side of the line, so the line itself can stay one pixel wide. It reports how far the pointer
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

	const lineColor = $derived.by(() => {
		if (dragging) return theme.colors.lineStrong
		return theme.colors.line
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
	style={{
		width: 5,
		marginX: -2,
		alignSelf: 'stretch',
		align: 'center',
		cursor: 'col-resize'
	}}
	ondown={start}
	onmove={move}
	onup={end}
>
	<View
		style={{ width: 1, flex: 1, background: lineColor, transition: 120 }}
		hover={{ background: theme.colors.lineStrong }}
	/>
</View>
