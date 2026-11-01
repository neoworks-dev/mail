// Whether the command bar is open and what it starts with: `>` for commands, nothing for search.

export interface PaletteState {
	open: boolean
	/** What the field holds when the bar opens. */
	prefill: string
	/** Counts the openings, so the bar starts afresh each time, even when opened again while open. */
	openings: number
}

export function createPaletteState(): PaletteState {
	const state: PaletteState = $state({ open: false, prefill: '', openings: 0 })
	return state
}

export function openPalette(state: PaletteState, prefill: string): void {
	state.prefill = prefill
	state.openings += 1
	state.open = true
}

export function closePalette(state: PaletteState): void {
	state.open = false
}
