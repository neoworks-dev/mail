// Samples HTML mail from the local store into corpus/: one recent message per sender domain,
// with Outlook-generated, flexbox and short personal mail guaranteed a share. The store is
// opened read-only. `cid:` parts become data URLs and remote images a gray placeholder, so
// both renderers see the same document and nothing is fetched.

import { Database } from 'bun:sqlite'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SAMPLE_SIZE = 50
const OUTLOOK_SHARE = 15
const FLEXBOX_SHARE = 5
const SHORT_SHARE = 8
const SHORT_BODY_LENGTH = 3000

// A 1×1 #cccccc GIF; an <img> with width and height attributes stretches it to its box.
const PLACEHOLDER_IMAGE = `data:image/gif;base64,${Buffer.from([
	0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xcc, 0xcc,
	0xcc, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02,
	0x02, 0x44, 0x01, 0x00, 0x3b
]).toString('base64')}`

interface Candidate {
	messageId: number
	fromAddress: string
	subject: string
	date: string
	htmlBody: string
}

interface CorpusEntry {
	messageId: number
	file: string
	from: string
	subject: string
	date: string
	traits: string[]
}

const databasePath = join(homedir(), '.config', 'neoworks-mail', 'mail.db')
const corpusDirectory = join(import.meta.dir, 'corpus')

function senderDomain(address: string): string {
	const at = address.lastIndexOf('@')
	return address.slice(at + 1).toLowerCase()
}

function isOutlookMail(html: string): boolean {
	return html.includes('[if mso') || html.includes('urn:schemas-microsoft-com')
}

function usesFlexbox(html: string): boolean {
	return /display\s*:\s*(inline-)?flex/i.test(html)
}

function traitsOf(html: string): string[] {
	const traits: string[] = []
	if (isOutlookMail(html)) traits.push('outlook')
	if (usesFlexbox(html)) traits.push('flexbox')
	if (/@media/i.test(html)) traits.push('media-queries')
	if (html.length < SHORT_BODY_LENGTH) traits.push('short')
	return traits
}

function loadCandidates(database: Database): Candidate[] {
	const rows = database
		.query(
			`SELECT m.message_id AS messageId, m.from_address AS fromAddress, m.subject, m.date,
			        b.html_body AS htmlBody
			   FROM messages m JOIN message_bodies b ON b.message_id = m.message_id
			  WHERE b.html_body IS NOT NULL AND length(b.html_body) > 0
			  ORDER BY m.date DESC`
		)
		.all() as Candidate[]
	return latestPerDomain(rows)
}

function latestPerDomain(rows: Candidate[]): Candidate[] {
	const seenDomains = new Set<string>()
	const latest: Candidate[] = []
	for (const row of rows) {
		const domain = senderDomain(row.fromAddress)
		if (seenDomains.has(domain)) continue
		seenDomains.add(domain)
		latest.push(row)
	}
	return latest
}

function pickSample(candidates: Candidate[]): Candidate[] {
	const picked = new Map<number, Candidate>()
	const take = (pool: Candidate[], count: number) => {
		for (const candidate of pool) {
			if (count <= 0) return
			if (picked.has(candidate.messageId)) continue
			picked.set(candidate.messageId, candidate)
			count -= 1
		}
	}
	take(
		candidates.filter((candidate) => isOutlookMail(candidate.htmlBody)),
		OUTLOOK_SHARE
	)
	take(
		candidates.filter((candidate) => usesFlexbox(candidate.htmlBody)),
		FLEXBOX_SHARE
	)
	take(
		candidates.filter((candidate) => candidate.htmlBody.length < SHORT_BODY_LENGTH),
		SHORT_SHARE
	)
	take(candidates, SAMPLE_SIZE - picked.size)
	return [...picked.values()]
}

function inlineImages(database: Database, messageId: number, html: string): string {
	const parts = database
		.query(
			`SELECT content_id AS contentId, content_type AS contentType, content
			   FROM attachments WHERE message_id = ? AND content_id IS NOT NULL`
		)
		.all(messageId) as { contentId: string; contentType: string; content: Uint8Array }[]
	const dataUrls = new Map<string, string>()
	for (const part of parts) {
		const contentId = part.contentId.replace(/^<|>$/g, '')
		const encoded = Buffer.from(part.content).toString('base64')
		dataUrls.set(contentId.toLowerCase(), `data:${part.contentType};base64,${encoded}`)
	}
	return html.replace(/cid:([^"'\s)>]+)/gi, (_match, contentId: string) => {
		const dataUrl = dataUrls.get(contentId.toLowerCase())
		if (dataUrl === undefined) return PLACEHOLDER_IMAGE
		return dataUrl
	})
}

function blockRemoteImages(html: string): string {
	const withoutImageSources = html.replace(
		/(<img\b[^>]*?\bsrc\s*=\s*)(["']?)(https?:)?\/\/[^"'\s>]+\2/gi,
		(_match, prefix: string) => `${prefix}"${PLACEHOLDER_IMAGE}"`
	)
	return withoutImageSources.replace(/\bbackground\s*=\s*(["'])https?:\/\/[^"']*\1/gi, '')
}

function exportCorpus(): void {
	const database = new Database(databasePath, { readonly: true })
	const sample = pickSample(loadCandidates(database))
	rmSync(corpusDirectory, { recursive: true, force: true })
	mkdirSync(corpusDirectory, { recursive: true })

	const entries: CorpusEntry[] = []
	for (const message of sample) {
		const file = `${message.messageId}.html`
		const html = blockRemoteImages(inlineImages(database, message.messageId, message.htmlBody))
		writeFileSync(join(corpusDirectory, file), html)
		entries.push({
			messageId: message.messageId,
			file,
			from: message.fromAddress,
			subject: message.subject,
			date: message.date,
			traits: traitsOf(message.htmlBody)
		})
	}
	writeFileSync(join(corpusDirectory, 'index.json'), JSON.stringify(entries, null, '\t'))
	console.log(`Exported ${entries.length} mails to ${corpusDirectory}`)
}

exportCorpus()
