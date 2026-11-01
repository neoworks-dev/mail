<!--
  One conversation in the list, after Notion Mail. In a wide list it is one line: sender, subject
  and snippet, then label, attachment, flag and date. In a narrow one the subject and snippet go
  under the sender. An unread dot sits in the gutter and unread conversations are bold. The open
  one is shaded, selected ones more so. Rows are inset and rounded, with no line between.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { PointerEvent, Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import paperclipIcon from '@phosphor-icons/core/regular/paperclip.svg'
	import starIcon from '@phosphor-icons/core/fill/star-fill.svg'
	import type { ThreadSummary } from '../../../shared/mail'
	import { formatListDate, SENDER_COLUMN_WIDTH, senderLabel, subjectLabel } from './format'
	import LabelPill from './LabelPill.svelte'

	interface Props {
		thread: ThreadSummary
		open: boolean
		selected: boolean
		/** Whether the list is wide enough for one line per conversation. */
		wide: boolean
		/** Whether to show the thread's category, which a list of one category leaves out. */
		showLabel: boolean
		/** The account's address, shown in the all-inboxes view. */
		accountEmail: string | null
		onpress: (event: PointerEvent) => void
		onaltpress: (event: PointerEvent) => void
	}

	let { thread, open, selected, wide, showLabel, accountEmail, onpress, onaltpress }: Props =
		$props()

	const theme = $derived(currentTheme())
	const unread = $derived(thread.threadUnread > 0)

	function rowStyle(): Style {
		const style: Style = {
			direction: 'row',
			align: 'center',
			gap: 8,
			marginX: 6,
			paddingLeft: 6,
			paddingRight: 12,
			paddingY: 9,
			radius: theme.radii.control,
			cursor: 'pointer',
			transition: 100,
			...typeStyle('caption'),
			fontSize: 13.5
		}
		if (!wide) {
			style.align = 'start'
			style.paddingY = 10
		}
		if (open) style.background = theme.colors.hover
		if (selected) style.background = theme.colors.pressed
		return style
	}

	function emphasisStyle(): Style {
		if (unread) return { fontWeight: 600, color: theme.colors.text }
		return { fontWeight: 400, color: theme.colors.text }
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

{#snippet sender(style: Style)}
	<Text style={{ minWidth: 0, truncate: true, ...style }}>
		<Text style={emphasisStyle()}>{senderLabel(thread)}</Text>
		{#if thread.threadTotal > 1}
			<Text style={{ fontWeight: 400, fontSize: 12, color: theme.colors.faint }}
				>{`  ${thread.threadTotal}`}</Text
			>
		{/if}
	</Text>
{/snippet}

{#snippet markers()}
	{#if showLabel && thread.label}
		<LabelPill label={thread.label} />
	{/if}
	{#if thread.hasAttachments}
		<Icon svg={paperclipIcon} size={13} color={theme.colors.faint} />
	{/if}
	{#if thread.flagged}
		<Icon svg={starIcon} size={13} color={theme.colors.larch} />
	{/if}
	<Text style={{ fontSize: 12, color: dateColor(), nowrap: true }}
		>{formatListDate(thread.date)}</Text
	>
{/snippet}

<View style={rowStyle()} hover={{ background: theme.colors.hover }} {onpress} ondown={pointerDown}>
	<View style={{ width: 8, height: 18, align: 'center', justify: 'center', shrink: 0 }}>
		<View style={{ size: 6, radius: 3, background: dotColor() }} />
	</View>
	{#if wide}
		{@render sender({ width: SENDER_COLUMN_WIDTH, shrink: 0 })}
		<Text style={{ flex: 1, minWidth: 0, truncate: true }}>
			<Text style={emphasisStyle()}>{subjectLabel(thread)}</Text>
			<Text style={{ fontWeight: 400, color: theme.colors.faint }}>{`   ${thread.snippet}`}</Text>
		</Text>
		{@render markers()}
	{:else}
		<View style={{ flex: 1, minWidth: 0, gap: 1 }}>
			<View style={{ direction: 'row', align: 'center', gap: 6 }}>
				{@render sender({ flex: 1 })}
				{@render markers()}
			</View>
			<Text style={{ truncate: true }}
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
	{/if}
</View>
