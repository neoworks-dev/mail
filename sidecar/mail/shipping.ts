// Heuristic shipment extraction: carrier from the sender, tracking number
// from labeled lines or carrier-specific formats. Pure — runs at parse time;
// the AI fallback is user-triggered only and lives in the renderer.

export interface ShipmentInfo {
	carrier: string
	trackingNumber: string | null
	/** Carrier tracking page for the number, when a template is known. */
	trackingUrl: string | null
}

interface CarrierRule {
	name: string
	senderPattern: RegExp
	/** Confident number formats for this carrier (unlabeled matches allowed). */
	numberPatterns: RegExp[]
	urlTemplate: ((trackingNumber: string) => string) | null
}

const CARRIERS: CarrierRule[] = [
	{
		name: 'DHL',
		senderPattern: /dhl\.|deutschepost\./i,
		numberPatterns: [/\bJJ?D[0-9]{16,20}\b/, /\b[0-9]{20}\b/, /\b[0-9]{12}\b/],
		urlTemplate: (n) =>
			`https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${n}`
	},
	{
		name: 'UPS',
		senderPattern: /\bups\.com|@ups\./i,
		numberPatterns: [/\b1Z[0-9A-Z]{16}\b/],
		urlTemplate: (n) => `https://www.ups.com/track?tracknum=${n}`
	},
	{
		name: 'Hermes',
		senderPattern: /myhermes\.|hermesworld\.|hermes(?:germany)?\./i,
		numberPatterns: [/\b[0-9]{14}\b/],
		urlTemplate: (n) => `https://www.myhermes.de/empfangen/sendungsverfolgung/#${n}`
	},
	{
		name: 'DPD',
		senderPattern: /dpd\./i,
		numberPatterns: [/\b[0-9]{14}\b/],
		urlTemplate: (n) => `https://tracking.dpd.de/status/de_DE/parcel/${n}`
	},
	{
		name: 'GLS',
		senderPattern: /gls-group\.|gls-pakete\./i,
		numberPatterns: [/\b[0-9]{11,12}\b/],
		urlTemplate: (n) => `https://gls-group.eu/DE/de/paketverfolgung?match=${n}`
	},
	{
		name: 'FedEx',
		senderPattern: /fedex\./i,
		numberPatterns: [/\b[0-9]{12}\b/, /\b[0-9]{15}\b/],
		urlTemplate: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`
	},
	{
		name: 'Amazon',
		senderPattern: /amazon\./i,
		numberPatterns: [/\bTBA[0-9]{9,15}\b/],
		urlTemplate: null
	}
]

/** "Sendungsnummer: X" / "Tracking number: X" style labeled values. */
const LABELED_NUMBER_PATTERN =
	/(?:sendungs(?:nummer|id)|sendungsverfolgungsnummer|tracking[\s-]?(?:number|nummer|nr|no|code|id)?|paketnummer|shipment\s*(?:number|id))\s*[:#]?\s*([A-Z0-9]{8,30})\b/i

const SHIPMENT_KEYWORDS =
	/versandt|versendet|unterwegs|zugestellt|zustellung|sendung|paket|shipped|shipment|delivery|delivered|out for delivery|on its way|track/i

export interface ShipmentSignals {
	fromAddress: string
	subject: string
	bodyText: string
}

export function extractShipment(signals: ShipmentSignals): ShipmentInfo | null {
	const carrier = CARRIERS.find((rule) => rule.senderPattern.test(signals.fromAddress))
	const text = `${signals.subject}\n${signals.bodyText}`

	// Amazon and shops ship via carriers: without a carrier sender, only a
	// labeled number in clearly shipment-flavored mail counts.
	if (!carrier) {
		if (!SHIPMENT_KEYWORDS.test(signals.subject)) return null
		const labeled = text.match(LABELED_NUMBER_PATTERN)
		if (!labeled) return null
		const trackingNumber = labeled[1]
		const byFormat = CARRIERS.find((rule) =>
			rule.numberPatterns.some((pattern) => matchesExactly(pattern, trackingNumber))
		)
		if (byFormat) {
			return {
				carrier: byFormat.name,
				trackingNumber,
				trackingUrl: byFormat.urlTemplate ? byFormat.urlTemplate(trackingNumber) : null
			}
		}
		return { carrier: 'Unknown', trackingNumber, trackingUrl: null }
	}

	if (!SHIPMENT_KEYWORDS.test(text)) return null

	let trackingNumber: string | null = null
	const labeled = text.match(LABELED_NUMBER_PATTERN)
	if (labeled) {
		trackingNumber = labeled[1]
	} else {
		for (const pattern of carrier.numberPatterns) {
			const match = text.match(pattern)
			if (match) {
				trackingNumber = match[0]
				break
			}
		}
	}

	if (trackingNumber === null) return null
	return {
		carrier: carrier.name,
		trackingNumber,
		trackingUrl: carrier.urlTemplate ? carrier.urlTemplate(trackingNumber) : null
	}
}

function matchesExactly(pattern: RegExp, value: string): boolean {
	const match = value.match(pattern)
	return match !== null && match[0] === value
}
