import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from 'mailparser'
import type { MessageAddress } from '../../shared/mail'
import { parseAuthenticationResults } from './authenticity'
import { classifyHeuristic, type LabelSignals } from './labeling'
import { extractShipment } from './shipping'
import type { ParsedAttachmentInput, ParsedMessageInput } from './store'

const SNIPPET_LENGTH = 160

function flattenAddresses(value: AddressObject | AddressObject[] | undefined): MessageAddress[] {
	if (!value) return []
	const objects = Array.isArray(value) ? value : [value]
	const result: MessageAddress[] = []
	for (const object of objects) {
		for (const entry of object.value) {
			result.push({ name: entry.name || '', address: entry.address || '' })
		}
	}
	return result
}

function htmlToText(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/\s+/g, ' ')
		.trim()
}

function toAttachmentInput(attachment: Attachment): ParsedAttachmentInput {
	let contentId: string | null = null
	if (attachment.contentId) {
		contentId = attachment.contentId.replace(/^</, '').replace(/>$/, '')
	}
	const isInline = attachment.contentDisposition === 'inline' || attachment.related === true
	return {
		filename: attachment.filename || '',
		contentType: attachment.contentType || 'application/octet-stream',
		size: attachment.size || attachment.content.length,
		contentId,
		isInline,
		content: attachment.content
	}
}

function referencesList(parsed: ParsedMail): string[] {
	const value = parsed.references
	if (!value) return []
	if (Array.isArray(value)) return value
	return [value]
}

function headerText(parsed: ParsedMail, name: string): string {
	const value = parsed.headers.get(name)
	if (value === undefined) return ''
	if (typeof value === 'string') return value
	// Structured header objects stringify well enough for presence/keyword checks.
	return JSON.stringify(value)
}

function authenticationResultsValues(parsed: ParsedMail): string[] {
	const values: string[] = []
	for (const header of parsed.headerLines) {
		if (header.key !== 'authentication-results') continue
		const colonIndex = header.line.indexOf(':')
		if (colonIndex === -1) continue
		values.push(header.line.slice(colonIndex + 1).trim())
	}
	return values
}

function labelSignals(parsed: ParsedMail, fromAddress: string, subject: string): LabelSignals {
	const precedence = headerText(parsed, 'precedence').toLowerCase()
	const autoSubmitted = headerText(parsed, 'auto-submitted').toLowerCase()
	const spamFlag = headerText(parsed, 'x-spam-flag').toLowerCase()
	const spamStatus = headerText(parsed, 'x-spam-status').toLowerCase()
	return {
		fromAddress,
		subject,
		hasListHeaders:
			parsed.headers.has('list-unsubscribe') ||
			parsed.headers.has('list-id') ||
			parsed.headers.has('list'),
		bulkPrecedence: precedence.includes('bulk') || precedence.includes('list'),
		autoSubmitted: autoSubmitted !== '' && !autoSubmitted.startsWith('no'),
		spamFlagged: spamFlag.includes('yes') || spamStatus.startsWith('yes')
	}
}

export async function parseRawMessage(
	raw: Buffer,
	accountId: number,
	folderId: number,
	uid: number,
	flags: Set<string>,
	size: number
): Promise<ParsedMessageInput> {
	const parsed = await simpleParser(raw)

	const from = flattenAddresses(parsed.from)
	const textBody = parsed.text || null
	const htmlBody = typeof parsed.html === 'string' ? parsed.html : null

	let searchBody = ''
	if (textBody) searchBody = textBody
	else if (htmlBody) searchBody = htmlToText(htmlBody)

	const snippetSource = searchBody.replace(/\s+/g, ' ').trim()

	const fromAddress = from.length > 0 ? from[0].address : ''
	const subject = parsed.subject || ''
	const label = classifyHeuristic(labelSignals(parsed, fromAddress, subject))

	const shipment = extractShipment({
		fromAddress,
		subject,
		bodyText: searchBody.slice(0, 4000)
	})

	const listUnsubscribeRaw = headerText(parsed, 'list-unsubscribe')
	const listUnsubscribe = listUnsubscribeRaw === '' ? null : listUnsubscribeRaw
	const listUnsubscribeOneClick = headerText(parsed, 'list-unsubscribe-post')
		.toLowerCase()
		.includes('one-click')

	return {
		accountId,
		folderId,
		uid,
		rfcMessageId: parsed.messageId || '',
		inReplyTo: parsed.inReplyTo || null,
		references: referencesList(parsed),
		subject,
		fromName: from.length > 0 ? from[0].name : '',
		fromAddress,
		toAddresses: flattenAddresses(parsed.to),
		ccAddresses: flattenAddresses(parsed.cc),
		date: (parsed.date || new Date()).toISOString(),
		snippet: snippetSource.slice(0, SNIPPET_LENGTH),
		seen: flags.has('\\Seen'),
		flagged: flags.has('\\Flagged'),
		answered: flags.has('\\Answered'),
		hasAttachments: parsed.attachments.some((attachment) => attachment.contentDisposition !== 'inline'),
		size,
		textBody,
		htmlBody,
		searchBody,
		attachments: parsed.attachments.map(toAttachmentInput),
		label,
		labelSource: label === null ? null : 'heuristic',
		listUnsubscribe,
		listUnsubscribeOneClick,
		shipment,
		authResults: parseAuthenticationResults(authenticationResultsValues(parsed))
	}
}
