import { describe, expect, test } from 'bun:test'
import { formatFullDate } from '../ui/plugins/reading-pane/format'
import { dateSectionTitle, withDateSections } from '../ui/lib/dateSections'

const now = new Date(2026, 10, 1, 15, 30)

function at(year: number, month: number, day: number, hour = 12, minute = 0): string {
	return new Date(year, month, day, hour, minute).toISOString()
}

describe('dateSectionTitle', () => {
	test('names today and yesterday by the calendar, not by 24 hours', () => {
		expect(dateSectionTitle(at(2026, 10, 1, 0, 5), now)).toBe('Today')
		expect(dateSectionTitle(at(2026, 9, 31, 23, 55), now)).toBe('Yesterday')
	})

	test('the rest of the week is the last 7 days', () => {
		expect(dateSectionTitle(at(2026, 9, 30), now)).toBe('Last 7 days')
		expect(dateSectionTitle(at(2026, 9, 26), now)).toBe('Last 7 days')
	})

	test('older mail this year goes by month, earlier years by year', () => {
		expect(dateSectionTitle(at(2026, 9, 25), now)).toBe('October')
		expect(dateSectionTitle(at(2026, 0, 3), now)).toBe('January')
		expect(dateSectionTitle(at(2025, 11, 31), now)).toBe('2025')
	})
})

describe('withDateSections', () => {
	test('puts a section before each run of the same section', () => {
		const dates = [at(2026, 10, 1), at(2026, 10, 1, 9), at(2026, 9, 31), at(2026, 9, 2)]
		const items = withDateSections(dates, (date) => date, now)
		expect(items).toEqual([
			{ type: 'section', title: 'Today' },
			dates[0],
			dates[1],
			{ type: 'section', title: 'Yesterday' },
			dates[2],
			{ type: 'section', title: 'October' },
			dates[3]
		])
	})

	test('items without a date stay in the section before them', () => {
		const items = withDateSections(
			[{ date: at(2026, 10, 1) }, { date: null }, { date: at(2026, 9, 31) }],
			(item) => item.date,
			now
		)
		expect(items.map((item) => ('title' in item ? item.title : item.date))).toEqual([
			'Today',
			at(2026, 10, 1),
			null,
			'Yesterday',
			at(2026, 9, 31)
		])
	})

	test('nothing in gives nothing out', () => {
		expect(withDateSections([], () => null, now)).toEqual([])
	})
})

describe('formatFullDate', () => {
	test('writes weekday, day, month and time, without this year', () => {
		expect(formatFullDate(at(2026, 9, 30, 22, 9), now)).toBe('Fri, 30 Oct, 22:09')
	})

	test('adds the year for other years', () => {
		expect(formatFullDate(at(2025, 0, 5, 7, 3), now)).toBe('Sun, 5 Jan 2025, 07:03')
	})
})
