<!--
  Lists the plugins that failed to load, in the corner of the window, so a broken plugin is
  visible without opening the log. A press on one dismisses it until it fails again.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { PluginFailure, PluginLoader } from './loader'

	let { loader }: { loader: PluginLoader } = $props()

	let dismissed = $state<Record<string, string | undefined>>({})
	const theme = $derived(currentTheme())

	function openFailures(): PluginFailure[] {
		return loader.failures().filter((failure) => dismissed[failure.name] !== failure.message)
	}

	function dismiss(failure: PluginFailure): void {
		dismissed[failure.name] = failure.message
	}
</script>

{#if openFailures().length > 0}
	<View style={{ position: 'absolute', right: 16, bottom: 16, gap: 8, maxWidth: 480 }}>
		{#each openFailures() as failure (failure.name)}
			<View
				style={{
					padding: 12,
					radius: theme.radii.control,
					background: theme.colors.dangerSoft,
					gap: 2,
					shadow: theme.shadows.overlay
				}}
				onpress={() => dismiss(failure)}
			>
				<Text style={{ ...typeStyle('label'), color: theme.colors.danger }}>
					Plugin "{failure.name}" failed to load
				</Text>
				<Text style={{ ...typeStyle('caption'), color: theme.colors.danger }}
					>{failure.message}</Text
				>
			</View>
		{/each}
	</View>
{/if}
