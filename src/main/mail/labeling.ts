// Heuristic message categorization from structural signals — headers carry
// most of what "newsletter vs ad vs spam" needs, no ML required. The
// embedding-based classifier only handles what these rules leave unlabeled.

import { ALL_MAIL_LABELS, type MailLabel } from '../../shared/mail'

export type { MailLabel }

export interface LabelSignals {
	fromAddress: string
	subject: string
	/** List-Unsubscribe or List-Id header present. */
	hasListHeaders: boolean
	/** Precedence: bulk/list or X-Auto-Response-Suppress style bulk marker. */
	bulkPrecedence: boolean
	/** Auto-Submitted header with a value other than "no". */
	autoSubmitted: boolean
	/** X-Spam-Flag: YES, or a spam score header past the server threshold. */
	spamFlagged: boolean
}

const SOCIAL_DOMAINS = [
	'facebook.com',
	'facebookmail.com',
	'instagram.com',
	'twitter.com',
	'x.com',
	'linkedin.com',
	'pinterest.com',
	'tiktok.com',
	'reddit.com',
	'redditmail.com',
	'github.com',
	'gitlab.com',
	'discord.com',
	'youtube.com',
	'strava.com',
	'mastodon.social'
]

const AD_SENDER_HINTS = ['marketing', 'offers', 'angebote', 'promo', 'deals', 'sale', 'werbung']

const AD_SUBJECT_PATTERN = new RegExp(
	[
		'%\\s?(off|rabatt)',
		'\\bsale\\b',
		'\\bdeal(s)?\\b',
		'\\bgutschein\\b',
		'\\brabatt\\b',
		'\\bcoupon\\b',
		'\\bblack friday\\b',
		'\\bangebot(e)?\\b',
		'\\bnur (heute|jetzt)\\b',
		'\\blimited (time|offer)\\b',
		'\\bjetzt (sparen|zugreifen|sichern)\\b',
		'\\bfree shipping\\b',
		'\\bkostenloser versand\\b'
	].join('|'),
	'i'
)

const NOTIFICATION_LOCAL_PARTS = [
	'noreply',
	'no-reply',
	'no_reply',
	'donotreply',
	'do-not-reply',
	'notification',
	'notifications',
	'alert',
	'alerts',
	'mailer-daemon',
	'system'
]

function senderDomain(address: string): string {
	const atIndex = address.lastIndexOf('@')
	if (atIndex === -1) return ''
	return address.slice(atIndex + 1).toLowerCase()
}

function senderLocalPart(address: string): string {
	const atIndex = address.lastIndexOf('@')
	if (atIndex === -1) return address.toLowerCase()
	return address.slice(0, atIndex).toLowerCase()
}

/**
 * Classify from structural signals, most specific first. Returns null when
 * nothing matches — regular personal mail stays unlabeled.
 */
export function classifyHeuristic(signals: LabelSignals): MailLabel | null {
	if (signals.spamFlagged) return 'spam'

	const domain = senderDomain(signals.fromAddress)
	const socialMatch = SOCIAL_DOMAINS.some(
		(candidate) => domain === candidate || domain.endsWith(`.${candidate}`)
	)
	if (socialMatch) return 'social'

	const localPart = senderLocalPart(signals.fromAddress)
	const adSender = AD_SENDER_HINTS.some((hint) => localPart.includes(hint))
	const adSubject = AD_SUBJECT_PATTERN.test(signals.subject)

	if (signals.hasListHeaders || signals.bulkPrecedence) {
		if (adSender || adSubject) return 'ad'
		return 'newsletter'
	}

	if (adSender && adSubject) return 'ad'

	if (signals.autoSubmitted) return 'notification'
	const notificationSender = NOTIFICATION_LOCAL_PARTS.some((candidate) => {
		if (localPart === candidate) return true
		const separators = ['-', '.', '+', '_']
		return separators.some((separator) => localPart.startsWith(candidate + separator))
	})
	if (notificationSender) return 'notification'

	return null
}

export function isMailLabel(value: string): value is MailLabel {
	return (ALL_MAIL_LABELS as string[]).includes(value)
}
