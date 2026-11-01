// Parse-time extraction, cheapest and most exact first: schema.org markup the sender embedded,
// then templates for known senders, then the shipment heuristics. Pure; the parser runs it on
// new mail and a data migration on stored mail, which has no headers beyond the stored ones.

import type { SummaryCard, SummaryLink } from '../../../shared/mail'
import { registrableDomain } from '../authenticity'
import { extractShipment, type ShipmentInfo } from '../shipping'
import { extractGithubCard } from './github'
import { readMarkup, type MarkupShipment } from './markup'

export interface ExtractionSignals {
	fromAddress: string
	subject: string
	rfcMessageId: string
	inReplyTo: string | null
	/** The `X-GitHub-Reason` header; '' when missing or not stored. */
	githubReason: string
	htmlBody: string | null
	/** Plain text of the body, for the shipment heuristics. */
	bodyText: string
}

export type ExtractedShipment =
	(ShipmentInfo & { source: 'heuristic' }) | (MarkupShipment & { source: 'markup' })

export interface MessageExtractions {
	shipment: ExtractedShipment | null
	cards: SummaryCard[]
}

/** One known sender's fixed format; returns null for mail it does not recognize. */
type CardTemplate = (signals: ExtractionSignals) => SummaryCard | null

const CARD_TEMPLATES: CardTemplate[] = [
	(signals) =>
		extractGithubCard({
			fromAddress: signals.fromAddress,
			subject: signals.subject,
			rfcMessageId: signals.rfcMessageId,
			inReplyTo: signals.inReplyTo,
			reason: signals.githubReason
		})
]

export function extractFromMessage(signals: ExtractionSignals): MessageExtractions {
	const markup = readMarkup(signals.htmlBody || '')
	const senderDomain = addressDomain(signals.fromAddress)

	const cards: SummaryCard[] = []
	for (const template of CARD_TEMPLATES) {
		const card = template(signals)
		if (card !== null) cards.push(card)
	}
	for (const card of markup.cards) {
		card.links = senderLinks(card.links, senderDomain)
		cards.push(card)
	}
	attachLooseLinks(cards, senderLinks(markup.links, senderDomain))

	if (markup.shipment !== null && !isSenderUrl(markup.shipment.trackingUrl, senderDomain)) {
		markup.shipment.trackingUrl = null
	}
	return { shipment: messageShipment(signals, markup.shipment), cards }
}

/**
 * Markup links must lead to the sender's own domain. Anyone can embed markup, and a button
 * drawn by the app looks more trustworthy than a link in the body; Gmail only honours markup
 * from registered senders instead.
 */
function senderLinks(links: SummaryLink[], senderDomain: string | null): SummaryLink[] {
	const kept: SummaryLink[] = []
	for (const link of links) {
		const duplicate = kept.some((existing) => existing.url === link.url)
		if (!duplicate && isSenderUrl(link.url, senderDomain)) kept.push(link)
	}
	return kept
}

function isSenderUrl(url: string | null, senderDomain: string | null): boolean {
	if (url === null || senderDomain === null) return false
	try {
		return registrableDomain(new URL(url).hostname) === senderDomain
	} catch {
		return false
	}
}

function addressDomain(address: string): string | null {
	const at = address.lastIndexOf('@')
	if (at === -1 || at === address.length - 1) return null
	return registrableDomain(address.slice(at + 1))
}

function messageShipment(
	signals: ExtractionSignals,
	markupShipment: MarkupShipment | null
): ExtractedShipment | null {
	if (markupShipment !== null) return { ...markupShipment, source: 'markup' }
	const heuristic = extractShipment({
		fromAddress: signals.fromAddress,
		subject: signals.subject,
		bodyText: signals.bodyText.slice(0, 4000)
	})
	if (heuristic === null) return null
	return { ...heuristic, source: 'heuristic' }
}

/**
 * A message-level View action joins the first card's links, unless that card already links
 * there; without any card it becomes an `action` card that is only its buttons.
 */
function attachLooseLinks(cards: SummaryCard[], links: SummaryLink[]): void {
	if (links.length === 0) return
	if (cards.length === 0) {
		cards.push(actionCard(links))
		return
	}
	const first = cards[0]
	for (const link of links) {
		const known = first.links.some((existing) => existing.url === link.url)
		if (!known) first.links.push(link)
	}
}

function actionCard(links: SummaryLink[]): SummaryCard {
	return {
		kind: 'action',
		title: links[0].label,
		subtitle: null,
		status: null,
		startsAt: null,
		endsAt: null,
		facts: [],
		links,
		github: null,
		source: 'markup'
	}
}
