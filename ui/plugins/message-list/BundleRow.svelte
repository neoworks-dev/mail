<!--
  The conversations of one bulk category folded into a row, Gmail-style: the category's icon and
  name, how many are new, and who sent them, on one line in a wide list and two in a narrow one. Pressing it unfolds them under it; "View all" opens
  the category as its own list.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import caretUpIcon from '@phosphor-icons/core/regular/caret-up.svg'
	import type { ThreadSummary } from '../../../shared/mail'
	import { labelIcon, labelIconColor, labelTitle } from '../../components/message-list/labels'
	import { bundleSenders, bundleUnreadCount } from '../../lib/bundling'
	import { formatListDate, SENDER_COLUMN_WIDTH } from './format'

	interface Props {
		label: string
		threads: ThreadSummary[]
		expanded: boolean
		/** Whether the list is wide enough for one line per row. */
		wide: boolean
		ontoggle: () => void
		onviewall: () => void
	}

	let { label, threads, expanded, wide, ontoggle, onviewall }: Props = $props()

	const theme = $derived(currentTheme())
	const unreadCount = $derived(bundleUnreadCount(threads))
	const unread = $derived(unreadCount > 0)

	function countLabel(): string {
		if (unread) return `${unreadCount} new`
		if (threads.length === 1) return '1 conversation'
		return `${threads.length} conversations`
	}

	function titleWeight(): number {
		if (unread) return 600
		return 400
	}

	function titleColor(): string {
		if (unread) return theme.colors.text
		return theme.colors.muted
	}

	function countColor(): string {
		if (unread) return theme.colors.accent
		return theme.colors.faint
	}

	function caret(): string {
		if (expanded) return caretUpIcon
		return caretDownIcon
	}
</script>

{#snippet title(style: Style)}
	<View style={{ direction: 'row', align: 'center', gap: 8, minWidth: 0, ...style }}>
		<Icon svg={labelIcon(label)} size={15} color={labelIconColor(theme, label)} />
		<Text style={{ fontWeight: titleWeight(), color: titleColor(), nowrap: true }}
			>{labelTitle(label)}</Text
		>
		<Text style={{ fontSize: 12, color: countColor(), nowrap: true }}>{countLabel()}</Text>
	</View>
{/snippet}

{#snippet senders()}
	<Text style={{ flex: 1, minWidth: 0, color: theme.colors.faint, truncate: true }}
		>{bundleSenders(threads, 3).join(', ')}</Text
	>
{/snippet}

{#snippet viewAll()}
	<View
		style={{
			shrink: 0,
			paddingX: 6,
			paddingY: 1,
			radius: 6,
			color: theme.colors.muted,
			cursor: 'pointer'
		}}
		hover={{ background: theme.colors.pressed, color: theme.colors.text }}
		onpress={onviewall}
	>
		<Text style={{ fontSize: 12, fontWeight: 500, nowrap: true }}>View all</Text>
	</View>
{/snippet}

{#snippet dateAndCaret()}
	<Text style={{ fontSize: 12, color: theme.colors.faint, nowrap: true }}
		>{formatListDate(threads[0].date)}</Text
	>
	<Icon svg={caret()} size={12} color={theme.colors.faint} />
{/snippet}

<View
	style={{
		direction: 'row',
		align: 'center',
		gap: 8,
		marginX: 6,
		paddingLeft: 22,
		paddingRight: 12,
		paddingY: 9,
		radius: theme.radii.control,
		cursor: 'pointer',
		transition: 100,
		...typeStyle('caption'),
		fontSize: 13.5
	}}
	hover={{ background: theme.colors.hover }}
	onpress={ontoggle}
>
	{#if wide}
		{@render title({ width: SENDER_COLUMN_WIDTH, shrink: 0 })}
		{@render senders()}
		{@render viewAll()}
		{@render dateAndCaret()}
	{:else}
		<View style={{ flex: 1, minWidth: 0, gap: 2 }}>
			<View style={{ direction: 'row', align: 'center', gap: 8 }}>
				{@render title({ flex: 1 })}
				{@render dateAndCaret()}
			</View>
			<View style={{ direction: 'row', align: 'center', gap: 8, paddingLeft: 23 }}>
				{@render senders()}
				{@render viewAll()}
			</View>
		</View>
	{/if}
</View>
