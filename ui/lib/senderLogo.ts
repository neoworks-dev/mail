// Where a sender's logo comes from: the icon their own website serves, for mail from an
// organization's domain. People on a shared mail provider get no logo; the provider's would
// say nothing about them.

const FREEMAIL_DOMAINS = new Set([
	'aol.com',
	'freenet.de',
	'gmail.com',
	'gmx.at',
	'gmx.ch',
	'gmx.de',
	'gmx.net',
	'googlemail.com',
	'hotmail.com',
	'hotmail.de',
	'icloud.com',
	'live.com',
	'live.de',
	'mac.com',
	'mail.de',
	'mailbox.org',
	'me.com',
	'msn.com',
	'outlook.com',
	'outlook.de',
	'pm.me',
	'posteo.de',
	'proton.me',
	'protonmail.com',
	't-online.de',
	'tutanota.com',
	'web.de',
	'yahoo.com',
	'yahoo.de',
	'ymail.com'
])

/** Second-level labels under which registries hand out domains, as in `example.co.uk`. */
const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu'])

/**
 * The domain whose website stands for the sender: `newsletter@mail.netcup.com` gives
 * `netcup.com`. Null for mail providers and addresses without a domain.
 */
export function logoDomain(address: string): string | null {
	const at = address.lastIndexOf('@')
	if (at === -1) return null
	const host = address
		.slice(at + 1)
		.trim()
		.toLowerCase()
	const labels = host.split('.').filter((label) => label !== '')
	if (labels.length < 2) return null
	let keep = 2
	if (labels.length > 2 && SECOND_LEVEL_LABELS.has(labels[labels.length - 2])) keep = 3
	const domain = labels.slice(-keep).join('.')
	if (FREEMAIL_DOMAINS.has(domain)) return null
	return domain
}

/** Icons to try in turn: the large touch icon many sites have, then the classic favicon. */
export function logoCandidates(domain: string): string[] {
	return [`https://${domain}/apple-touch-icon.png`, `https://${domain}/favicon.ico`]
}
