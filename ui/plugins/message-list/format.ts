// How dates and senders read in the list.

import type { MessageAddress, ThreadSummary } from '../../../shared/mail'

/** The sender column of a wide list, which bundle rows line their category up with. */
export const SENDER_COLUMN_WIDTH = 200

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Today's mail shows its time, this year's its day and month, older mail the year too. Written
 * out by hand: the window's JavaScript engine ignores the options of `toLocaleString`.
 */
export function formatListDate(iso: string, now: Date = new Date()): string {
	const date = new Date(iso)
	if (date.toDateString() === now.toDateString())
		return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
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

/** Past this many writers the list shows the first and the last two, as Gmail does. */
const MAX_LISTED_PARTICIPANTS = 3

/**
 * Who wrote in a thread, as the list names them: the sender alone when one person wrote, else
 * everyone by first name, the user as "me", in the order they first wrote.
 */
export function participantsLabel(thread: ThreadSummary, ownAddress: string): string {
	if (thread.participants.length <= 1) return senderLabel(thread)
	const names = thread.participants.map((participant) => {
		if (participant.address.toLowerCase() === ownAddress.toLowerCase()) return 'me'
		return shortName(participant)
	})
	if (names.length <= MAX_LISTED_PARTICIPANTS) return names.join(', ')
	return `${names[0]} … ${names.slice(-2).join(', ')}`
}

function shortName(participant: MessageAddress): string {
	const firstWord = participant.name.trim().split(/\s+/)[0]
	if (firstWord) return firstWord.replace(/,$/, '')
	return participant.address.split('@')[0]
}

export function subjectLabel(thread: ThreadSummary): string {
	if (thread.subject !== '') return thread.subject
	return '(no subject)'
}
