<!--
  The conversations of one bulk category folded into a row, Gmail-style. Pressing it unfolds
  them under it; "View all" opens the category as its own list.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import caretUpIcon from '@phosphor-icons/core/regular/caret-up.svg'
	import type { ThreadSummary } from '../../../shared/mail'
	import { labelTitle } from '../../components/message-list/labels'
	import { bundleSenders, bundleUnreadCount } from '../../lib/bundling'
	import { formatListDate } from './format'
	import LabelPill from './LabelPill.svelte'

	interface Props {
		label: string
		threads: ThreadSummary[]
		expanded: boolean
		ontoggle: () => void
		onviewall: () => void
	}

	let { label, threads, expanded, ontoggle, onviewall }: Props = $props()

	const theme = $derived(currentTheme())
	const unreadCount = $derived(bundleUnreadCount(threads))

	function countLabel(): string {
		if (threads.length === 1) return '1 conversation'
		return `${threads.length} conversations`
	}

	function countWeight(): number {
		if (unreadCount > 0) return 500
		return 400
	}

	function caret(): string {
		if (expanded) return caretUpIcon
		return caretDownIcon
	}
</script>

<View
	style={{ paddingX: 16, paddingY: 10, gap: 2, borderBottomWidth: 1, borderColor: theme.colors.line, background: theme.colors.canvas, cursor: 'pointer' }}
	hover={{ background: theme.colors.hover }}
	onpress={ontoggle}
>
	<View style={{ direction: 'row', align: 'center', gap: 6 }}>
		<LabelPill {label} />
		<Text style={{ ...typeStyle('caption'), fontSize: 13.5, color: theme.colors.text, flex: 1, minWidth: 0, truncate: true }}>
			<Text style={{ fontWeight: countWeight() }}>{countLabel()}</Text>
			{#if unreadCount > 0}
				<Text style={{ fontWeight: 400, fontSize: 12, color: theme.colors.faint }}>{`  ${unreadCount} unread`}</Text>
			{/if}
		</Text>
		<Text style={{ fontSize: 12, color: theme.colors.faint }}>{formatListDate(threads[0].date)}</Text>
		<Icon svg={caret()} size={12} color={theme.colors.faint} />
	</View>
	<Text style={{ fontSize: 13, color: theme.colors.muted, truncate: true }}>{bundleSenders(threads, 3).join(', ')}</Text>
	<View style={{ alignSelf: 'start', cursor: 'pointer' }} onpress={onviewall}>
		<Text style={{ fontSize: 12, color: theme.colors.accent, underline: true }}>View all {labelTitle(label).toLowerCase()}</Text>
	</View>
</View>
