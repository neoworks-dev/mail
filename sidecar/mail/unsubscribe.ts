// List-Unsubscribe parsing (RFC 2369 / RFC 8058). The header carries one or
// more <uri> entries — typically an https endpoint, a mailto address, or both.

export interface UnsubscribeTarget {
	/** https endpoint; with oneClick it accepts the RFC 8058 POST. */
	url: string | null
	/** mailto address (query parameters preserved). */
	mailto: string | null
}

export function parseListUnsubscribe(header: string): UnsubscribeTarget {
	const target: UnsubscribeTarget = { url: null, mailto: null }
	const entries = header.match(/<([^>]+)>/g) || []
	for (const entry of entries) {
		const uri = entry.slice(1, -1).trim()
		if (target.url === null && /^https?:\/\//i.test(uri)) {
			target.url = uri
			continue
		}
		if (target.mailto === null && /^mailto:/i.test(uri)) {
			target.mailto = uri
		}
	}
	return target
}

export interface MailtoRequest {
	to: string
	subject: string
	body: string
}

export function parseMailto(uri: string): MailtoRequest | null {
	const withoutScheme = uri.replace(/^mailto:/i, '')
	const [addressPart, queryPart] = withoutScheme.split('?', 2)
	const to = decodeURIComponent(addressPart).trim()
	if (to === '') return null

	let subject = 'unsubscribe'
	let body = 'unsubscribe'
	if (queryPart) {
		const parameters = new URLSearchParams(queryPart)
		const subjectParameter = parameters.get('subject')
		const bodyParameter = parameters.get('body')
		if (subjectParameter) subject = subjectParameter
		if (bodyParameter) body = bodyParameter
	}
	return { to, subject, body }
}
