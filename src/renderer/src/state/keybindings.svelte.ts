// Global keybinding registry. Bindings are declared once (App.svelte), user
// overrides persist in localStorage, and a single window keydown handler
// dispatches. Single-key bindings are suppressed while typing or while an
// overlay is open; combos with a real modifier always fire.

import {
	comboEquals,
	comboMatches,
	isGlobalCombo,
	type KeyCombo
} from './keycombo'

export interface KeybindingDef {
	id: string
	title: string
	defaultCombo: KeyCombo
	/** Extra context guard evaluated at dispatch time. */
	when?: () => boolean
	run: () => void
}

const OVERRIDES_KEY = 'neomail:keybindings'

function loadOverrides(): Record<string, KeyCombo> {
	try {
		const parsed = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}')
		if (parsed && typeof parsed === 'object') return parsed as Record<string, KeyCombo>
	} catch {
		// Corrupt storage — fall back to defaults.
	}
	return {}
}

class KeybindingsState {
	private defs = new Map<string, KeybindingDef>()
	overrides = $state<Record<string, KeyCombo>>(loadOverrides())
	/** True while the settings overlay is waiting for a rebind keypress. */
	captureActive = $state(false)

	register(defs: KeybindingDef[]): void {
		for (const def of defs) {
			this.defs.set(def.id, def)
		}
	}

	list(): Array<{ def: KeybindingDef; combo: KeyCombo; overridden: boolean }> {
		return [...this.defs.values()].map((def) => ({
			def,
			combo: this.comboFor(def.id),
			overridden: def.id in this.overrides
		}))
	}

	comboFor(id: string): KeyCombo {
		const override = this.overrides[id]
		if (override) return override
		const def = this.defs.get(id)
		if (!def) return { key: '' }
		return def.defaultCombo
	}

	setOverride(id: string, combo: KeyCombo): void {
		const def = this.defs.get(id)
		if (def && comboEquals(combo, def.defaultCombo)) {
			this.resetOverride(id)
			return
		}
		this.overrides = { ...this.overrides, [id]: combo }
		localStorage.setItem(OVERRIDES_KEY, JSON.stringify(this.overrides))
	}

	resetOverride(id: string): void {
		const next = { ...this.overrides }
		delete next[id]
		this.overrides = next
		localStorage.setItem(OVERRIDES_KEY, JSON.stringify(this.overrides))
	}

	/**
	 * Dispatch a window keydown. `blocked` means an input is focused or an
	 * overlay is open — only modifier combos fire then. Returns true when a
	 * binding ran (the event is consumed).
	 */
	handleKeydown(event: KeyboardEvent, blocked: boolean): boolean {
		if (this.captureActive) return false
		for (const def of this.defs.values()) {
			const combo = this.comboFor(def.id)
			if (combo.key === '') continue
			if (!comboMatches(combo, event)) continue
			if (blocked && !isGlobalCombo(combo)) continue
			if (def.when && !def.when()) continue
			event.preventDefault()
			def.run()
			return true
		}
		return false
	}
}

export const keybindings = new KeybindingsState()
