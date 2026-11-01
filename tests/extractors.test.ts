import { describe, expect, test } from 'bun:test'
import { extractFromMessage, type ExtractionSignals } from '../sidecar/mail/extractors'
import { extractGithubCard, subjectTitle } from '../sidecar/mail/extractors/github'
import { normalizeDate } from '../sidecar/mail/extractors/markup'
import { readSchemaItems } from '../sidecar/mail/extractors/schema-org'

function signals(overrides: Partial<ExtractionSignals>): ExtractionSignals {
	return {
		fromAddress: 'noreply@shop.example',
		subject: '',
		rfcMessageId: '',
		inReplyTo: null,
		githubReason: '',
		htmlBody: null,
		bodyText: '',
		...overrides
	}
}

const BUS_RESERVATION_HTML = `<html><head><script type="application/ld+json">[{
	"@context": "http://schema.org",
	"@type": "BusReservation",
	"reservationNumber": "3390136163",
	"reservationStatus": "http://schema.org/ReservationConfirmed",
	"reservationFor": {
		"@type": "BusTrip",
		"busNumber": "N66",
		"busCompany": { "@type": "Organization", "name": "Flix" },
		"departureBusStop": { "@type": "BusStop", "name": "Hamburg ZOB" },
		"departureTime": "2026-09-02T16:30:00+02:00",
		"arrivalBusStop": { "@type": "BusStop", "name": "Halle (Saale)" },
		"arrivalTime": "2026-09-02T22:40:00+02:00"
	},
	"reservedTicket": {
		"@type": "Ticket",
		"ticketToken": "https://shop.global.flixbus.com/pdfqr/3390136163",
		"ticketedSeat": { "@type": "Seat", "seatNumber": "14D" }
	}
}]</script></head><body>Hi</body></html>`

const PARCEL_MICRODATA_HTML = `<div itemscope itemtype="http://schema.org/ParcelDelivery">
	<div itemprop="carrier" itemscope itemtype="http://schema.org/Organization">
		<meta itemprop="name" content="SEUR">
	</div>
	<meta itemprop="trackingNumber" content="66007321_227">
	<link itemprop="trackingUrl" href="https://tradeinn.com/track?order=66007321">
	<div itemprop="partOfOrder" itemscope itemtype="http://schema.org/Order">
		<meta itemprop="orderNumber" content="66007321">
		<link itemprop="orderStatus" href="http://schema.org/OrderDelivered">
	</div>
</div>`

const EVENT_MICRODATA_HTML = `<body itemscope itemtype="http://schema.org/Event">
	<meta itemprop="name" content="Einwohnermeldeamt">
	<meta itemprop="startDate" content="2026-05-06T10:30:00ZZ">
	<p itemprop="location" itemscope itemtype="http://schema.org/Place">
		<span itemprop="name">Standort Bergedorf</span>
		<span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
			<span itemprop="streetAddress">Weidenbaumsweg 21</span>
			<span itemprop="postalCode">21029</span> <span itemprop="addressLocality">Hamburg</span>
		</span>
	</p>
</body>`

function viewActionHtml(url: string): string {
	return `<div itemscope itemtype="//schema.org/EmailMessage">
		<div itemprop="action" itemscope itemtype="//schema.org/ViewAction">
			<link itemprop="url" href="${url}"/>
			<meta itemprop="name" content="Review Activity"/>
		</div>
	</div>`
}

describe('readSchemaItems', () => {
	test('nests microdata items under the property that opened them', () => {
		const [parcel] = readSchemaItems(PARCEL_MICRODATA_HTML)
		expect(parcel.type).toBe('ParcelDelivery')
		const carrier = parcel.properties.carrier[0]
		expect(typeof carrier).not.toBe('string')
		if (typeof carrier === 'string') return
		expect(carrier.properties.name).toEqual(['SEUR'])
	})

	test('skips mail without schema.org and malformed JSON-LD', () => {
		expect(readSchemaItems('<p>Hello</p>')).toEqual([])
		const broken = '<script type="application/ld+json">{ "@context": "http://schema.org", </script>'
		expect(readSchemaItems(broken)).toEqual([])
	})
})

