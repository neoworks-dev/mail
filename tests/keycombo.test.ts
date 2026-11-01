import { describe, expect, test } from 'bun:test'
import {
	comboEquals,
	comboFromEvent,
	comboLabel,
	comboMatches,
	isGlobalCombo
} from '../ui/lib/keycombo'

function fakeEvent(key: string, modifiers: Partial<KeyboardEvent> = {}): KeyboardEvent {
	return {
		key,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		...modifiers
	} as KeyboardEvent
}

describe('comboMatches', () => {
	test('plain letter', () => {
		expect(comboMatches({ key: 'j' }, fakeEvent('j'))).toBe(true)
		expect(comboMatches({ key: 'j' }, fakeEvent('j', { ctrlKey: true }))).toBe(false)
	})

	test('ctrl combo', () => {
		expect(comboMatches({ key: 'k', ctrl: true }, fakeEvent('k', { ctrlKey: true }))).toBe(true)
		expect(comboMatches({ key: 'k', ctrl: true }, fakeEvent('k'))).toBe(false)
	})

	test('shift-produced characters ignore the shift flag', () => {
		// '#' arrives with shiftKey on many layouts; the combo stays {key:'#'}.
		expect(comboMatches({ key: '#' }, fakeEvent('#', { shiftKey: true }))).toBe(true)
		expect(comboMatches({ key: '?' }, fakeEvent('?', { shiftKey: true }))).toBe(true)
	})

	test('shift enforced on letters and named keys', () => {
		expect(comboMatches({ key: 'a', ctrl: true, shift: true }, fakeEvent('A', { ctrlKey: true, shiftKey: true }))).toBe(true)
		expect(comboMatches({ key: 'a', ctrl: true }, fakeEvent('A', { ctrlKey: true, shiftKey: true }))).toBe(false)
	})

	test('named keys match case-insensitively', () => {
		expect(comboMatches({ key: 'enter' }, fakeEvent('Enter'))).toBe(true)
	})
})

describe('comboFromEvent / comboEquals round trip', () => {
	test('captures modifiers', () => {
		const combo = comboFromEvent(fakeEvent('K', { ctrlKey: true, shiftKey: true }))
		expect(comboEquals(combo, { key: 'k', ctrl: true, shift: true })).toBe(true)
	})
})

describe('isGlobalCombo', () => {
	test('modifier combos are global, bare keys are not', () => {
		expect(isGlobalCombo({ key: 'k', ctrl: true })).toBe(true)
		expect(isGlobalCombo({ key: 'j' })).toBe(false)
		expect(isGlobalCombo({ key: '#', shift: true })).toBe(false)
	})
})

describe('comboLabel', () => {
	test('renders readable labels', () => {
		expect(comboLabel({ key: 'k', ctrl: true })).toBe('Ctrl+K')
		expect(comboLabel({ key: 'enter' })).toBe('Enter')
		expect(comboLabel({ key: 'a', ctrl: true, shift: true })).toBe('Ctrl+Shift+A')
	})
})
