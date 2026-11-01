// How the reading pane writes senders, recipients, dates and sizes.

import type { MessageAddress, ThreadMessage } from '../../../shared/mail'

export function senderLabel(message: ThreadMessage): string {
	if (message.fromName !== '') return `${message.fromName} <${message.fromAddress}>`
	return message.fromAddress
}

export function senderName(message: ThreadMessage): string {
	if (message.fromName !== '') return message.fromName
	return message.fromAddress
}

export function recipientLine(addresses: MessageAddress[]): string {
	return addresses
		.map((entry) => {
			if (entry.name !== '') return `${entry.name} <${entry.address}>`
			return entry.address
		})
		.join(', ')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "Thu, 30 Oct, 22:09", with the year after the month when it is not this year. Written out by
 * hand: the window's JavaScript engine ignores the options of `toLocaleString`.
 */
export function formatFullDate(iso: string, now: Date = new Date()): string {
	const date = new Date(iso)
	let day = `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`
	if (date.getFullYear() !== now.getFullYear()) day = `${day} ${date.getFullYear()}`
	return `${day}, ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

function twoDigits(value: number): string {
	return String(value).padStart(2, '0')
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function plural(count: number, word: string): string {
	if (count === 1) return `${count} ${word}`
	return `${count} ${word}s`
}

export function describeError(error: unknown): string {
	if (error instanceof Error) return error.message
	return String(error)
}
