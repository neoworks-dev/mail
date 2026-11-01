<!--
  The window's content while the kernel boots, and the message if it cannot. Once the kernel is
  up, `KernelShell` takes over.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import KernelShell from './KernelShell.svelte'
	import type { Kernel } from './kernel'

	let { boot }: { boot: Promise<Kernel> } = $props()

	const theme = $derived(currentTheme())

	function describeError(error: unknown): string {
		if (error instanceof Error) return error.message
		return String(error)
	}
</script>

{#await boot}
	<View style={{ flex: 1, background: theme.colors.canvas, align: 'center', justify: 'center' }}>
		<LoadingSpinner size={28} />
	</View>
{:then kernel}
	<KernelShell {kernel} />
{:catch error}
	<View style={{ flex: 1, background: theme.colors.canvas, padding: 32, gap: 8 }}>
		<Text style={{ ...typeStyle('title'), color: theme.colors.danger }}
			>Neomail could not start</Text
		>
		<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.muted }}
			>{describeError(error)}</Text
		>
	</View>
{/await}
