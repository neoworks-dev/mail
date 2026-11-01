<!--
  One conversation in the list, after Notion Mail. In a wide list it is one line: the sender's
  logo or initials, who wrote, subject and snippet, then label, attachment, flag and date. In a
  narrow one the subject and snippet go under the sender. An unread dot sits in the gutter and
  unread conversations are bold. The open one is shaded, selected ones more so. Hovered, the row
  trades its markers and date for archive, read, delete and flag. Rows are inset and rounded,
  with no line between.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { PointerEvent, Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import archiveIcon from '@phosphor-icons/core/regular/archive.svg'
	import envelopeOpenIcon from '@phosphor-icons/core/regular/envelope-open.svg'
	import envelopeIcon from '@phosphor-icons/core/regular/envelope-simple.svg'
	import paperclipIcon from '@phosphor-icons/core/regular/paperclip.svg'
	import starOutlineIcon from '@phosphor-icons/core/regular/star.svg'
	import starIcon from '@phosphor-icons/core/fill/star-fill.svg'
	import trashIcon from '@phosphor-icons/core/regular/trash.svg'
	import type { ThreadSummary } from '../../../shared/mail'
	import Avatar from '../../components/Avatar.svelte'
	import { formatListDate, participantsLabel, SENDER_COLUMN_WIDTH, subjectLabel } from './format'
	import LabelPill from './LabelPill.svelte'
	import RowAction from './RowAction.svelte'

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
		/** The user's own address in the thread's account, who the list calls "me". */
		ownAddress: string
		onpress: (event: PointerEvent) => void
		onaltpress: (event: PointerEvent) => void
		onarchive: () => void
		ondelete: () => void
		ontoggleread: () => void
		ontoggleflag: () => void
	}

	let {
		thread,
		open,
		selected,
		wide,
		showLabel,
		accountEmail,
		ownAddress,
		onpress,
		onaltpress,
		onarchive,
		ondelete,
		ontoggleread,
		ontoggleflag
	}: Props = $props()

	const theme = $derived(currentTheme())
	const unread = $derived(thread.threadUnread > 0)
	let hovered = $state(false)

	function readToggleIcon(): string {
		if (unread) return envelopeOpenIcon
		return envelopeIcon
	}

	function readToggleLabel(): string {
		if (unread) return 'Mark as read'
		return 'Mark as unread (u)'
	}

	function flagIcon(): string {
		if (thread.flagged) return starIcon
		return starOutlineIcon
	}

	function flagLabel(): string {
		if (thread.flagged) return 'Remove flag (s)'
		return 'Flag (s)'
	}

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
	<View style={{ direction: 'row', align: 'center', gap: 8, minWidth: 0, ...style }}>
		<Avatar name={thread.fromName} address={thread.fromAddress} size={20} logo />
		<Text style={{ flex: 1, minWidth: 0, truncate: true }}>
			<Text style={emphasisStyle()}>{participantsLabel(thread, ownAddress)}</Text>
			{#if thread.threadTotal > 1}
				<Text style={{ fontWeight: 400, fontSize: 12, color: theme.colors.faint }}
					>{`  ${thread.threadTotal}`}</Text
				>
			{/if}
		</Text>
	</View>
{/snippet}

{#snippet actions()}
	<View style={{ direction: 'row', align: 'center', gap: 2 }}>
		<RowAction icon={archiveIcon} label="Archive (e)" onpress={onarchive} />
		<RowAction icon={readToggleIcon()} label={readToggleLabel()} onpress={ontoggleread} />
		<RowAction icon={trashIcon} label="Delete (#)" onpress={ondelete} />
		<RowAction icon={flagIcon()} label={flagLabel()} onpress={ontoggleflag} />
	</View>
{/snippet}

{#snippet markers()}
	{#if hovered}
		{@render actions()}
	{:else}
		{@render statusMarkers()}
	{/if}
{/snippet}

{#snippet statusMarkers()}
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

<View
	style={rowStyle()}
	hover={{ background: theme.colors.hover }}
	{onpress}
	ondown={pointerDown}
	onhover={(value) => (hovered = value)}
>
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
