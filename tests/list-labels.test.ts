import { describe, expect, test } from 'bun:test'
import type { MailFolder, ThreadSummary } from '../shared/mail'
import { participantsLabel } from '../ui/plugins/message-list/format'
import { folderDisplayName } from '../ui/plugins/sidebar/folders'

function thread(participants: ThreadSummary['participants']): ThreadSummary {
	return {
		messageId: 1,
		accountId: 1,
		folderId: 1,
		uid: 1,
		threadId: 1,
		subject: 'Subject',
		fromName: 'Susanne Probst, Save the Children',
		fromAddress: 'susanne@example.org',
		date: '2026-10-01T10:00:00Z',
		snippet: '',
		seen: true,
		flagged: false,
		answered: false,
		hasAttachments: false,
		rfcMessageId: '<1@example.org>',
		inReplyTo: null,
		label: null,
		threadTotal: participants.length,
		threadUnread: 0,
		participants
	}
}

describe('participantsLabel', () => {
	test('a single writer keeps the full sender name', () => {
		const single = thread([
			{ name: 'Susanne Probst, Save the Children', address: 'susanne@example.org' }
		])
		expect(participantsLabel(single, 'me@example.com')).toBe('Susanne Probst, Save the Children')
	})

	test('several writers go by first name, the user as me', () => {
		const conversation = thread([
			{ name: 'Susanne Probst, Save the Children', address: 'susanne@example.org' },
			{ name: 'Moritz Utcke', address: 'Me@Example.com' }
		])
		expect(participantsLabel(conversation, 'me@example.com')).toBe('Susanne, me')
	})

	test('long conversations show the first and the last two writers', () => {
		const conversation = thread([
			{ name: 'Ada Lovelace', address: 'ada@example.com' },
			{ name: '', address: 'bob@example.com' },
			{ name: 'Cleo Park', address: 'cleo@example.com' },
			{ name: 'Dan Moe', address: 'dan@example.com' }
		])
		expect(participantsLabel(conversation, 'me@example.com')).toBe('Ada … Cleo, Dan')
	})
})

function folder(overrides: Partial<MailFolder>): MailFolder {
	return {
		folderId: 1,
		accountId: 1,
		path: 'Folder',
		name: 'Folder',
		specialUse: null,
		totalMessages: 0,
		unreadMessages: 0,
		...overrides
	}
}

describe('folderDisplayName', () => {
	test('flagged folders take the UI name whatever the server calls them', () => {
		expect(folderDisplayName(folder({ name: 'Entwürfe', specialUse: '\\Drafts' }))).toBe('Drafts')
		expect(folderDisplayName(folder({ name: 'Spamverdacht', specialUse: '\\Junk' }))).toBe('Junk')
		expect(folderDisplayName(folder({ path: 'INBOX', name: 'INBOX' }))).toBe('Inbox')
	})

	test('unflagged folders keep their own name', () => {
		expect(folderDisplayName(folder({ name: 'Archives' }))).toBe('Archives')
		expect(folderDisplayName(folder({ name: 'Gesendet' }))).toBe('Gesendet')
	})
})
