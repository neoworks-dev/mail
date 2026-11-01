<!--
  What the pane says while Mail cannot reach the neo agent, and how to change that.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import plugs from '@phosphor-icons/core/regular/plugs.svg'
	import type { AssistantStatus } from '../../../shared/assistant'

	let { status }: { status: AssistantStatus } = $props()

	const theme = $derived(currentTheme())

	const message = $derived.by((): { title: string; detail: string } => {
		if (status.state === 'off') {
			return {
				title: 'The assistant is off',
				detail: 'Mail was started without neo for this run.'
			}
		}
		if (status.state === 'closed') {
			return {
				title: 'neo is not running',
				detail: 'Start it with `neo up` in a terminal; Mail connects by itself.'
			}
		}
		return {
			title: 'Connecting to neo…',
			detail: 'Mail waits for the neo daemon and joins it once it is up.'
		}
	})

	const connecting = $derived(status.state === 'connecting' || status.state === 'reconnecting')
</script>

<View style={{ flex: 1, padding: 24, justify: 'center', align: 'center', gap: 10 }}>
	{#if connecting}
		<LoadingSpinner size={20} thickness={3} />
	{:else}
		<Icon svg={plugs} size={24} color={theme.colors.faint} />
	{/if}
	<Text style={{ ...typeStyle('bodySmall'), color: theme.colors.text }}>{message.title}</Text>
	<Text
		style={{
			...typeStyle('caption'),
			color: theme.colors.muted,
			textAlign: 'center',
			maxWidth: 260
		}}
	>
		{message.detail}
	</Text>
	{#if status.error}
		<Text
			style={{
				...typeStyle('caption'),
				color: theme.colors.danger,
				textAlign: 'center',
				maxWidth: 260
			}}
		>
			{status.error}
		</Text>
	{/if}
</View>
