export interface ShortcutsState {
	open: boolean
	/** The command waiting for its new key combination, or null. */
	capturing: string | null
}

export function createShortcutsState(): ShortcutsState {
	const state: ShortcutsState = $state({ open: false, capturing: null })
	return state
}