describe('extractFromMessage markup', () => {
	test('JSON-LD bus reservation becomes a route card', () => {
		const result = extractFromMessage(
			signals({ fromAddress: 'noreply@booking.flixbus.com', htmlBody: BUS_RESERVATION_HTML })
		)
		expect(result.cards).toHaveLength(1)
		const card = result.cards[0]
		expect(card.kind).toBe('reservation')
		expect(card.title).toBe('Hamburg ZOB → Halle (Saale)')
		expect(card.subtitle).toBe('Flix N66')
		expect(card.status).toBe('Confirmed')
		expect(card.startsAt).toBe('2026-09-02T14:30:00.000Z')
		expect(card.facts).toContainEqual({ label: 'Seat', value: '14D' })
		expect(card.links).toEqual([
			{ label: 'Ticket', url: 'https://shop.global.flixbus.com/pdfqr/3390136163' }
		])
	})

	test('microdata ParcelDelivery wins over the shipment heuristics', () => {
		const result = extractFromMessage(
			signals({
				fromAddress: 'noreply@delivery.tradeinn.com',
				subject: 'Ihre Bestellung wurde geliefert',
				htmlBody: PARCEL_MICRODATA_HTML
			})
		)
		expect(result.shipment).toEqual({
			carrier: 'SEUR',
			trackingNumber: '66007321_227',
			trackingUrl: 'https://tradeinn.com/track?order=66007321',
			status: 'Delivered',
			source: 'markup'
		})
	})

	test('microdata event reads its place and the doubled Z suffix', () => {
		const result = extractFromMessage(
			signals({ fromAddress: 'noreply@termine.hamburg.de', htmlBody: EVENT_MICRODATA_HTML })
		)
		const card = result.cards[0]
		expect(card.kind).toBe('event')
		expect(card.title).toBe('Einwohnermeldeamt')
		expect(card.startsAt).toBe('2026-05-06T10:30:00.000Z')
		expect(card.subtitle).toBe('Standort Bergedorf, Weidenbaumsweg 21, 21029 Hamburg')
	})

	test('a View action on the sender domain becomes an action card', () => {
		const result = extractFromMessage(
			signals({
				fromAddress: 'no-reply@accounts.google.com',
				htmlBody: viewActionHtml('https://myaccount.google.com/alert')
			})
		)
		expect(result.cards).toHaveLength(1)
		expect(result.cards[0].kind).toBe('action')
		expect(result.cards[0].links).toEqual([
			{ label: 'Review Activity', url: 'https://myaccount.google.com/alert' }
		])
	})

	test('links to another domain than the sender are dropped', () => {
		const result = extractFromMessage(
			signals({
				fromAddress: 'message-service@sender.zohobooks.com',
				htmlBody: viewActionHtml('https://zohosecurepay.com/invoice')
			})
		)
		expect(result.cards).toEqual([])
	})

	test('a markup tracking page off the sender domain is dropped', () => {
		const result = extractFromMessage(
			signals({ fromAddress: 'noreply@phish.example', htmlBody: PARCEL_MICRODATA_HTML })
		)
		expect(result.shipment?.trackingUrl).toBeNull()
		expect(result.shipment?.trackingNumber).toBe('66007321_227')
	})

	test('falls back to the shipment heuristics without markup', () => {
		const result = extractFromMessage(
			signals({
				fromAddress: 'noreply@dhl.de',
				subject: 'Ihre Sendung ist unterwegs',
				bodyText: 'Ihre Sendungsnummer: 00340434161094042557'
			})
		)
		expect(result.shipment?.source).toBe('heuristic')
		expect(result.shipment?.carrier).toBe('DHL')
	})
})

describe('normalizeDate', () => {
	test('rejects unparseable values', () => {
		expect(normalizeDate('next Tuesday')).toBeNull()
		expect(normalizeDate(null)).toBeNull()
	})
})

describe('extractGithubCard', () => {
	test('pull request review mail', () => {
		const card = extractGithubCard({
			fromAddress: 'notifications@github.com',
			subject: 'Re: [neoworks/mail] Parse schema.org markup (PR #42)',
			rfcMessageId: '<neoworks/mail/pull/42/review/987654@github.com>',
			inReplyTo: '<neoworks/mail/pull/42@github.com>',
			reason: 'review_requested'
		})
		expect(card).not.toBeNull()
		expect(card?.title).toBe('Parse schema.org markup')
		expect(card?.subtitle).toBe('neoworks/mail · Pull request #42')
		expect(card?.status).toBe('Review requested')
		expect(card?.github).toEqual({
			repository: 'neoworks/mail',
			itemType: 'pull',
			number: 42,
			reason: 'review_requested'
		})
		expect(card?.links[0].url).toBe('https://github.com/neoworks/mail/pull/42')
	})

	test('issue comment falls back to In-Reply-To and works without a reason', () => {
		const card = extractGithubCard({
			fromAddress: 'notifications@github.com',
			subject: 'Re: [owner/repo] Crash on start (Issue #7)',
			rfcMessageId: '<unrelated@github.com>',
			inReplyTo: '<owner/repo/issues/7@github.com>',
			reason: ''
		})
		expect(card?.github?.itemType).toBe('issue')
		expect(card?.status).toBeNull()
		expect(card?.links[0].url).toBe('https://github.com/owner/repo/issues/7')
	})

	test('ignores other GitHub senders', () => {
		const card = extractGithubCard({
			fromAddress: 'noreply@github.com',
			subject: '[GitHub] A new SSH key was added',
			rfcMessageId: '<owner/repo/pull/1@github.com>',
			inReplyTo: null,
			reason: ''
		})
		expect(card).toBeNull()
	})

	test('subject title strips the repository and number', () => {
		expect(subjectTitle('[a/b] Run failed: CI - main (abc1234)', 'a/b')).toBe(
			'Run failed: CI - main (abc1234)'
		)
		expect(subjectTitle('Fwd: [a/b] Title (#3)', 'a/b')).toBe('Title')
	})
})
