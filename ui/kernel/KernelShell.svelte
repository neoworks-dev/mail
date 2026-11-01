<!--
  The app's root once the kernel is up: it draws the `root` slot, which the frame plugin fills,
  hands the keys no focused element took to the keymap, and lists the plugins that failed.
-->
<script lang="ts">
	import { untrack } from 'svelte'
	import { View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme } from '@neoworks/svelte-gpui-ui'
	import Failures from './Failures.svelte'
	import { provideKernel, type Kernel } from './kernel'
	import type { KeyEventInput } from './keymap/service'
	import Slot from './slots/Slot.svelte'

	let { kernel }: { kernel: Kernel } = $props()

	// The kernel never changes for the life of this component.
	provideKernel(untrack(() => kernel))

	const theme = $derived(currentTheme())

	function handleKey(event: KeyEventInput): void {
		kernel.keymap.dispatch(event)
	}
</script>

<svelte:window onkeydown={handleKey} />

<View style={{ flex: 1, background: theme.colors.canvas, color: theme.colors.text }}>
	<Slot name="root" />
	<Failures loader={kernel.loader} />
</View>
