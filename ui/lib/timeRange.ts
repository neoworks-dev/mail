// "Wed, 2 Sep · 16:30 – 22:40" for a summary card's start and end. The end drops its date
// when it falls on the same day; a midnight start without an end is shown as a date only.

const DAY_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

export function formatTimeRange(
	startsAt: string | null,
	endsAt: string | null,
	locale?: string
): string | null {
	if (startsAt === null) return null
	const start = new Date(startsAt)
	const startDay = start.toLocaleDateString(locale, DAY_FORMAT)
	const startTime = start.toLocaleTimeString(locale, TIME_FORMAT)

	if (endsAt === null) {
		if (isMidnight(start)) return startDay
		return `${startDay} · ${startTime}`
	}

	const end = new Date(endsAt)
	const endTime = end.toLocaleTimeString(locale, TIME_FORMAT)
	if (start.toDateString() === end.toDateString()) return `${startDay} · ${startTime} – ${endTime}`
	const endDay = end.toLocaleDateString(locale, DAY_FORMAT)
	return `${startDay} · ${startTime} – ${endDay} ${endTime}`
}

function isMidnight(date: Date): boolean {
	return date.getHours() === 0 && date.getMinutes() === 0
}
