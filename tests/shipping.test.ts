import { describe, expect, test } from 'bun:test'
import { extractShipment } from '../sidecar/mail/shipping'
import { parseActionsJson, parseDigestJson, parseShipmentJson } from '../ui/lib/extraction'

describe('extractShipment', () => {
	test('DHL sender with 20-digit number and shipment wording', () => {
		const result = extractShipment({
			fromAddress: 'noreply@dhl.de',
			subject: 'Ihre Sendung ist unterwegs',
			bodyText: 'Ihre Sendungsnummer: 00340434161094042557'
		})
		expect(result?.carrier).toBe('DHL')
		expect(result?.trackingNumber).toBe('00340434161094042557')
		expect(result?.trackingUrl).toContain('piececode=00340434161094042557')
	})

	test('UPS 1Z number without a label', () => {
		const result = extractShipment({
			fromAddress: 'mcinfo@ups.com',
			subject: 'UPS Ship Notification',
			bodyText: 'Tracking your package 1Z999AA10123456784 shipped today'
		})
		expect(result?.carrier).toBe('UPS')
		expect(result?.trackingNumber).toBe('1Z999AA10123456784')
	})

	test('shop sender with labeled UPS-format number resolves the carrier', () => {
		const result = extractShipment({
			fromAddress: 'orders@shop.example',
			subject: 'Your order has shipped!',
			bodyText: 'Tracking number: 1Z999AA10123456784'
		})
		expect(result?.carrier).toBe('UPS')
	})

	test('shop sender with unrecognized labeled number keeps carrier unknown', () => {
		const result = extractShipment({
			fromAddress: 'orders@shop.example',
			subject: 'Deine Bestellung wurde versandt',
			bodyText: 'Sendungsnummer: ABCDEF123456'
		})
		expect(result?.carrier).toBe('Unknown')
		expect(result?.trackingNumber).toBe('ABCDEF123456')
		expect(result?.trackingUrl).toBeNull()
	})

	test('carrier sender without shipment wording or number yields null', () => {
		expect(
			extractShipment({
				fromAddress: 'newsletter@dhl.de',
				subject: 'Neues aus der Logistikwelt',
				bodyText: 'Unser Magazin im August'
			})
		).toBeNull()
	})

	test('ordinary mail yields null', () => {
		expect(
			extractShipment({
				fromAddress: 'jane@example.com',
				subject: 'Lunch tomorrow?',
				bodyText: 'Meet at 12? 00340434161094042557 is not relevant here'
			})
		).toBeNull()
	})
})

describe('parseShipmentJson', () => {
	test('parses a clean reply', () => {
		const parsed = parseShipmentJson(
			'{"carrier":"DHL","trackingNumber":"123","trackingUrl":"https://dhl.de/x","status":"In transit","deliveryDate":"2026-08-05"}'
		)
		expect(parsed).toEqual({
			carrier: 'DHL',
			trackingNumber: '123',
			trackingUrl: 'https://dhl.de/x',
			status: 'In transit',
			deliveryDate: '2026-08-05'
		})
	})

	test('tolerates fences and prose around the JSON', () => {
		const parsed = parseShipmentJson('Here you go:\n```json\n{"carrier":"UPS","trackingNumber":null,"trackingUrl":null}\n```')
		expect(parsed?.carrier).toBe('UPS')
		expect(parsed?.trackingNumber).toBeNull()
	})

	test('rejects null replies and non-http urls', () => {
		expect(parseShipmentJson('null')).toBeNull()
		const parsed = parseShipmentJson('{"carrier":"X","trackingNumber":"1","trackingUrl":"javascript:alert(1)"}')
		expect(parsed?.trackingUrl).toBeNull()
	})
})

describe('parseActionsJson', () => {
	test('parses items and normalizes due', () => {
		const items = parseActionsJson(
			'[{"title":"Pay invoice","due":"2026-08-10"},{"title":"Reply to Jane","due":null}]'
		)
		expect(items).toEqual([
			{ title: 'Pay invoice', due: '2026-08-10' },
			{ title: 'Reply to Jane', due: null }
		])
	})

	test('empty array is valid (nothing to do)', () => {
		expect(parseActionsJson('[]')).toEqual([])
	})

	test('drops malformed entries, tolerates fences', () => {
		const items = parseActionsJson('```json\n[{"title":"Ok"},{"nope":1},"x"]\n```')
		expect(items).toEqual([{ title: 'Ok', due: null }])
	})

	test('non-array replies are rejected', () => {
		expect(parseActionsJson('{"title":"x"}')).toBeNull()
		expect(parseActionsJson('no json here')).toBeNull()
	})
})

describe('parseDigestJson', () => {
	test('parses groups with thread references', () => {
		const digest = parseDigestJson(
			'{"intro":"Busy night.","groups":[{"title":"Important","items":[{"threadId":12,"note":"Boss wants reply"}]},{"title":"Bulk","items":[{"threadId":34,"note":""}]}]}'
		)
		expect(digest?.intro).toBe('Busy night.')
		expect(digest?.groups).toHaveLength(2)
		expect(digest?.groups[0].items[0]).toEqual({ threadId: 12, note: 'Boss wants reply' })
	})

	test('drops invalid items and empty groups, rejects proseful replies', () => {
		const digest = parseDigestJson(
			'{"groups":[{"title":"A","items":[{"threadId":"x","note":"bad"}]},{"title":"B","items":[{"threadId":5,"note":"ok"}]}]}'
		)
		expect(digest?.groups).toHaveLength(1)
		expect(digest?.groups[0].title).toBe('B')
		expect(parseDigestJson('Good morning! Lots of mail today.')).toBeNull()
	})
})
