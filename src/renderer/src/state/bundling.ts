// Gmail-style inbox bundling: threads of a bulk label collapse into one row
// at the position of the newest thread of that label.

import type { ThreadSummary } from '../../../shared/mail'

export const BUNDLED_LABELS: string[] = ['newsletter', 'ad', 'notification', 'social']

export type ThreadListItem =
	| { type: 'thread'; thread: ThreadSummary }
	| { type: 'bundle'; label: string; threads: ThreadSummary[]; expanded: boolean }

/**
 * Fold the flat thread list into display items. A bundled label's threads are
 * grouped behind a single bundle row; expanded labels additionally emit their
 * threads right after the bundle row.
 */
export function buildThreadListItems(
	threads: ThreadSummary[],
	bundlingEnabled: boolean,
	expandedLabels: ReadonlySet<string>
): ThreadListItem[] {
	if (!bundlingEnabled) {
		return threads.map((thread) => ({ type: 'thread', thread }))
	}

	const bundles = new Map<string, ThreadListItem[]>()
	const items: ThreadListItem[] = []
	for (const thread of threads) {
		const label = thread.label
		if (label === null || !BUNDLED_LABELS.includes(label)) {
			items.push({ type: 'thread', thread })
			continue
		}
		let bundleSlot = bundles.get(label)
		if (!bundleSlot) {
			const bundle: ThreadListItem = {
				type: 'bundle',
				label,
				threads: [],
				expanded: expandedLabels.has(label)
			}
			bundleSlot = [bundle]
			bundles.set(label, bundleSlot)
			items.push(bundle)
		}
		const bundle = bundleSlot[0]
		if (bundle.type === 'bundle') bundle.threads.push(thread)
	}

	return expandBundles(items)
}

function expandBundles(items: ThreadListItem[]): ThreadListItem[] {
	const result: ThreadListItem[] = []
	for (const item of items) {
		result.push(item)
		if (item.type !== 'bundle' || !item.expanded) continue
		for (const thread of item.threads) {
			result.push({ type: 'thread', thread })
		}
	}
	return result
}

/** Thread rows in display order — the space shift-range selection works over. */
export function visibleThreads(items: ThreadListItem[]): ThreadSummary[] {
	const threads: ThreadSummary[] = []
	for (const item of items) {
		if (item.type === 'thread') threads.push(item.thread)
	}
	return threads
}

/** Up to `limit` distinct sender names of a bundle, newest first. */
export function bundleSenders(threads: ThreadSummary[], limit: number): string[] {
	const names: string[] = []
	for (const thread of threads) {
		const name = thread.fromName !== '' ? thread.fromName : thread.fromAddress
		if (names.includes(name)) continue
		names.push(name)
		if (names.length >= limit) break
	}
	return names
}

export function bundleUnreadCount(threads: ThreadSummary[]): number {
	let count = 0
	for (const thread of threads) {
		count += thread.threadUnread
	}
	return count
}
