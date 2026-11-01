<!--
  The pane's title row: whether Mail reaches neo, where the agent is, and Stop while it works.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import {
		Button,
		currentTheme,
		LoadingSpinner,
		StatusBadge,
		typeStyle
	} from '@neoworks/svelte-gpui-ui'
	import type { StatusTone } from '@neoworks/svelte-gpui-ui'
	import stop from '@phosphor-icons/core/regular/stop.svg'
	import type { AssistantService } from '../assistant/service.svelte'

	let { assistant }: { assistant: AssistantService } = $props()

	const theme = $derived(currentTheme())
	const status = $derived(assistant.state.status)
	const running = $derived(assistant.state.view.running)
	const agentElsewhere = $derived(
		status.state === 'open' && status.focusApp !== null && status.focusApp !== 'mail'
	)

	const connection = $derived.by((): { label: string; tone: StatusTone } => {
		if (status.state === 'open') return { label: 'Connected', tone: 'success' }
		if (status.state === 'off') return { label: 'Off', tone: 'neutral' }
		if (status.state === 'closed') return { label: 'Not running', tone: 'danger' }
		return { label: 'Connecting', tone: 'warning' }
	})
</script>

<View
	style={{
		paddingX: 16,
		paddingY: 12,
		gap: 8,
		borderBottomWidth: 1,
		borderColor: theme.colors.line
	}}
>
	<View style={{ direction: 'row', align: 'center', gap: 8 }}>
		<Text style={{ ...typeStyle('label'), uppercase: true, color: theme.colors.muted, flex: 1 }}
			>Assistant</Text
		>
		{#if running}
			<LoadingSpinner size={14} thickness={2} label="Working" />
			<Button variant="ghost" size="sm" icon={stop} onpress={() => void assistant.cancel()}>
				<Text>Stop</Text>
			</Button>
		{/if}
		<StatusBadge tone={connection.tone} dot>{connection.label}</StatusBadge>
	</View>
	{#if agentElsewhere}
		<View style={{ direction: 'row', align: 'center', gap: 8 }}>
			<Text
				style={{
					...typeStyle('caption'),
					color: theme.colors.muted,
					flex: 1,
					minWidth: 0,
					truncate: true
				}}
			>
				The agent is working in {status.focusApp}
			</Text>
			<Button variant="secondary" size="sm" onpress={() => void assistant.focusHere()}>
				<Text>Bring here</Text>
			</Button>
		</View>
	{/if}
</View>
