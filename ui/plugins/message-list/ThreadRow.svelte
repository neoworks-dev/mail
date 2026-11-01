<!--
  One conversation in the list: an unread dot, the sender's avatar, then sender and thread size,
  label, attachment, flag and date over the subject and snippet. Unread conversations are bold.
  The open one is shaded, selected ones more so. Rows are inset and rounded, with no line between.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { PointerEvent, Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import paperclipIcon from '@phosphor-icons/core/regular/paperclip.svg'
	import starIcon from '@phosphor-icons/core/fill/star-fill.svg'
	import type { ThreadSummary } from '../../../shared/mail'
	import Avatar from '../../components/Avatar.svelte'
	import { formatListDate, senderLabel, subjectLabel } from './format'
	import LabelPill from './LabelPill.svelte'

	interface Props {
		thread: ThreadSummary
		open: boolean
		selected: boolean
		/** Whether to show the thread's category, which a list of one category leaves out. */
		showLabel: boolean
		/** The account's address, shown in the all-inboxes view. */
		accountEmail: string | null
		onpress: (event: PointerEvent) => void
		onaltpress: (event: PointerEvent) => void
	}

	let { thread, open, selected, showLabel, accountEmail, onpress, onaltpress }: Props = $props()

	const theme = $derived(currentTheme())
	const unread = $derived(thread.threadUnread > 0)

	function rowStyle(): Style {
		const style: Style = {
			direction: 'row',
			gap: 10,
			marginX: 6,
			paddingLeft: 4,
			paddingRight: 12,
			paddingY: 10,
			radius: theme.radii.control,
			cursor: 'pointer',
			transition: 100
		}
		if (open) style.background = theme.colors.hover
		if (selected) style.background = theme.colors.pressed
		return style
	}

	function emphasisStyle(): Style {
		if (unread) return { fontWeight: 600, color: theme.colors.text }
		return { fontWeight: 400, color: theme.colors.muted }
	}

	function dateColor(): string {
		if (unread) return theme.colors.text
		return theme.colors.faint
	}

	function dotColor(): string {
		if (unread) return theme.colors.accent
		return 'transparent'
	}

	function pointerDown(event: PointerEvent): void {
		if (event.button === 1 || event.button === 2) onaltpress(event)
	}
</script>

<View style={rowStyle()} hover={{ background: theme.colors.hover }} {onpress} ondown={pointerDown}>
	<View style={{ width: 8, height: 32, align: 'center', justify: 'center' }}>
		<View style={{ size: 6, radius: 3, background: dotColor() }} />
	</View>
	<Avatar name={thread.fromName} address={thread.fromAddress} size={32} />
	<View style={{ flex: 1, minWidth: 0, gap: 1 }}>
		<View style={{ direction: 'row', align: 'center', gap: 6 }}>
			<Text
				style={{ ...typeStyle('caption'), fontSize: 13.5, flex: 1, minWidth: 0, truncate: true }}
			>
				<Text style={emphasisStyle()}>{senderLabel(thread)}</Text>
				{#if thread.threadTotal > 1}
					<Text style={{ fontWeight: 400, fontSize: 12, color: theme.colors.faint }}
						>{`  ${thread.threadTotal}`}</Text
					>
				{/if}
			</Text>
			{#if showLabel && thread.label}
				<LabelPill label={thread.label} />
			{/if}
			{#if thread.hasAttachments}
				<Icon svg={paperclipIcon} size={13} color={theme.colors.faint} />
			{/if}
			{#if thread.flagged}
				<Icon svg={starIcon} size={13} color={theme.colors.larch} />
			{/if}
			<Text style={{ fontSize: 12, color: dateColor() }}>{formatListDate(thread.date)}</Text>
		</View>
		<Text style={{ ...typeStyle('caption'), fontSize: 13.5, truncate: true }}
			><Text style={emphasisStyle()}>{subjectLabel(thread)}</Text></Text
		>
		<Text style={{ fontSize: 12.5, lineHeight: 17, color: theme.colors.faint, truncate: true }}
			>{thread.snippet}</Text
		>
		{#if accountEmail}
			<Text style={{ fontSize: 10.5, color: theme.colors.faint, truncate: true }}
				>{accountEmail}</Text
			>
		{/if}
	</View>
</View>
