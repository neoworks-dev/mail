<!--
  One item of the chat. The user's messages are bubbles on the right, the agent's replies are
  drawn as documents, thoughts and tool calls fold into one-line rows that open on a press, and
  notices are small centred lines. An item's buttons follow it.
-->
<script lang="ts">
	import { Button, Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, LoadingSpinner, typeStyle } from '@neoworks/svelte-gpui-ui'
	import caretDown from '@phosphor-icons/core/regular/caret-down.svg'
	import caretRight from '@phosphor-icons/core/regular/caret-right.svg'
	import check from '@phosphor-icons/core/regular/check.svg'
	import circleDashed from '@phosphor-icons/core/regular/circle-dashed.svg'
	import xIcon from '@phosphor-icons/core/regular/x.svg'
	import type { AssistantItem } from '../../../shared/assistant'
	import type { Block, Inline } from '../../../shared/document'
	import { DocumentView } from '../../components/document'
	import type { AssistantService } from '../assistant/service.svelte'
	import ItemButtons from './ItemButtons.svelte'

	interface Props {
		item: AssistantItem
		assistant: AssistantService
		onopenlink: (href: string) => void
	}

	let { item, assistant, onopenlink }: Props = $props()

	const theme = $derived(currentTheme())
	let unfolded = $state(false)

	const foldable = $derived(item.kind === 'thought' || item.kind === 'tool')

	const rowTitle = $derived.by(() => {
		if (item.kind === 'thought') return 'Thought'
		if (item.label) return item.label
		const firstLine = firstTextLine(item.blocks)
		if (firstLine !== '') return firstLine
		return 'Tool'
	})

	/** The first line of text in the blocks, for a row with no label of its own. */
	function firstTextLine(blocks: Block[]): string {
		for (const block of blocks) {
			if (block.kind === 'preformatted') return block.text.split('\n')[0]
			if (block.kind !== 'paragraph' && block.kind !== 'heading') continue
			const text = block.inlines.map(inlineText).join('')
			return text.trim()
		}
		return ''
	}

	function inlineText(inline: Inline): string {
		if (inline.kind === 'text') return inline.text
		return ' '
	}

	const stateIcon = $derived.by(() => {
		if (item.state === 'done') return check
		if (item.state === 'failed') return xIcon
		return circleDashed
	})

	const stateColor = $derived.by(() => {
		if (item.state === 'done') return theme.colors.success
		if (item.state === 'failed') return theme.colors.danger
		return theme.colors.faint
	})

	const caret = $derived.by(() => {
		if (unfolded) return caretDown
		return caretRight
	})
</script>

<View style={{ paddingX: 16, paddingY: 6, gap: 6 }}>
	{#if item.kind === 'user'}
		<View style={{ alignSelf: 'end', maxWidth: '88%', gap: 2 }}>
			{#if item.label}
				<Text style={{ ...typeStyle('caption'), fontSize: 11, color: theme.colors.faint, textAlign: 'right' }}>
					{item.label}
				</Text>
			{/if}
			<View style={{ background: theme.colors.sunken, radius: theme.radii.control, paddingX: 12, paddingY: 8 }}>
				<DocumentView blocks={item.blocks} {onopenlink} dense />
			</View>
		</View>
	{:else if item.kind === 'agent'}
		<DocumentView blocks={item.blocks} {onopenlink} dense />
	{:else if item.kind === 'notice'}
		<View style={{ align: 'center', opacity: 0.8 }}>
			<DocumentView blocks={item.blocks} {onopenlink} dense />
		</View>
	{:else if foldable}
		<Button
			style={{ direction: 'row', align: 'center', gap: 8, paddingY: 2, radius: 6, color: theme.colors.muted }}
			hover={{ color: theme.colors.text }}
			onpress={() => (unfolded = !unfolded)}
		>
			{#if item.kind === 'tool' && item.state === 'running'}
				<LoadingSpinner size={12} thickness={2} label="Running" />
			{:else if item.kind === 'tool'}
				<Icon svg={stateIcon} size={12} color={stateColor} />
			{/if}
			<Text style={{ ...typeStyle('caption'), flex: 1, minWidth: 0, truncate: true }}>{rowTitle}</Text>
			{#if item.blocks.length > 0}
				<Icon svg={caret} size={12} />
			{/if}
		</Button>
		{#if unfolded && item.blocks.length > 0}
			<View style={{ paddingLeft: 20, opacity: 0.75 }}>
				<DocumentView blocks={item.blocks} {onopenlink} dense />
			</View>
		{/if}
	{/if}
	{#if item.buttons.length > 0}
		<ItemButtons {item} {assistant} />
	{/if}
</View>
