// Turns the schema.org items a sender embedded into what the reader shows: a ParcelDelivery
// becomes the message's shipment, reservations, events, orders and invoices become summary
// cards, and View/Track actions become links. Only types Gmail documents for senders are read.

import type { SummaryCard, SummaryFact, SummaryLink } from '../../../shared/mail'
import type { ShipmentInfo } from '../shipping'
import {
	firstItem,
	firstString,
	nameOf,
	readSchemaItems,
	stripSchemaPrefix,
	type SchemaItem
} from './schema-org'

export interface MarkupShipment extends ShipmentInfo {
	status?: string
	deliveryDate?: string
}

export interface MarkupResult {
	shipment: MarkupShipment | null
	cards: SummaryCard[]
	/** View and Track actions not tied to a card, such as an EmailMessage's button. */
	links: SummaryLink[]
}

const ORDER_STATUS_LABELS: Record<string, string> = {
	OrderCancelled: 'Cancelled',
	OrderDelivered: 'Delivered',
	OrderInTransit: 'In transit',
	OrderPaymentDue: 'Payment due',
	OrderPickupAvailable: 'Ready for pickup',
	OrderProblem: 'Problem',
	OrderProcessing: 'Processing',
	OrderReturned: 'Returned'
}

const RESERVATION_STATUS_LABELS: Record<string, string> = {
	ReservationCancelled: 'Cancelled',
	ReservationConfirmed: 'Confirmed',
	ReservationHold: 'On hold',
	ReservationPending: 'Pending'
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
	PaymentAutomaticallyApplied: 'Paid automatically',
	PaymentComplete: 'Paid',
	PaymentDeclined: 'Declined',
	PaymentDue: 'Due',
	PaymentPastDue: 'Past due'
}

const LINK_ACTION_LABELS: Record<string, string> = {
	TrackAction: 'Track',
	ViewAction: 'View'
}

/** Departure and arrival properties per trip type, in the order they are tried. */
const ROUTE_PROPERTIES: Array<[string, string]> = [
	['departureAirport', 'arrivalAirport'],
	['departureStation', 'arrivalStation'],
	['departureBusStop', 'arrivalBusStop'],
	['departureBoatTerminal', 'arrivalBoatTerminal']
]

export function readMarkup(html: string): MarkupResult {
	const result: MarkupResult = { shipment: null, cards: [], links: [] }
	for (const item of readSchemaItems(html)) addItem(result, item)
	return result
}

function addItem(result: MarkupResult, item: SchemaItem): void {
	if (item.type === 'ParcelDelivery') {
		if (result.shipment === null) result.shipment = parcelShipment(item)
		return
	}
	if (item.type.endsWith('Reservation')) {
		result.cards.push(reservationCard(item))
		return
	}
	if (item.type === 'Event' || item.type.endsWith('Event')) {
		result.cards.push(eventCard(item))
		return
	}
	if (item.type === 'Order') {
		result.cards.push(orderCard(item))
		return
	}
	if (item.type === 'Invoice') {
		result.cards.push(invoiceCard(item))
		return
	}
	if (item.type === 'EmailMessage') result.links.push(...actionLinks(item))
}

function parcelShipment(item: SchemaItem): MarkupShipment {
	let carrier = nameOf(item, 'carrier')
	if (carrier === null) carrier = nameOf(item, 'provider')
	if (carrier === null) carrier = 'Unknown'

	let trackingUrl = webUrl(firstString(item, 'trackingUrl'))
	if (trackingUrl === null) {
		const trackLink = actionLinks(item).find((link) => link.label === 'Track')
		if (trackLink) trackingUrl = trackLink.url
	}

	const shipment: MarkupShipment = {
		carrier,
		trackingNumber: firstString(item, 'trackingNumber'),
		trackingUrl
	}
	const status = parcelStatus(item)
	if (status !== null) shipment.status = status
	const expected = firstString(item, 'expectedArrivalUntil')
	if (expected !== null) shipment.deliveryDate = expected.slice(0, 10)
	return shipment
}

function parcelStatus(item: SchemaItem): string | null {
	const order = firstItem(item, 'partOfOrder')
	if (order) {
		const orderStatus = statusLabel(firstString(order, 'orderStatus'), ORDER_STATUS_LABELS)
		if (orderStatus !== null) return orderStatus
	}
	const deliveryStatus = firstItem(item, 'deliveryStatus')
	if (deliveryStatus) return firstString(deliveryStatus, 'name')
	return null
}

