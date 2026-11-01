<!--
  A message's shipment: carrier, tracking number (pressed, it is copied), status, delivery date
  and the carrier's last event, with the live lookup and the tracking page.
-->
<script lang="ts">
	import { clipboard } from '@neoworks/svelte-gpui'
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, Chip, currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import packageIcon from '@phosphor-icons/core/regular/package.svg'
	import type { MessageBody, ShipmentExtraction, ThreadMessage } from '../../../shared/mail'
	import type { SidecarService } from '../../kernel/sidecar/service'
	import type { AssistantService } from '../assistant/service.svelte'
	import type { ReaderService } from '../reader/service.svelte'

	interface Props {
		message: ThreadMessage
		body: MessageBody
		sidecar: SidecarService
		reader: ReaderService
		assistant: AssistantService
	}

	let { message, body, sidecar, reader, assistant }: Props = $props()

	const theme = $derived(currentTheme())
	const shipment = $derived(body.shipment)
	const extracting = $derived(assistant.state.extracting[message.messageId] === 'shipment')
	let tracking = $state(false)
	let copied = $state(false)
	let error = $state<string | null>(null)

	const trackLabel = $derived.by(() => {
		if (tracking) return 'Updating…'
		if (shipment && shipment.trackedAt) return 'Update status'
		return 'Track now'
	})

	function details(current: ShipmentExtraction): string {
		const parts: string[] = []
		if (current.status) parts.push(current.status)
		if (current.deliveryDate) parts.push(`ETA ${current.deliveryDate}`)
		if (current.source === 'ai') parts.push('found by AI')
		return parts.join(' · ')
	}

	function checkedAt(trackedAt: string): string {
		return new Date(trackedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
	}

	async function copyTrackingNumber(trackingNumber: string): Promise<void> {
		await clipboard.write(trackingNumber)
		copied = true
		setTimeout(() => (copied = false), 1500)
	}

	async function track(): Promise<void> {
		tracking = true
		error = null
		try {
			await sidecar.call('messages.trackShipment', message.messageId)
			await reader.reloadBody(message.messageId)
		} catch (failure) {
			error = failure instanceof Error ? failure.message : String(failure)
		} finally {
			tracking = false
		}
	}

	function openTrackingPage(url: string): void {
		void sidecar.call('system.openUrl', url).catch(() => {})
	}

	function trackingChipLabel(trackingNumber: string): string {
		if (copied) return 'Copied'
		return trackingNumber
	}
</script>

{#if extracting}
	<View style={{ direction: 'row', align: 'center', gap: 8, paddingX: 20, paddingBottom: 14 }}>
		<LoadingSpinner size={14} />
		<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>The agent is looking for a shipment…</Text>
	</View>
{:else if shipment}
	<View
		style={{
			marginX: 20,
			marginBottom: 14,
			padding: 12,
			gap: 6,
			radius: theme.radii.control,
			borderWidth: 1,
			borderColor: theme.colors.line,
			background: theme.colors.sunken
		}}
	>
		<View style={{ direction: 'row', align: 'center', gap: 8, wrap: true }}>
			<Icon svg={packageIcon} size={16} color={theme.colors.accent} />
			<Text style={{ ...typeStyle('bodySmall'), fontWeight: 600 }}>{shipment.carrier}</Text>
			{#if shipment.trackingNumber}
				{@const trackingNumber = shipment.trackingNumber}
				<Chip label={trackingChipLabel(trackingNumber)} onpress={() => void copyTrackingNumber(trackingNumber)} />
			{/if}
			<View style={{ flex: 1 }} />
			{#if shipment.trackingNumber}
				<Button variant="ghost" size="sm" disabled={tracking} onpress={() => void track()}><Text>{trackLabel}</Text></Button>
			{/if}
			{#if shipment.trackingUrl}
				{@const url = shipment.trackingUrl}
				<Button variant="secondary" size="sm" onpress={() => openTrackingPage(url)}><Text>Tracking page</Text></Button>
			{/if}
		</View>
		{#if details(shipment) !== ''}
			<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>{details(shipment)}</Text>
		{/if}
		{#if shipment.lastEvent}
			<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}>
				{shipment.lastEvent}{#if shipment.trackedAt}<Text style={{ color: theme.colors.faint }}> · checked {checkedAt(shipment.trackedAt)}</Text>{/if}
			</Text>
		{/if}
		{#if error}
			<Text style={{ ...typeStyle('caption'), color: theme.colors.danger }}>{error}</Text>
		{/if}
	</View>
{/if}
