import { describe, expect, test } from 'bun:test'
import { formatTimeRange } from '../ui/lib/timeRange'

// Local-time ISO strings (no zone) keep the expectations independent of the machine's zone.
describe('formatTimeRange', () => {
	test('same day shows one date and both times', () => {
		expect(formatTimeRange('2026-09-02T16:30:00', '2026-09-02T22:40:00', 'en-GB')).toBe(
			'Wed, 2 Sept · 16:30 – 22:40'
		)
	})

	test('an end on another day repeats the date', () => {
		expect(formatTimeRange('2026-09-02T23:20:00', '2026-09-03T08:50:00', 'en-GB')).toBe(
			'Wed, 2 Sept · 23:20 – Thu, 3 Sept 08:50'
		)
	})

	test('a midnight start without an end is a date only', () => {
		expect(formatTimeRange('2026-09-02T00:00:00', null, 'en-GB')).toBe('Wed, 2 Sept')
	})

	test('no start means nothing to show', () => {
		expect(formatTimeRange(null, '2026-09-02T00:00:00')).toBeNull()
	})
})
