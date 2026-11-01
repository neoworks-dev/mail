// Turns the daemon's resolved chat (view items) into assistant items for the window. Text the
// daemon parsed from markdown maps onto the blocks a mail body uses; code, diffs and key-value
// lists become preformatted text and paragraphs; buttons are kept so the window can press them.
// Interactive neoui documents are not drawn here, and say so.

import type {
	Block as ViewBlock,
	Component,
	ListItem,
	Span,
	TableCell,
	ViewItem
} from '@neoworks-dev/neo-protocol/types'
import type { AssistantButton, AssistantItem } from '../../shared/assistant'
import type { Block, Inline } from '../../shared/document'

export function assistantItem(item: ViewItem): AssistantItem {
	const blocks: Block[] = []
	const buttons: AssistantButton[] = []
	collectComponent(item.component, blocks, buttons)
	return {
		ref: item.ref,
		kind: item.kind,
		label: labelOf(item),
		state: item.state ?? null,
		blocks,
		buttons
	}
}

/** A tool call's title, or the shell command it ran when it has no title of its own. */
function labelOf(item: ViewItem): string | null {
	if (item.label) return item.label
	if (item.command) return item.command
	return null
}

function collectComponent(component: Component, blocks: Block[], buttons: AssistantButton[]): void {
	switch (component.type) {
		case 'text':
			blocks.push(...component.blocks.map(convertBlock))
			return
		case 'card':
			if (component.title) blocks.push({ kind: 'heading', level: 4, inlines: [{ kind: 'text', text: component.title }] })
			for (const child of component.children) collectComponent(child, blocks, buttons)
			return
		case 'row':
		case 'stack':
			for (const child of component.children) collectComponent(child, blocks, buttons)
			return
		case 'code':
			blocks.push({ kind: 'preformatted', text: component.code })
			return
		case 'diff':
			blocks.push({ kind: 'preformatted', text: diffText(component) })
			return
		case 'kv':
			for (const entry of component.items) blocks.push(paragraph(`${entry.key}: ${entry.value}`))
			return
		case 'file':
			blocks.push(paragraph(component.name ?? component.path))
			return
		case 'button':
			buttons.push({ label: component.label, action: component.action, args: component.args, current: component.current })
			return
		default:
			collectOther(component, blocks, buttons)
	}
}

/** Components with children of their own kind, and the ones drawn as a plain note. */
function collectOther(component: Component, blocks: Block[], buttons: AssistantButton[]): void {
	const children = (component as { children?: Component[] }).children
	if (Array.isArray(children)) {
		for (const child of children) collectComponent(child, blocks, buttons)
		return
	}
	if (component.type === 'image') {
		blocks.push(paragraph(`[image${component.alt ? `: ${component.alt}` : ''}]`))
	}
}

function convertBlock(block: ViewBlock): Block {
	switch (block.type) {
		case 'paragraph':
			return { kind: 'paragraph', inlines: convertSpans(block.spans) }
		case 'heading':
			return { kind: 'heading', level: headingLevel(block.level), inlines: convertSpans(block.spans) }
		case 'list':
			return { kind: 'list', ordered: block.ordered, start: block.start ?? 1, items: block.items.map(convertListItem) }
		case 'code_block':
			return { kind: 'preformatted', text: block.code }
		case 'quote':
			return { kind: 'quote', blocks: block.blocks.map(convertBlock) }
		case 'rule':
			return { kind: 'rule' }
		case 'table_block':
			return { kind: 'preformatted', text: tableText(block.header, block.rows) }
		default:
			return paragraph('[interactive content: open it in neo to use it]')
	}
}

function convertListItem(item: ListItem): Block[] {
	const blocks = item.blocks.map(convertBlock)
	if (item.checked === undefined) return blocks
	const mark = item.checked ? '☑ ' : '☐ '
	const first = blocks[0]
	if (first && first.kind === 'paragraph') first.inlines.unshift({ kind: 'text', text: mark })
	return blocks
}

function convertSpans(spans: Span[]): Inline[] {
	const inlines: Inline[] = []
	for (const span of spans) {
		const lines = span.text.split('\n')
		lines.forEach((line, index) => {
			if (index > 0) inlines.push({ kind: 'break' })
			if (line === '') return
			inlines.push({
				kind: 'text',
				text: line,
				bold: span.bold,
				italic: span.italic,
				code: span.code,
				strike: span.strike,
				href: safeHref(span.href)
			})
		})
	}
	return inlines
}

function safeHref(href: string | undefined): string | undefined {
	if (href && /^(https?:|mailto:)/i.test(href)) return href
	return undefined
}

function headingLevel(level: number): 1 | 2 | 3 | 4 | 5 | 6 {
	return Math.min(6, Math.max(1, Math.round(level))) as 1 | 2 | 3 | 4 | 5 | 6
}

function paragraph(text: string): Block {
	return { kind: 'paragraph', inlines: [{ kind: 'text', text }] }
}

function cellText(cell: TableCell): string {
	return cell.spans.map((span) => span.text).join('')
}

function tableText(header: TableCell[], rows: TableCell[][]): string {
	const lines = [header.map(cellText).join(' │ ')]
	for (const row of rows) lines.push(row.map(cellText).join(' │ '))
	return lines.join('\n')
}

function diffText(component: Extract<Component, { type: 'diff' }>): string {
	const prefixes: Record<string, string> = { add: '+', remove: '-', context: ' ', hunk: '' }
	const lines = component.lines.map((line) => `${prefixes[line.kind]}${line.text}`)
	if (component.path) lines.unshift(component.path)
	return lines.join('\n')
}