function reservationCard(item: SchemaItem): SummaryCard {
	const reserved = firstItem(item, 'reservationFor')
	const card = emptyCard('reservation', 'Reservation')
	card.status = statusLabel(firstString(item, 'reservationStatus'), RESERVATION_STATUS_LABELS)
	card.startsAt = firstDate(item, ['startTime', 'checkinTime', 'pickupTime'])
	card.endsAt = firstDate(item, ['endTime', 'checkoutTime', 'dropoffTime'])
	addFact(card.facts, 'Booking', firstString(item, 'reservationNumber'))
	addLink(card.links, 'Manage', firstString(item, 'modifyReservationUrl'))
	addLink(card.links, 'View', firstString(item, 'url'))
	addTicket(card, firstItem(item, 'reservedTicket'))
	card.links.push(...actionLinks(item))
	if (reserved) describeReservedThing(card, reserved)
	return card
}

function describeReservedThing(card: SummaryCard, reserved: SchemaItem): void {
	const route = routeTitle(reserved)
	let title = route
	if (title === null) title = firstString(reserved, 'name')
	if (title !== null) card.title = title

	card.subtitle = operatorLine(reserved)
	if (card.subtitle === null && route === null) card.subtitle = placeLine(reserved)

	const starts = firstDate(reserved, ['departureTime', 'startDate', 'checkinTime'])
	if (card.startsAt === null) card.startsAt = starts
	const ends = firstDate(reserved, ['arrivalTime', 'endDate', 'checkoutTime'])
	if (card.endsAt === null) card.endsAt = ends
}

function routeTitle(trip: SchemaItem): string | null {
	for (const [departureProperty, arrivalProperty] of ROUTE_PROPERTIES) {
		const departure = stopName(firstItem(trip, departureProperty))
		const arrival = stopName(firstItem(trip, arrivalProperty))
		if (departure !== null && arrival !== null) return `${departure} → ${arrival}`
	}
	return null
}

function stopName(stop: SchemaItem | null): string | null {
	if (stop === null) return null
	const code = firstString(stop, 'iataCode')
	if (code !== null) return code
	return firstString(stop, 'name')
}

/** "Flix N66", "Lufthansa LH 400": the company with the vehicle's number. */
function operatorLine(trip: SchemaItem): string | null {
	const companies = ['busCompany', 'airline', 'trainCompany', 'provider']
	const numbers = ['busNumber', 'flightNumber', 'trainNumber']
	const parts: string[] = []
	const company = companies.map((property) => nameOf(trip, property)).find((name) => name !== null)
	if (company) parts.push(company)
	const number = numbers
		.map((property) => firstString(trip, property))
		.find((value) => value !== null)
	if (number) parts.push(number)
	if (parts.length === 0) return null
	return parts.join(' ')
}

function addTicket(card: SummaryCard, ticket: SchemaItem | null): void {
	if (ticket === null) return
	const seat = firstItem(ticket, 'ticketedSeat')
	if (seat) addFact(card.facts, 'Seat', firstString(seat, 'seatNumber'))
	addLink(card.links, 'Ticket', firstString(ticket, 'ticketToken'))
}

function eventCard(item: SchemaItem): SummaryCard {
	const card = emptyCard('event', 'Event')
	const name = firstString(item, 'name')
	if (name !== null) card.title = name
	card.startsAt = firstDate(item, ['startDate'])
	card.endsAt = firstDate(item, ['endDate'])
	card.subtitle = placeLine(item)
	addFact(card.facts, 'Details', firstString(item, 'description'))
	addLink(card.links, 'View', firstString(item, 'url'))
	card.links.push(...actionLinks(item))
	return card
}

/** The event's or venue's place: its name, then its street address. */
function placeLine(item: SchemaItem): string | null {
	let place = firstItem(item, 'location')
	if (place === null) place = item
	const parts: string[] = []
	const name = firstString(place, 'name')
	if (name !== null && place !== item) parts.push(name)
	const address = addressLine(place)
	if (address !== null) parts.push(address)
	if (parts.length === 0) return null
	return parts.join(', ')
}

function addressLine(place: SchemaItem): string | null {
	const address = firstItem(place, 'address')
	if (address === null) return firstString(place, 'address')
	const street = firstString(address, 'streetAddress')
	const locality = [firstString(address, 'postalCode'), firstString(address, 'addressLocality')]
		.filter((part) => part !== null)
		.join(' ')
	const parts = [street, locality].filter((part) => part !== null && part !== '')
	if (parts.length === 0) return null
	return parts.join(', ')
}

