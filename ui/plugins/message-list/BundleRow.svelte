<!--
  The conversations of one bulk category folded into a row, Gmail-style: the category on a tinted
  tile, how many are new, and who sent them. Pressing it unfolds them under it; "View all" opens
  the category as its own list.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import bellIcon from '@phosphor-icons/core/regular/bell.svg'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import caretUpIcon from '@phosphor-icons/core/regular/caret-up.svg'
	import megaphoneIcon from '@phosphor-icons/core/regular/megaphone.svg'
	import newspaperIcon from '@phosphor-icons/core/regular/newspaper.svg'
	import tagIcon from '@phosphor-icons/core/regular/tag.svg'
	import usersIcon from '@phosphor-icons/core/regular/users.svg'
	import type { ThreadSummary } from '../../../shared/mail'
	import { labelColors, labelTitle } from '../../components/message-list/labels'
	import { bundleSenders, bundleUnreadCount } from '../../lib/bundling'
	import { formatListDate } from './format'

	interface Props {
		label: string
		threads: ThreadSummary[]
		expanded: boolean
		ontoggle: () => void
		onviewall: () => void
	}

	let { label, threads, expanded, ontoggle, onviewall }: Props = $props()

	const LABEL_ICONS: Record<string, string> = {
		newsletter: newspaperIcon,
		ad: megaphoneIcon,
		notification: bellIcon,
		social: usersIcon
	}

	const theme = $derived(currentTheme())
	const colors = $derived(labelColors(theme, label))
	const unreadCount = $derived(bundleUnreadCount(threads))
	const unread = $derived(unreadCount > 0)

	function labelIcon(): string {
		const icon = LABEL_ICONS[label]
		if (icon) return icon
		return tagIcon
	}

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

<View
	style={{
		direction: 'row',
		gap: 10,
		marginX: 6,
		paddingLeft: 22,
		paddingRight: 12,
		paddingY: 10,
		radius: theme.radii.control,
		cursor: 'pointer',
		transition: 100
	}}
	hover={{ background: theme.colors.hover }}
	onpress={ontoggle}
>
	<View
		style={{
			size: 32,
			radius: 10,
			shrink: 0,
			align: 'center',
			justify: 'center',
			background: colors.background,
			color: colors.color
		}}
	>
		<Icon svg={labelIcon()} size={16} />
	</View>
	<View style={{ flex: 1, minWidth: 0, gap: 1 }}>
		<View style={{ direction: 'row', align: 'center', gap: 8 }}>
			<Text
				style={{
					...typeStyle('caption'),
					fontSize: 13.5,
					fontWeight: titleWeight(),
					color: titleColor()
				}}>{labelTitle(label)}</Text
			>
			<Text style={{ ...typeStyle('caption'), fontSize: 12, color: countColor(), flex: 1 }}
				>{countLabel()}</Text
			>
			<Text style={{ fontSize: 12, color: theme.colors.faint }}
				>{formatListDate(threads[0].date)}</Text
			>
			<Icon svg={caret()} size={12} color={theme.colors.faint} />
		</View>
		<View style={{ direction: 'row', align: 'center', gap: 8 }}>
			<Text
				style={{ fontSize: 12.5, color: theme.colors.faint, flex: 1, minWidth: 0, truncate: true }}
				>{bundleSenders(threads, 3).join(', ')}</Text
			>
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
		</View>
	</View>
</View>
