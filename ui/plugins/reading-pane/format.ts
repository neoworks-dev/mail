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

export function formatFullDate(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	})
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