function orderCard(item: SchemaItem): SummaryCard {
	const card = emptyCard('order', 'Order')
	const orderNumber = firstString(item, 'orderNumber')
	if (orderNumber !== null) card.title = `Order ${orderNumber}`
	card.subtitle = nameOf(item, 'merchant')
	if (card.subtitle === null) card.subtitle = nameOf(item, 'seller')
	card.status = statusLabel(firstString(item, 'orderStatus'), ORDER_STATUS_LABELS)
	addFact(card.facts, 'Total', money(item))
	addFact(card.facts, 'Items', orderedItemNames(item))
	addLink(card.links, 'View order', firstString(item, 'url'))
	card.links.push(...actionLinks(item))
	return card
}

function orderedItemNames(order: SchemaItem): string | null {
	const names: string[] = []
	for (const offer of order.properties.acceptedOffer || []) {
		if (typeof offer === 'string') continue
		const name = nameOf(offer, 'itemOffered')
		if (name !== null) names.push(name)
	}
	if (names.length === 0) return null
	return names.join(', ')
}

function invoiceCard(item: SchemaItem): SummaryCard {
	const card = emptyCard('invoice', 'Invoice')
	const provider = nameOf(item, 'provider')
	if (provider !== null) card.title = provider
	card.subtitle = firstString(item, 'description')
	card.status = statusLabel(firstString(item, 'paymentStatus'), PAYMENT_STATUS_LABELS)
	const due = firstItem(item, 'totalPaymentDue')
	if (due) addFact(card.facts, 'Amount', money(due))
	addFact(card.facts, 'Due', dateOnly(firstString(item, 'paymentDueDate')))
	addFact(card.facts, 'Account', firstString(item, 'accountId'))
	addLink(card.links, 'View invoice', firstString(item, 'url'))
	card.links.push(...actionLinks(item))
	return card
}

/** `price` with `priceCurrency`, on the item itself or its `priceSpecification`. */
function money(item: SchemaItem): string | null {
	let source = item
	if (firstString(item, 'price') === null) {
		const specification = firstItem(item, 'priceSpecification')
		if (specification) source = specification
	}
	const price = firstString(source, 'price')
	if (price === null) return null
	const currency = firstString(source, 'priceCurrency')
	if (currency === null) return price
	return `${price} ${currency}`
}

function actionLinks(item: SchemaItem): SummaryLink[] {
	const actions = [...(item.properties.potentialAction || []), ...(item.properties.action || [])]
	const links: SummaryLink[] = []
	for (const action of actions) {
		if (typeof action === 'string') continue
		const link = actionLink(action)
		if (link !== null) links.push(link)
	}
	return links
}

/** View and Track actions only: Confirm and Save actions POST to a handler, not a page. */
function actionLink(action: SchemaItem): SummaryLink | null {
	const defaultLabel = LINK_ACTION_LABELS[action.type]
	if (defaultLabel === undefined) return null
	let url = webUrl(firstString(action, 'url'))
	if (url === null) url = webUrl(firstString(action, 'target'))
	if (url === null) return null
	let label = firstString(action, 'name')
	if (label === null) label = defaultLabel
	return { label, url }
}

function emptyCard(kind: SummaryCard['kind'], title: string): SummaryCard {
	return {
		kind,
		title,
		subtitle: null,
		status: null,
		startsAt: null,
		endsAt: null,
		facts: [],
		links: [],
		github: null,
		source: 'markup'
	}
}

function addFact(facts: SummaryFact[], label: string, value: string | null): void {
	if (value === null || value === '') return
	facts.push({ label, value })
}

function addLink(links: SummaryLink[], label: string, url: string | null): void {
	const checked = webUrl(url)
	if (checked === null) return
	links.push({ label, url: checked })
}

function webUrl(value: string | null): string | null {
	if (value === null) return null
	if (!/^https?:\/\//i.test(value)) return null
	return value
}

function statusLabel(value: string | null, labels: Record<string, string>): string | null {
	if (value === null) return null
	const key = stripSchemaPrefix(value)
	const label = labels[key]
	if (label !== undefined) return label
	return key
}

function firstDate(item: SchemaItem, properties: string[]): string | null {
	for (const property of properties) {
		const date = normalizeDate(firstString(item, property))
		if (date !== null) return date
	}
	return null
}

/** ISO timestamp, or null when unparseable. Some senders write a doubled `ZZ` suffix. */
export function normalizeDate(value: string | null): string | null {
	if (value === null) return null
	const cleaned = value.trim().replace(/Z+$/i, 'Z')
	const time = Date.parse(cleaned)
	if (Number.isNaN(time)) return null
	return new Date(time).toISOString()
}

function dateOnly(value: string | null): string | null {
	if (value === null) return null
	return value.slice(0, 10)
}
