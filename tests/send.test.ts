import { describe, expect, test } from 'bun:test'
import { composeMail, renderMarkdownEmail, smtpSettings } from '../sidecar/mail/send'
import type { AccountCredentials } from '../sidecar/mail/store'

function credentials(overrides: Partial<AccountCredentials>): AccountCredentials {
	return {
		accountId: 1,
		email: 'user@example.com',
		imapHost: 'imap.example.com',
		imapPort: 993,
		imapUser: 'user@example.com',
		imapPassword: 'secret',
		useTls: true,
		smtpHost: null,
		smtpPort: null,
		authType: 'password',
		oauthClientId: null,
		oauthClientSecret: null,
		oauthRefreshToken: null,
		...overrides
	}
}

describe('smtpSettings', () => {
	test('uses stored SMTP settings when present', () => {
		const settings = smtpSettings(credentials({ smtpHost: 'mail.example.com', smtpPort: 587 }))
		expect(settings).toEqual({ host: 'mail.example.com', port: 587 })
	})

	test('derives smtp. host from imap. host when unset', () => {
		const settings = smtpSettings(credentials({}))
		expect(settings).toEqual({ host: 'smtp.example.com', port: 465 })
	})

	test('keeps a non-imap host as-is when unset', () => {
		const settings = smtpSettings(credentials({ imapHost: 'mail.example.com' }))
		expect(settings).toEqual({ host: 'mail.example.com', port: 465 })
	})

	test('defaults port to 465 when only host is stored', () => {
		const settings = smtpSettings(credentials({ smtpHost: 'smtp.example.com', smtpPort: null }))
		expect(settings.port).toBe(465)
	})
})

describe('renderMarkdownEmail', () => {
	test('renders markdown to styled HTML', () => {
		const html = renderMarkdownEmail('# Hello\n\nSome **bold** text.')
		expect(html).toContain('<h1>Hello</h1>')
		expect(html).toContain('<strong>bold</strong>')
		expect(html).toStartWith('<div style=')
	})

	test('escapes raw angle brackets in text', () => {
		const html = renderMarkdownEmail('a \\< b and 1 < 2')
		expect(html).not.toContain('1 < 2')
	})
})

describe('composeMail', () => {
	test('builds a multipart message with reply headers and envelope', async () => {
		const composed = await composeMail({
			from: 'me@example.com',
			to: 'you@example.com, other@example.com',
			cc: '',
			subject: 'Re: Hello',
			markdown: 'A **reply**.',
			inReplyTo: '<original@example.com>',
			references: ['<root@example.com>'],
			attachments: []
		})
		const raw = composed.raw.toString('utf8')
		expect(raw).toContain('In-Reply-To: <original@example.com>')
		expect(raw).toContain('References: <root@example.com> <original@example.com>')
		expect(raw).toContain('Content-Type: multipart/alternative')
		expect(composed.envelope.to).toEqual(['you@example.com', 'other@example.com'])
		expect(composed.messageId).toMatch(/^<.+>$/)
	})
})
