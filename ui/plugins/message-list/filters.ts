// What the filter chips above the list offer and show.

import type { ThreadFilter, ThreadSummary } from '../../../shared/mail'

export interface SenderOption {
	address: string
	name: string
	threadCount: number
}

export function hasActiveFilter(filter: ThreadFilter): boolean {
	if (filter.unread || filter.flagged || filter.hasAttachments) return true
	return filter.fromAddress !== null
}

/** The senders with the most loaded threads, for the "From" chip's menu. */
export function frequentSenders(threads: ThreadSummary[], limit: number): SenderOption[] {
	const byAddress = new Map<string, SenderOption>()
	for (const thread of threads) {
		const address = thread.fromAddress.toLowerCase()
		if (address === '') continue
		const known = byAddress.get(address)
		if (known) {
			known.threadCount += 1
			continue
		}
		byAddress.set(address, { address, name: thread.fromName, threadCount: 1 })
	}
	return [...byAddress.values()]
		.sort((first, second) => second.threadCount - first.threadCount)
		.slice(0, limit)
}

export function senderOptionLabel(option: SenderOption): string {
	if (option.name !== '') return option.name
	return option.address
}
