import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Live shipment tracking. Carrier APIs all require registered keys — there is
// no keyless universal endpoint — so this is a small provider layer that
// consults per-carrier keys from the environment or userData/tracking-api.json.
// First backend: DHL's Unified Shipment Tracking API (free tier at
// developer.dhl.com, covers DHL Paket and Deutsche Post).

export interface TrackingResult {
	status: string
	deliveryDate: string | null
	lastEvent: string | null
	trackedAt: string
}

interface TrackingConfig {
	dhlApiKey: string | null
}

function loadConfig(): TrackingConfig {
	const envKey = process.env.NEOMAIL_DHL_API_KEY
	if (envKey) return { dhlApiKey: envKey }
	try {
		const parsed = JSON.parse(
			readFileSync(join(app.getPath('userData'), 'tracking-api.json'), 'utf8')
		)
		if (typeof parsed.dhlApiKey === 'string' && parsed.dhlApiKey !== '') {
			return { dhlApiKey: parsed.dhlApiKey }
		}
	} catch {
		// Missing or malformed file — no keys configured.
	}
	return { dhlApiKey: null }
}

export async function trackShipment(carrier: string, trackingNumber: string): Promise<TrackingResult> {
	const config = loadConfig()
	if (carrier === 'DHL') {
		if (!config.dhlApiKey) {
			throw new Error(
				'No DHL API key configured. Get a free key at developer.dhl.com and set ' +
					'NEOMAIL_DHL_API_KEY or put {"dhlApiKey": "…"} into tracking-api.json in the app data dir.'
			)
		}
		return trackWithDhl(config.dhlApiKey, trackingNumber)
	}
	throw new Error(`Live tracking for ${carrier} is not supported yet — use the Track link.`)
}

interface DhlShipment {
	status?: { timestamp?: string; status?: string; description?: string }
	estimatedTimeOfDelivery?: string
	events?: Array<{ timestamp?: string; description?: string; location?: { address?: { addressLocality?: string } } }>
}

async function trackWithDhl(apiKey: string, trackingNumber: string): Promise<TrackingResult> {
	const url = new URL('https://api-eu.dhl.com/track/shipments')
	url.searchParams.set('trackingNumber', trackingNumber)
	const response = await fetch(url, {
		headers: { 'DHL-API-Key': apiKey },
		signal: AbortSignal.timeout(15_000)
	})
	if (response.status === 404) {
		throw new Error('DHL does not know this tracking number (yet).')
	}
	if (response.status === 429) {
		throw new Error('DHL API rate limit reached — try again later.')
	}
	if (!response.ok) {
		throw new Error(`DHL API answered HTTP ${response.status}`)
	}

	const payload = (await response.json()) as { shipments?: DhlShipment[] }
	const shipment = payload.shipments?.[0]
	if (!shipment) throw new Error('DHL returned no shipment data.')

	let status = 'unknown'
	if (shipment.status?.description) status = shipment.status.description
	else if (shipment.status?.status) status = shipment.status.status

	let lastEvent: string | null = null
	const latest = shipment.events?.[0]
	if (latest?.description) {
		const place = latest.location?.address?.addressLocality
		lastEvent = place ? `${latest.description} (${place})` : latest.description
	}

	return {
		status,
		deliveryDate: shipment.estimatedTimeOfDelivery || null,
		lastEvent,
		trackedAt: new Date().toISOString()
	}
}
