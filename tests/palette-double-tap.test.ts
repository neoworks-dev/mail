import { describe, expect, test } from 'bun:test'
import { createDoubleTap } from '../ui/plugins/palette/doubleTap'

describe('createDoubleTap', () => {
	test('two presses inside the window complete it', () => {
		const tap = createDoubleTap(350)
		expect(tap.press(1000)).toBe(false)
		expect(tap.press(1200)).toBe(true)
	})

	test('presses further apart start over', () => {
		const tap = createDoubleTap(350)
		expect(tap.press(1000)).toBe(false)
		expect(tap.press(1500)).toBe(false)
		expect(tap.press(1700)).toBe(true)
	})

	test('a completed double tap needs two fresh presses', () => {
		const tap = createDoubleTap(350)
		tap.press(0)
		expect(tap.press(100)).toBe(true)
		expect(tap.press(200)).toBe(false)
	})
})
