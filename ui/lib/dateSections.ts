// The list's date sections: Today, Yesterday, the last seven days, this year's months by name,
// and older mail by year. Written out by hand: the window's JavaScript engine ignores the options
// of `toLocaleString`.

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
]

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

export type Sectioned<Item> = { type: 'section'; title: string } | Item

export function dateSectionTitle(iso: string, now: Date = new Date()): string {
	const date = new Date(iso)
	const daysAgo = calendarDaysBetween(date, now)
	if (daysAgo <= 0) return 'Today'
	if (daysAgo === 1) return 'Yesterday'
	if (daysAgo < 7) return 'Last 7 days'
	if (date.getFullYear() === now.getFullYear()) return MONTH_NAMES[date.getMonth()]
	return String(date.getFullYear())
}

/**
 * The items with a section before each run of items whose dates fall in the same section. An
 * item whose date is null stays in the section before it, as the threads under a bundle do.
 */
export function withDateSections<Item>(
	items: Item[],
	dateOf: (item: Item) => string | null,
	now: Date = new Date()
): Array<Sectioned<Item>> {
	const result: Array<Sectioned<Item>> = []
	let currentTitle: string | null = null
	for (const item of items) {
		const date = dateOf(item)
		if (date === null) {
			result.push(item)
			continue
		}
		const title = dateSectionTitle(date, now)
		if (title !== currentTitle) {
			result.push({ type: 'section', title })
			currentTitle = title
		}
		result.push(item)
	}
	return result
}

/** Whole days between two dates as the calendar counts them, ignoring the time of day. */
function calendarDaysBetween(earlier: Date, later: Date): number {
	const earlierMidnight = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate())
	const laterMidnight = new Date(later.getFullYear(), later.getMonth(), later.getDate())
	return Math.round((laterMidnight.getTime() - earlierMidnight.getTime()) / DAY_MILLISECONDS)
}
