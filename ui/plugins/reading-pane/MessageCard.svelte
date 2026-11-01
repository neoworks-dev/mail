<!--
  One message of a thread, flat on the pane. Collapsed it is a row with the sender's avatar and
  name, a snippet and the date; expanded it shows its header, other plugins' banners, a note when
  images were held back or trackers removed, its body and other plugins' footer. Pressing the
  header toggles it.
-->
<script lang="ts">
	import { Button, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import type { ThreadMessage } from '../../../shared/mail'
	import Avatar from '../../components/Avatar.svelte'
	import { DocumentView } from '../../components/document'
	import Slot from '../../kernel/slots/Slot.svelte'
	import type { ReadingTab } from '../reader/service.svelte'
	import { formatFullDate, recipientLine, senderName } from './format'
	import PrivacyNote from './PrivacyNote.svelte'
	import { openLink, type ReadingServices } from './services'

	interface Props {
		services: ReadingServices
		tab: ReadingTab
		message: ThreadMessage
		paneIndex: number
	}

	let { services, tab, message, paneIndex }: Props = $props()

	const theme = $derived(currentTheme())
	const reader = $derived(services.reader)
	const expanded = $derived(tab.expanded.includes(message.messageId))
	const body = $derived(reader.state.bodies[message.messageId])
	const mailDocument = $derived(reader.state.documents[message.messageId])

	const senderColor = $derived.by(() => {
		if (message.seen) return theme.colors.text
		return theme.colors.accent
	})

	/** The address beside the name, unless the name already is the address. */
	const shownAddress = $derived.by(() => {
		if (message.fromName === '') return ''
		return `<${message.fromAddress}>`
	})

	function toggle(): void {
		reader.setActivePane(paneIndex)
		void reader.toggleExpanded(tab, message.messageId)
	}
</script>

{#if !expanded}
	<Button
		style={{
			direction: 'row',
			align: 'center',
			gap: 12,
			paddingX: 20,
			paddingY: 12,
			radius: theme.radii.control
		}}
		hover={{ background: theme.colors.hover }}
		onpress={toggle}
	>
		<Avatar name={message.fromName} address={message.fromAddress} size={28} />
		<Text
			style={{
				...typeStyle('bodySmall'),
				fontWeight: 500,
				color: theme.colors.text,
				width: 160,
				truncate: true
			}}
		>
			{senderName(message)}
		</Text>
		<Text
			style={{
				...typeStyle('caption'),
				color: theme.colors.faint,
				flex: 1,
				minWidth: 0,
				truncate: true
			}}
		>
			{message.snippet}
		</Text>
		{#if message.folderPath !== 'INBOX'}
			<View style={{ borderWidth: 1, borderColor: theme.colors.line, radius: 4, paddingX: 5 }}>
				<Text style={{ fontSize: 11, color: theme.colors.faint }}>{message.folderPath}</Text>
			</View>
		{/if}
		<Text style={{ ...typeStyle('caption'), color: theme.colors.faint, nowrap: true }}
			>{formatFullDate(message.date)}</Text
		>
	</Button>
{:else}
	<View>
		<View
			style={{
				direction: 'row',
				align: 'center',
				gap: 12,
				paddingX: 20,
				paddingY: 12,
				radius: theme.radii.control,
				cursor: 'pointer'
			}}
			hover={{ background: theme.colors.hover }}
			onpress={toggle}
		>
			<Avatar name={message.fromName} address={message.fromAddress} size={36} />
			<View style={{ flex: 1, minWidth: 0, gap: 1 }}>
				<View style={{ direction: 'row', align: 'baseline', gap: 12 }}>
					<Text style={{ ...typeStyle('bodySmall'), flex: 1, minWidth: 0, truncate: true }}>
						<Text style={{ fontWeight: 600, color: senderColor }}>{senderName(message)}</Text>
						{#if shownAddress !== ''}
							<Text style={{ ...typeStyle('caption'), color: theme.colors.faint }}
								>{`  ${shownAddress}`}</Text
							>
						{/if}
					</Text>
					<Text style={{ ...typeStyle('caption'), color: theme.colors.faint, nowrap: true }}
						>{formatFullDate(message.date)}</Text
					>
				</View>
				{#if body && body.toAddresses.length > 0}
					<Text style={{ ...typeStyle('caption'), color: theme.colors.muted, truncate: true }}>
						To: {recipientLine(body.toAddresses)}
					</Text>
				{/if}
				{#if body && body.ccAddresses.length > 0}
					<Text style={{ ...typeStyle('caption'), color: theme.colors.muted, truncate: true }}>
						Cc: {recipientLine(body.ccAddresses)}
					</Text>
				{/if}
			</View>
		</View>
		{#if body}
			<Slot name="message.banners" props={{ message, body }} />
		{/if}
		{#if mailDocument}
			<PrivacyNote
				document={mailDocument}
				imagesAllowed={reader.remoteImagesAllowed(message.messageId)}
				onallow={() => void reader.allowRemoteImages(message.messageId)}
			/>
			<View style={{ paddingX: 20, paddingTop: 12, paddingBottom: 20 }}>
				<DocumentView
					blocks={mailDocument.blocks}
					onopenlink={(href) => openLink(services, href)}
				/>
			</View>
		{:else}
			<View style={{ padding: 20, align: 'start' }}>
				<LoadingSpinner size={18} />
			</View>
		{/if}
		{#if body}
			<Slot name="message.footer" props={{ message, body }} />
		{/if}
	</View>
{/if}
