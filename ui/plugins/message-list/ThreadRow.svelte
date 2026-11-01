<!--
  One conversation in the list: sender and thread size, label, flag and date, then subject and
  snippet. Unread conversations are bold. The open one is shaded, selected ones are outlined.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { PointerEvent, Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import paperclipIcon from '@phosphor-icons/core/regular/paperclip.svg'
	import starIcon from '@phosphor-icons/core/fill/star-fill.svg'
	import type { ThreadSummary } from '../../../shared/mail'
	import { formatListDate, senderLabel, subjectLabel } from './format'
	import LabelPill from './LabelPill.svelte'

	interface Props {
		thread: ThreadSummary
		open: boolean
		selected: boolean
		/** The account's address, shown in the all-inboxes view. */
		accountEmail: string | null
		onpress: (event: PointerEvent) => void
		onaltpress: (event: PointerEvent) => void
	}

	let { thread, open, selected, accountEmail, onpress, onaltpress }: Props = $props()

	const theme = $derived(currentTheme())
	const unread = $derived(thread.threadUnread > 0)

	function rowStyle(): Style {
		const style: Style = {
			paddingX: 16,
			paddingY: 10,
			gap: 2,
			borderBottomWidth: 1,
			borderColor: theme.colors.line,
			cursor: 'pointer',
			transition: 100
		}
		if (open) style.background = theme.colors.hover
		if (selected) style.background = theme.colors.pressed
		return style
	}

	function senderStyle(): Style {
		if (unread) return { fontWeight: 500, color: theme.colors.text }
		return { color: theme.colors.muted }
	}

	function subjectStyle(): Style {
		if (unread) return { fontWeight: 500, color: theme.colors.text }
		return { color: theme.colors.muted }
	}

	function pointerDown(event: PointerEvent): void {
		if (event.button === 1 || event.button === 2) onaltpress(event)
	}
</script>

<View style={rowStyle()} hover={{ background: theme.colors.hover }} {onpress} ondown={pointerDown}>
	<View style={{ direction: 'row', align: 'center', gap: 6 }}>
		<View style={{ flex: 1, minWidth: 0 }}>
			<Text style={{ ...typeStyle('caption'), fontSize: 13.5, truncate: true }}>
				<Text style={senderStyle()}>{senderLabel(thread)}</Text>
				{#if thread.threadTotal > 1}
					<Text style={{ fontWeight: 400, fontSize: 12, color: theme.colors.faint }}>{`  ${thread.threadTotal}`}</Text>
				{/if}
			</Text>
		</View>
		{#if thread.label}
			<LabelPill label={thread.label} />
		{/if}
		{#if thread.hasAttachments}
			<Icon svg={paperclipIcon} size={13} color={theme.colors.faint} />
		{/if}
		{#if thread.flagged}
			<Icon svg={starIcon} size={13} color={theme.colors.larch} />
		{/if}
		<Text style={{ fontSize: 12, color: theme.colors.faint }}>{formatListDate(thread.date)}</Text>
	</View>
	<Text style={{ ...typeStyle('caption'), fontSize: 13.5, truncate: true }}><Text style={subjectStyle()}>{subjectLabel(thread)}</Text></Text>
	<Text style={{ fontSize: 12, lineHeight: 17, color: theme.colors.faint, truncate: true }}>{thread.snippet}</Text>
	{#if accountEmail}
		<Text style={{ fontSize: 10.5, color: theme.colors.faint, truncate: true }}>{accountEmail}</Text>
	{/if}
</View>
