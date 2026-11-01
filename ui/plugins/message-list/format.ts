// How dates and senders read in the list.

import type { ThreadSummary } from '../../../shared/mail'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Today's mail shows its time, this year's its day and month, older mail the year too. Written
 * out by hand: the window's JavaScript engine ignores the options of `toLocaleString`.
 */
export function formatListDate(iso: string, now: Date = new Date()): string {
	const date = new Date(iso)
	if (date.toDateString() === now.toDateString()) return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
	const dayAndMonth = `${date.getDate()} ${MONTHS[date.getMonth()]}`
	if (date.getFullYear() === now.getFullYear()) return dayAndMonth
	return `${dayAndMonth} ${date.getFullYear()}`
}

function twoDigits(value: number): string {
	return String(value).padStart(2, '0')
}

export function senderLabel(thread: ThreadSummary): string {
	if (thread.fromName !== '') return thread.fromName
	return thread.fromAddress
}

export function subjectLabel(thread: ThreadSummary): string {
	if (thread.subject !== '') return thread.subject
	return '(no subject)'
}
