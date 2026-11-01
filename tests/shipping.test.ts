import { describe, expect, test } from 'bun:test'
import { extractShipment } from '../sidecar/mail/shipping'

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
