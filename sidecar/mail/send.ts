import { marked } from 'marked'
// Explicit index.js: the main bundle is ESM and nodemailer has no exports map,
// so a bare directory import fails at runtime (ERR_UNSUPPORTED_DIR_IMPORT).
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import nodemailer from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer'
import type MimeNode from 'nodemailer/lib/mime-node'
import type { OutgoingAttachment } from '../../shared/mail'
import type { AccountCredentials } from './store'

export interface ComposeInput {
	from: string
	to: string
	cc: string
	subject: string
	markdown: string
	inReplyTo: string | null
	references: string[]
	attachments: OutgoingAttachment[]
}

export interface ComposedMail {
	raw: Buffer
	envelope: MimeNode.Envelope
	messageId: string
}

/** Markdown source doubles as the text/plain alternative. */
export function renderMarkdownEmail(markdown: string): string {
	const body = marked.parse(markdown, { gfm: true, breaks: true, async: false })
	return (
		"<div style=\"font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; " +
		'font-size: 14px; line-height: 1.6; color: #1a1a1a; max-width: 42em;">' +
		body +
		'</div>'
	)
}

/** SMTP settings, derived from the IMAP host when none were stored. */
export function smtpSettings(credentials: AccountCredentials): { host: string; port: number } {
	if (credentials.smtpHost) {
		return { host: credentials.smtpHost, port: credentials.smtpPort || 465 }
	}
	let host = credentials.imapHost
	if (host.startsWith('imap.')) host = 'smtp.' + host.slice('imap.'.length)
	return { host, port: 465 }
}

/** Build the RFC822 message once; sending and Sent/Drafts APPEND reuse the same bytes. */
export async function composeMail(input: ComposeInput): Promise<ComposedMail> {
	const options: Mail.Options = {
		from: input.from,
		to: input.to,
		subject: input.subject,
		text: input.markdown,
		html: renderMarkdownEmail(input.markdown),
		date: new Date()
	}
	if (input.cc.trim() !== '') options.cc = input.cc
	if (input.inReplyTo) {
		options.inReplyTo = input.inReplyTo
		options.references = [...input.references, input.inReplyTo].join(' ')
	}
	if (input.attachments.length > 0) {
		options.attachments = input.attachments.map((attachment) => ({
			filename: attachment.name,
			path: attachment.path
		}))
	}

	const mail = new MailComposer(options).compile()
	mail.keepBcc = false
	const envelope = mail.getEnvelope()
	const messageId = mail.messageId()
	const raw = await mail.build()
	return { raw, envelope, messageId }
}

/** Password accounts pass accessToken null; OAuth accounts a fresh token. */
export async function sendMail(
	credentials: AccountCredentials,
	input: ComposeInput,
	accessToken: string | null = null
): Promise<ComposedMail> {
	const composed = await composeMail(input)

	const smtp = smtpSettings(credentials)
	const transporter = nodemailer.createTransport({
		host: smtp.host,
		port: smtp.port,
		secure: smtp.port === 465,
		requireTLS: smtp.port !== 465,
		auth: smtpAuth(credentials, accessToken)
	})
	try {
		await transporter.sendMail({ envelope: composed.envelope, raw: composed.raw })
	} finally {
		transporter.close()
	}

	return composed
}

function smtpAuth(
	credentials: AccountCredentials,
	accessToken: string | null
): { user: string; pass: string } | { type: 'OAuth2'; user: string; accessToken: string } {
	if (accessToken !== null) {
		return { type: 'OAuth2', user: credentials.imapUser, accessToken }
	}
	return { user: credentials.imapUser, pass: credentials.imapPassword }
}
