<!--
  A message's summary cards: what the sender's schema.org markup or a known sender's template
  says the mail is about, such as a reservation, an appointment or a GitHub pull request, with
  its links as buttons. An `action` card is only its buttons.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, Chip, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import arrowSquareOutIcon from '@phosphor-icons/core/regular/arrow-square-out.svg'
	import calendarIcon from '@phosphor-icons/core/regular/calendar-blank.svg'
	import githubIcon from '@phosphor-icons/core/regular/github-logo.svg'
	import receiptIcon from '@phosphor-icons/core/regular/receipt.svg'
	import shoppingBagIcon from '@phosphor-icons/core/regular/shopping-bag.svg'
	import ticketIcon from '@phosphor-icons/core/regular/ticket.svg'
	import type { MessageBody, SummaryCard } from '../../../shared/mail'
	import type { SidecarService } from '../../kernel/sidecar/service'
	import { formatTimeRange } from '../../lib/timeRange'

	interface Props {
		body: MessageBody
		sidecar: SidecarService
	}

	let { body, sidecar }: Props = $props()

	const theme = $derived(currentTheme())

	const KIND_ICONS: Record<SummaryCard['kind'], string> = {
		reservation: ticketIcon,
		event: calendarIcon,
		order: shoppingBagIcon,
		invoice: receiptIcon,
		github: githubIcon,
		action: arrowSquareOutIcon
	}

	function openLink(url: string): void {
		void sidecar.call('system.openUrl', url).catch(() => {})
	}

	function secondLine(card: SummaryCard): string {
		const parts: string[] = []
		const times = formatTimeRange(card.startsAt, card.endsAt)
		if (times !== null) parts.push(times)
		if (card.subtitle !== null) parts.push(card.subtitle)
		return parts.join(' · ')
	}
</script>

{#each body.cards as card, index (index)}
	{#if card.kind === 'action'}
		<View style={{ direction: 'row', gap: 8, wrap: true, paddingX: 20, paddingTop: 12 }}>
			{#each card.links as link (link.url)}
				<Button variant="secondary" size="sm" onpress={() => openLink(link.url)}
					><Text>{link.label}</Text></Button
				>
			{/each}
		</View>
	{:else}
		<View
			style={{
				marginX: 20,
				marginTop: 12,
				padding: 12,
				gap: 6,
				radius: theme.radii.control,
				borderWidth: 1,
				borderColor: theme.colors.line,
				background: theme.colors.sunken
			}}
		>
			<View style={{ direction: 'row', align: 'center', gap: 8 }}>
				<Icon svg={KIND_ICONS[card.kind]} size={16} color={theme.colors.accent} />
				<Text style={{ ...typeStyle('bodySmall'), fontWeight: 600, flex: 1, truncate: true }}
					>{card.title}</Text
				>
				{#if card.status !== null}
					<Chip label={card.status} />
				{/if}
			</View>
			{#if secondLine(card) !== ''}
				<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}
					>{secondLine(card)}</Text
				>
			{/if}
			{#if card.facts.length > 0}
				<View style={{ direction: 'row', gap: 16, wrap: true }}>
					{#each card.facts as fact (fact.label)}
						<Text style={{ ...typeStyle('caption'), color: theme.colors.muted }}
							>{fact.label}
							<Text style={{ color: theme.colors.text }}>{fact.value}</Text></Text
						>
					{/each}
				</View>
			{/if}
			{#if card.links.length > 0}
				<View style={{ direction: 'row', gap: 8, wrap: true, marginTop: 2 }}>
					{#each card.links as link (link.url)}
						<Button variant="secondary" size="sm" onpress={() => openLink(link.url)}
							><Text>{link.label}</Text></Button
						>
					{/each}
				</View>
			{/if}
		</View>
	{/if}
{/each}
