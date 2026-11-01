import type { AuthVerdict, MessageAuthResults } from '../../shared/mail'

const KNOWN_VERDICTS: AuthVerdict[] = [
	'pass',
	'fail',
	'softfail',
	'neutral',
	'none',
	'temperror',
	'permerror',
	'policy'
]

function toVerdict(value: string): AuthVerdict {
	const normalized = value.toLowerCase()
	for (const verdict of KNOWN_VERDICTS) {
		if (verdict === normalized) return verdict
	}
	return 'unknown'
}

function methodVerdicts(headerValue: string, method: string): AuthVerdict[] {
	const unfolded = headerValue.replace(/\r?\n\s+/g, ' ')
	const pattern = new RegExp(`(?:^|[;\\s])${method}\\s*=\\s*([a-zA-Z]+)`, 'gi')
	const verdicts: AuthVerdict[] = []
	for (const match of unfolded.matchAll(pattern)) {
		verdicts.push(toVerdict(match[1]))
	}
	return verdicts
}

/**
 * A message signed with several DKIM keys reports one verdict per signature;
 * receivers accept the message if any signature verifies.
 */
function bestVerdict(verdicts: AuthVerdict[]): AuthVerdict | null {
	if (verdicts.length === 0) return null
	if (verdicts.includes('pass')) return 'pass'
	return verdicts[0]
}

/**
 * Parse RFC 8601 Authentication-Results headers into per-method verdicts.
 * Headers are expected topmost-first (the receiving server's own results);
 * once a method has a verdict from an earlier header, later headers —
 * typically stamped by forwarders — never override it.
 */
export function parseAuthenticationResults(headerValues: string[]): MessageAuthResults | null {
	const results: MessageAuthResults = { spf: null, dkim: null, dmarc: null }
	const methods: Array<keyof MessageAuthResults> = ['spf', 'dkim', 'dmarc']
	for (const headerValue of headerValues) {
		for (const method of methods) {
			if (results[method] !== null) continue
			results[method] = bestVerdict(methodVerdicts(headerValue, method))
		}
	}
	if (results.spf === null && results.dkim === null && results.dmarc === null) return null
	return results
}

// Common second-level public suffixes; enough for a display heuristic,
// not a full public-suffix list.
const SECOND_LEVEL_TLDS = new Set([
	'co.uk',
	'org.uk',
	'ac.uk',
	'gov.uk',
	'com.au',
	'net.au',
	'org.au',
	'co.nz',
	'co.jp',
	'co.kr',
	'com.br',
	'com.mx',
	'co.in',
	'com.cn'
])

export function registrableDomain(host: string): string {
	const labels = host
		.toLowerCase()
		.split('.')
		.filter((label) => label !== '')
	if (labels.length < 2) return labels.join('.')
	const lastTwo = labels.slice(-2).join('.')
	if (SECOND_LEVEL_TLDS.has(lastTwo) && labels.length >= 3) {
		return labels.slice(-3).join('.')
	}
	return lastTwo
}

const ADDRESS_IN_NAME = /[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i

/**
 * Flags the classic spoof where the display name shows a trustworthy address
 * ("service@paypal.com") while the actual sender domain differs.
 */
export function detectNameSpoof(
	fromName: string,
	fromAddress: string
): { claimedDomain: string; actualDomain: string } | null {
	const claimed = fromName.match(ADDRESS_IN_NAME)
	if (!claimed) return null
	const atIndex = fromAddress.lastIndexOf('@')
	if (atIndex === -1) return null
	const claimedDomain = registrableDomain(claimed[1])
	const actualDomain = registrableDomain(fromAddress.slice(atIndex + 1))
	if (claimedDomain === '' || actualDomain === '') return null
	if (claimedDomain === actualDomain) return null
	return { claimedDomain, actualDomain }
}
