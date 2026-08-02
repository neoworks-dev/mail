// Tracker hygiene for HTML email bodies, applied before the sandboxed frame
// renders them. Regex-based on purpose: the frame is script-free anyway, so a
// missed pixel only costs privacy already covered by the remote-image opt-in.

export interface TrackerStripResult {
	html: string
	pixelsRemoved: number
	linksUnwrapped: number
}

const TRACKER_SRC_PATTERNS = [
	/list-manage\.com\/track\/open/i,
	/sendgrid\.net\/wf\/open/i,
	/mandrillapp\.com\/track\/open/i,
	/open\.substack\.com/i,
	/mailtrack\.io\/trace/i,
	/awstrack\.me\//i,
	/mixmax\.com\/api\/track/i,
	/google-analytics\.com\/collect/i,
	/\/track\/open/i,
	/\bopen\.php\b/i
]

function decodeAttributeValue(value: string): string {
	return value
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;/g, "'")
}

function encodeAttributeValue(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function attributeValue(tag: string, name: string): string | null {
	const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
	if (!match) return null
	if (match[2] !== undefined) return match[2]
	if (match[3] !== undefined) return match[3]
	return match[4]
}

function pixelDimension(tag: string, name: 'width' | 'height'): number | null {
	const attributeMatch = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']?(\\d+)`, 'i'))
	if (attributeMatch) return Number(attributeMatch[1])
	// (?:^|[^-\w]) keeps max-width / line-height from matching.
	const styleMatch = tag.match(new RegExp(`(?:^|[^-\\w])${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'i'))
	if (styleMatch) return Number(styleMatch[1])
	return null
}

function isTrackingPixel(tag: string): boolean {
	const source = attributeValue(tag, 'src')
	if (source === null) return false
	const decodedSource = decodeAttributeValue(source.trim())
	// Only remote images can report back; cid:/data: spacers stay untouched.
	if (!/^https?:/i.test(decodedSource)) return false
	if (TRACKER_SRC_PATTERNS.some((pattern) => pattern.test(decodedSource))) return true
	const width = pixelDimension(tag, 'width')
	const height = pixelDimension(tag, 'height')
	if (width === null || height === null) return false
	return width <= 2 && height <= 2
}

function firstHttpParam(url: URL, names: string[]): string | null {
	for (const name of names) {
		let value = url.searchParams.get(name)
		if (value === null) continue
		// Some wrappers double-encode the destination.
		if (/^https?%3a/i.test(value)) value = decodeURIComponent(value)
		if (/^https?:\/\//i.test(value)) return value
	}
	return null
}

/** Proofpoint v3: https://urldefense.com/v3/__<destination>__;<map>!!... */
function unwrapUrlDefense(url: URL): string | null {
	const match = url.pathname.match(/^\/v3\/__(.+?)__;/)
	if (!match) return null
	if (!/^https?:\/\//i.test(match[1])) return null
	return match[1]
}

const GENERIC_REDIRECT_PARAMS = ['url', 'u', 'q', 'redirect', 'target', 'dest', 'destination', 'link']

/**
 * Returns the real destination when the URL is a recognizable click-tracking
 * wrapper, null otherwise. Opaque wrappers (destination stored server-side,
 * e.g. list-manage.com/track/click) cannot be unwrapped.
 */
export function unwrapTrackingLink(link: string): string | null {
	let url: URL
	try {
		url = new URL(link)
	} catch {
		return null
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
	const host = url.hostname.toLowerCase()
	if (host.endsWith('.safelinks.protection.outlook.com')) return firstHttpParam(url, ['url'])
	if ((host === 'google.com' || host === 'www.google.com') && url.pathname === '/url') {
		return firstHttpParam(url, ['q', 'url'])
	}
	if (host === 'l.facebook.com' || host === 'lm.facebook.com') return firstHttpParam(url, ['u'])
	if (host === 'urldefense.com' || host === 'urldefense.proofpoint.com') return unwrapUrlDefense(url)
	if (/track|click|redirect/i.test(url.pathname)) return firstHttpParam(url, GENERIC_REDIRECT_PARAMS)
	return null
}

function unwrapRepeatedly(link: string): string | null {
	let current: string | null = null
	let next = unwrapTrackingLink(link)
	for (let depth = 0; next !== null && depth < 3; depth += 1) {
		current = next
		next = unwrapTrackingLink(current)
	}
	return current
}

export function stripTrackers(html: string): TrackerStripResult {
	let pixelsRemoved = 0
	let result = html.replace(/<img\b[^>]*>/gi, (tag) => {
		if (!isTrackingPixel(tag)) return tag
		pixelsRemoved += 1
		return ''
	})

	let linksUnwrapped = 0
	result = result.replace(
		/(<a\b[^>]*?\bhref\s*=\s*)("([^"]*)"|'([^']*)')/gi,
		(match, prefix: string, _quoted: string, doubleQuoted?: string, singleQuoted?: string) => {
			const rawValue = doubleQuoted !== undefined ? doubleQuoted : (singleQuoted as string)
			const destination = unwrapRepeatedly(decodeAttributeValue(rawValue))
			if (destination === null) return match
			linksUnwrapped += 1
			return `${prefix}"${encodeAttributeValue(destination)}"`
		}
	)

	return { html: result, pixelsRemoved, linksUnwrapped }
}
