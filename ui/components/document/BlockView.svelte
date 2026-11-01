<!--
  One block of a document, drawing nested blocks (quotes, lists, rows) with itself.
-->
<script lang="ts">
	import { Icon, Image, Text, View } from '@neoworks/svelte-gpui/ui'
	import type { Style } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import imageIcon from '@phosphor-icons/core/regular/image.svg'
	import type { Block, ImageBlock, TextAlign } from '../../../shared/document'
	import BlockView from './BlockView.svelte'
	import Inlines from './Inlines.svelte'
	import { useDocumentContext } from './context'

	let { block }: { block: Block } = $props()

	const document = useDocumentContext()
	const theme = $derived(currentTheme())

	const HEADING_SIZES: Record<number, number> = { 1: 24, 2: 20, 3: 18, 4: 16, 5: 15, 6: 14 }
	const MAX_IMAGE_WIDTH = 640
	const SMALL_IMAGE_WIDTH = 64

	function bodyStyle(): Style {
		// Long URLs are single words; without breaking anywhere they run out of the column.
		if (document.dense) {
			return {
				...typeStyle('caption'),
				fontSize: 14,
				lineHeight: 21,
				color: theme.colors.text,
				overflowWrap: 'anywhere'
			}
		}
		return { ...typeStyle('bodySmall'), color: theme.colors.text, overflowWrap: 'anywhere' }
	}

	function alignStyle(align: TextAlign | undefined): Style {
		if (align === 'center') return { textAlign: 'center' }
		if (align === 'end') return { textAlign: 'right' }
		return {}
	}

	function headingStyle(level: number, align: TextAlign | undefined): Style {
		const fontSize = HEADING_SIZES[level]
		return {
			fontFamily: 'sans',
			fontSize,
			lineHeight: Math.round(fontSize * 1.3),
			fontWeight: 600,
			color: theme.colors.text,
			...alignStyle(align)
		}
	}

	function imageAlign(align: TextAlign | undefined): Style {
		if (align === 'center') return { alignSelf: 'center' }
		if (align === 'end') return { alignSelf: 'end' }
		return { alignSelf: 'start' }
	}

	/** Shown at its own size up to the column's width, keeping its shape when both sides are known. */
	function imageStyle(image: ImageBlock): Style {
		const style: Style = { maxWidth: '100%', radius: 4, ...imageAlign(image.align) }
		if (image.width !== null) style.width = Math.min(image.width, MAX_IMAGE_WIDTH)
		if (image.width !== null && image.height !== null && image.height > 0) {
			style.aspectRatio = image.width / image.height
		} else if (image.height !== null) {
			style.height = image.height
		}
		if (image.width === null && image.height === null) style.width = '100%'
		return style
	}

	/** A small image such as a social icon: its placeholder is the icon alone. */
	function isIcon(image: ImageBlock): boolean {
		return image.width !== null && image.width <= SMALL_IMAGE_WIDTH
	}

	function blockedLabel(image: ImageBlock): string {
		if (image.alt !== '') return image.alt
		return 'Image not loaded'
	}

	function listMarker(ordered: boolean, start: number, index: number): string {
		if (ordered) return `${start + index}.`
		return '•'
	}
</script>

{#if block.kind === 'paragraph'}
	<Inlines inlines={block.inlines} style={{ ...bodyStyle(), ...alignStyle(block.align) }} />
{:else if block.kind === 'heading'}
	<Inlines inlines={block.inlines} style={headingStyle(block.level, block.align)} />
{:else if block.kind === 'quote'}
	<View
		style={{
			borderLeftWidth: 3,
			borderColor: theme.colors.line,
			paddingLeft: 12,
			gap: 8,
			color: theme.colors.muted
		}}
	>
		{#each block.blocks as child, index (index)}
			<BlockView block={child} />
		{/each}
	</View>
{:else if block.kind === 'list'}
	<View style={{ gap: 4 }}>
		{#each block.items as item, index (index)}
			<View style={{ direction: 'row', gap: 8 }}>
				<Text style={{ ...bodyStyle(), color: theme.colors.muted, minWidth: 18 }}
					>{listMarker(block.ordered, block.start, index)}</Text
				>
				<View style={{ flex: 1, minWidth: 0, gap: 4 }}>
					{#each item as child, childIndex (childIndex)}
						<BlockView block={child} />
					{/each}
				</View>
			</View>
		{/each}
	</View>
{:else if block.kind === 'preformatted'}
	<View style={{ background: theme.colors.sunken, radius: 8, padding: 12 }}>
		<Text
			pre
			style={{
				fontFamily: 'mono',
				fontSize: 13,
				lineHeight: 19,
				color: theme.colors.text,
				overflowWrap: 'anywhere'
			}}>{block.text}</Text
		>
	</View>
{:else if block.kind === 'rule'}
	<View style={{ height: 1, background: theme.colors.line }} />
{:else if block.kind === 'image'}
	{#if block.src === null}
		<View
			style={{
				direction: 'row',
				align: 'center',
				gap: 8,
				paddingX: 10,
				paddingY: 6,
				radius: 6,
				borderWidth: 1,
				borderColor: theme.colors.line,
				color: theme.colors.faint,
				maxWidth: '100%',
				minWidth: 0,
				overflow: 'hidden',
				...imageAlign(block.align)
			}}
		>
			<Icon svg={imageIcon} size={14} />
			{#if !isIcon(block)}
				<Text style={{ ...typeStyle('caption'), truncate: true, maxWidth: 360, minWidth: 0 }}
					>{blockedLabel(block)}</Text
				>
			{/if}
		</View>
	{:else if block.href}
		{@const href = block.href}
		<View
			style={{ cursor: 'pointer', ...imageAlign(block.align), maxWidth: '100%' }}
			onpress={() => document.openLink(href)}
		>
			<Image src={block.src} fit="contain" style={imageStyle(block)} />
		</View>
	{:else}
		<Image src={block.src} fit="contain" style={imageStyle(block)} />
	{/if}
{:else if block.kind === 'row'}
	<View style={{ direction: 'row', gap: 16, align: 'start' }}>
		{#each block.cells as cell, index (index)}
			<View style={{ flex: 1, minWidth: 0, gap: 8 }}>
				{#each cell as child, childIndex (childIndex)}
					<BlockView block={child} />
				{/each}
			</View>
		{/each}
	</View>
{/if}
