import { describe, expect, test } from 'bun:test'
import type { ThreadSummary } from '../shared/mail'
import {
	buildThreadListItems,
	bundleSenders,
	bundleUnreadCount,
	visibleThreads
} from '../ui/lib/bundling'

let nextId = 1

function thread(overrides: Partial<ThreadSummary>): ThreadSummary {
	const id = nextId
	nextId += 1
	return {
		messageId: id,
		accountId: 1,
		folderId: 1,
		uid: id,
		threadId: id,
		subject: `Subject ${id}`,
		fromName: `Sender ${id}`,
		fromAddress: `sender${id}@example.com`,
		date: '2026-08-01T10:00:00Z',
		snippet: '',
		seen: true,
		flagged: false,
		answered: false,
		hasAttachments: false,
		rfcMessageId: `<${id}@example.com>`,
		inReplyTo: null,
		label: null,
		threadTotal: 1,
		threadUnread: 0,
		...overrides
	}
}

describe('buildThreadListItems', () => {
	test('bundling disabled keeps every thread as its own row', () => {
		const threads = [thread({}), thread({ label: 'newsletter' }), thread({ label: 'ad' })]
		const items = buildThreadListItems(threads, false, new Set())
		expect(items).toHaveLength(3)
		expect(items.every((item) => item.type === 'thread')).toBe(true)
	})

	test('bundled labels collapse into one row at the newest position', () => {
		const threads = [
			thread({}),
			thread({ label: 'newsletter' }),
			thread({}),
			thread({ label: 'newsletter' }),
			thread({ label: 'ad' })
		]
		const items = buildThreadListItems(threads, true, new Set())
		expect(items.map((item) => item.type)).toEqual(['thread', 'bundle', 'thread', 'bundle'])
		const newsletterBundle = items[1]
		if (newsletterBundle.type !== 'bundle') throw new Error('expected bundle')
		expect(newsletterBundle.label).toBe('newsletter')
		expect(newsletterBundle.threads).toHaveLength(2)
	})

	test('spam and unlabeled threads never bundle', () => {
		const threads = [thread({ label: 'spam' }), thread({ label: null })]
		const items = buildThreadListItems(threads, true, new Set())
		expect(items.every((item) => item.type === 'thread')).toBe(true)
	})

	test('expanded bundle emits its threads right after the bundle row', () => {
		const threads = [
			thread({ label: 'newsletter' }),
			thread({}),
			thread({ label: 'newsletter' })
		]
		const items = buildThreadListItems(threads, true, new Set(['newsletter']))
		expect(items.map((item) => item.type)).toEqual(['bundle', 'thread', 'thread', 'thread'])
		const secondRow = items[1]
		if (secondRow.type !== 'thread') throw new Error('expected thread')
		expect(secondRow.thread.label).toBe('newsletter')
	})

	test('visibleThreads skips collapsed bundle members', () => {
		const bundled = thread({ label: 'ad' })
		const plain = thread({})
		const items = buildThreadListItems([bundled, plain], true, new Set())
		expect(visibleThreads(items).map((entry) => entry.threadId)).toEqual([plain.threadId])
	})
})

describe('bundle summaries', () => {
	test('bundleSenders dedupes and caps', () => {
		const threads = [
			thread({ fromName: 'Alice' }),
			thread({ fromName: 'Alice' }),
			thread({ fromName: 'Bob' }),
			thread({ fromName: 'Carol' }),
			thread({ fromName: 'Dave' })
		]
		expect(bundleSenders(threads, 3)).toEqual(['Alice', 'Bob', 'Carol'])
	})

	test('bundleUnreadCount sums thread unread counts', () => {
		const threads = [thread({ threadUnread: 2 }), thread({ threadUnread: 0 }), thread({ threadUnread: 1 })]
		expect(bundleUnreadCount(threads)).toBe(3)
	})
})
