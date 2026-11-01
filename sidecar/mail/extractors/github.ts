// Template for GitHub notification mail. GitHub encodes what a notification is about in the
// Message-ID (`<owner/repo/pull/123/review/456@github.com>`), replies point at the thread's
// root through In-Reply-To, and `X-GitHub-Reason` says why the user got it. The subject gives
// the title: `[owner/repo] Title (PR #123)`.

import type { GithubReference, SummaryCard } from '../../../shared/mail'

export interface GithubSignals {
	fromAddress: string
	subject: string
	rfcMessageId: string
	inReplyTo: string | null
	/** The `X-GitHub-Reason` header; '' when missing or not stored. */
	reason: string
}

const NOTIFICATION_SENDER = /^notifications@github\.com$/i

const MESSAGE_ID_PATTERN =
	/^<?([\w.-]+\/[\w.-]+)\/(pull|issues|discussions|actions\/runs|releases|commit)\/(\w+)/

const ITEM_TYPES: Record<string, GithubReference['itemType']> = {
	pull: 'pull',
	issues: 'issue',
	discussions: 'discussion',
	'actions/runs': 'run',
	releases: 'release',
	commit: 'commit'
}

/** Types whose Message-ID segment is the number in the item's web URL; releases use an id. */
const NUMBERED_TYPES = new Set<GithubReference['itemType']>(['pull', 'issue', 'discussion', 'run'])

const REASON_LABELS: Record<string, string> = {
	approval_requested: 'Approval requested',
	assign: 'Assigned to you',
	author: 'You opened this',
	ci_activity: 'CI activity',
	comment: 'You commented',
	invitation: 'Invitation',
	manual: 'Subscribed',
	mention: 'You were mentioned',
	push: 'New commits',
	review_requested: 'Review requested',
	security_alert: 'Security alert',
	state_change: 'State changed',
	subscribed: 'Watching',
	team_mention: 'Team mentioned',
	your_activity: 'Your activity'
}

const TYPE_TITLES: Record<GithubReference['itemType'], string> = {
	pull: 'Pull request',
	issue: 'Issue',
	discussion: 'Discussion',
	run: 'Workflow run',
	release: 'Release',
	commit: 'Commit'
}

export function extractGithubCard(signals: GithubSignals): SummaryCard | null {
	if (!NOTIFICATION_SENDER.test(signals.fromAddress)) return null
	const reference = githubReference(signals)
	if (reference === null) return null

	return {
		kind: 'github',
		title: subjectTitle(signals.subject, reference.repository),
		subtitle: referenceLine(reference),
		status: reasonLabel(reference.reason),
		startsAt: null,
		endsAt: null,
		facts: [],
		links: [{ label: 'Open on GitHub', url: referenceUrl(reference) }],
		github: reference,
		source: 'template'
	}
}

function githubReference(signals: GithubSignals): GithubReference | null {
	let match = signals.rfcMessageId.match(MESSAGE_ID_PATTERN)
	if (match === null && signals.inReplyTo !== null) {
		match = signals.inReplyTo.match(MESSAGE_ID_PATTERN)
	}
	if (match === null) return null

	const itemType = ITEM_TYPES[match[2]]
	let number: number | null = null
	if (NUMBERED_TYPES.has(itemType) && /^\d+$/.test(match[3])) number = Number(match[3])
	let reason: string | null = null
	if (signals.reason.trim() !== '') reason = signals.reason.trim().toLowerCase()
	return { repository: match[1], itemType, number, reason }
}

/** `Re: [owner/repo] Fix the parser (PR #12)` → `Fix the parser`. */
export function subjectTitle(subject: string, repository: string): string {
	let title = subject.replace(/^(?:re|fwd?):\s*/i, '')
	const prefix = `[${repository}]`
	if (title.toLowerCase().startsWith(prefix.toLowerCase())) title = title.slice(prefix.length)
	title = title.replace(/\s*\((?:PR |Issue |Discussion )?#\d+\)\s*$/i, '')
	return title.trim()
}

function referenceLine(reference: GithubReference): string {
	let line = `${reference.repository} · ${TYPE_TITLES[reference.itemType]}`
	if (reference.number !== null && reference.itemType !== 'run') line += ` #${reference.number}`
	return line
}

function reasonLabel(reason: string | null): string | null {
	if (reason === null) return null
	const label = REASON_LABELS[reason]
	if (label !== undefined) return label
	return reason.replace(/_/g, ' ')
}

function referenceUrl(reference: GithubReference): string {
	const base = `https://github.com/${reference.repository}`
	if (reference.number === null) return base
	const paths: Record<GithubReference['itemType'], string> = {
		pull: 'pull',
		issue: 'issues',
		discussion: 'discussions',
		run: 'actions/runs',
		release: 'releases',
		commit: 'commit'
	}
	return `${base}/${paths[reference.itemType]}/${reference.number}`
}
