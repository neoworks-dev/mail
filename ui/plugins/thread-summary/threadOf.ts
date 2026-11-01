import type { ReadingTab } from '../reader/service.svelte'

/** The thread a tab shows, or null for another kind of view. */
export function threadOf(tab: ReadingTab): number | null {
	if (tab.view.kind !== 'thread') return null
	return tab.view.threadId
}
