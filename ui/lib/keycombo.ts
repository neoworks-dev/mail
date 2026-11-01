// Key combo model for the global keybinding system. Pure helpers — the
// reactive registry is the keymap service (ui/kernel/keymap).

/** A key event as svelte-gpui reports it: the key and its modifiers. */
export interface KeyInput {
	key: string
	ctrl: boolean
	shift: boolean
	alt: boolean
	meta: boolean
}

export interface KeyCombo {
	/** The key event's `key`, lowercased (e.g. "k", "#", "enter"). */
	key: string
	ctrl?: boolean
	shift?: boolean
	alt?: boolean
	meta?: boolean
}

export function comboFromEvent(event: KeyInput): KeyCombo {
	const combo: KeyCombo = { key: normalizeKey(event.key) }
	if (event.ctrl) combo.ctrl = true
	if (event.shift) combo.shift = true
	if (event.alt) combo.alt = true
	if (event.meta) combo.meta = true
	return combo
}

function normalizeKey(key: string): string {
	if (key.length === 1) return key.toLowerCase()
	return key.toLowerCase()
}

export function comboMatches(combo: KeyCombo, event: KeyInput): boolean {
	if (normalizeKey(event.key) !== combo.key) return false
	if (Boolean(combo.ctrl) !== event.ctrl) return false
	if (Boolean(combo.alt) !== event.alt) return false
	if (Boolean(combo.meta) !== event.meta) return false
	// Shift is part of producing keys like "#" — only enforce it when the
	// combo names a key where shift is an independent modifier.
	if (combo.key.length > 1 || /^[a-z0-9]$/.test(combo.key)) {
		if (Boolean(combo.shift) !== event.shift) return false
	}
	return true
}

/** Bindings with a real modifier work everywhere, even while typing. */
export function isGlobalCombo(combo: KeyCombo): boolean {
	return Boolean(combo.ctrl || combo.alt || combo.meta)
}

export function comboLabel(combo: KeyCombo): string {
	const parts: string[] = []
	if (combo.ctrl) parts.push('Ctrl')
	if (combo.meta) parts.push('Cmd')
	if (combo.alt) parts.push('Alt')
	if (combo.shift) parts.push('Shift')
	parts.push(keyLabel(combo.key))
	return parts.join('+')
}

function keyLabel(key: string): string {
	if (key === ' ') return 'Space'
	if (key.length === 1) return key.toUpperCase()
	return key.charAt(0).toUpperCase() + key.slice(1)
}

export function comboEquals(a: KeyCombo, b: KeyCombo): boolean {
	return (
		a.key === b.key &&
		Boolean(a.ctrl) === Boolean(b.ctrl) &&
		Boolean(a.shift) === Boolean(b.shift) &&
		Boolean(a.alt) === Boolean(b.alt) &&
		Boolean(a.meta) === Boolean(b.meta)
	)
}
