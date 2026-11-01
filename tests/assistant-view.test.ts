import { describe, expect, test } from 'bun:test'
import type { ViewItem } from '@neoworks-dev/neo-protocol/types'
import { assistantItem } from '../sidecar/neo/view'

describe('assistantItem', () => {
	test('maps markdown spans onto document blocks, keeping safe links', () => {
		const item: ViewItem = {
			ref: 'r1',
			kind: 'agent',
			component: {
				type: 'text',
				blocks: [
					{ type: 'heading', level: 2, spans: [{ text: 'Plan' }] },
					{
						type: 'paragraph',
						spans: [
							{ text: 'See ', bold: true },
							{ text: 'docs', href: 'https://example.com' },
							{ text: ' or ', italic: true },
							{ text: 'that', href: 'file:///etc/passwd' }
						]
					},
					{ type: 'code_block', code: 'bun test' }
				]
			}
		}
		const converted = assistantItem(item)
		expect(converted.kind).toBe('agent')
		expect(converted.blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'preformatted'])
		const paragraph = converted.blocks[1]
		if (paragraph.kind !== 'paragraph') throw new Error('expected a paragraph')
		const runs = paragraph.inlines.filter((inline) => inline.kind === 'text')
		expect(runs[1]).toMatchObject({ text: 'docs', href: 'https://example.com' })
		expect(runs[3].href).toBeUndefined()
	})

	test('collects buttons from cards and rows, and keeps tool state', () => {
		const item: ViewItem = {
			ref: 't1',
			kind: 'tool',
			label: 'mail.search_email',
			state: 'running',
			component: {
				type: 'card',
				title: 'Allow?',
				children: [
					{ type: 'kv', items: [{ key: 'query', value: 'invoice' }] },
					{
						type: 'row',
						children: [
							{ type: 'button', label: 'Allow', action: 'neo.permit', args: { id: 1, option: 'allow' } },
							{ type: 'button', label: 'Deny', action: 'neo.permit', args: { id: 1, option: 'deny' } }
						]
					}
				]
			}
		}
		const converted = assistantItem(item)
		expect(converted.state).toBe('running')
		expect(converted.label).toBe('mail.search_email')
		expect(converted.buttons.map((button) => button.label)).toEqual(['Allow', 'Deny'])
		expect(converted.blocks[0]).toMatchObject({ kind: 'heading' })
	})
})
