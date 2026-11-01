import { describe, expect, test } from 'bun:test'
import { classifyHeuristic, type LabelSignals } from '../sidecar/mail/labeling'

function signals(overrides: Partial<LabelSignals>): LabelSignals {
	return {
		fromAddress: 'someone@example.com',
		subject: 'Hello',
		hasListHeaders: false,
		bulkPrecedence: false,
		autoSubmitted: false,
		spamFlagged: false,
		...overrides
	}
}

describe('classifyHeuristic', () => {
	test('personal mail stays unlabeled', () => {
		expect(classifyHeuristic(signals({}))).toBeNull()
	})

	test('spam flag wins over everything', () => {
		const result = classifyHeuristic(
			signals({ spamFlagged: true, hasListHeaders: true, fromAddress: 'news@facebookmail.com' })
		)
		expect(result).toBe('spam')
	})

	test('social domains beat list headers', () => {
		expect(
			classifyHeuristic(
				signals({ fromAddress: 'notification@facebookmail.com', hasListHeaders: true })
			)
		).toBe('social')
		expect(classifyHeuristic(signals({ fromAddress: 'noreply@github.com' }))).toBe('social')
	})

	test('list headers make a newsletter', () => {
		expect(classifyHeuristic(signals({ hasListHeaders: true }))).toBe('newsletter')
		expect(classifyHeuristic(signals({ bulkPrecedence: true }))).toBe('newsletter')
	})

	test('promotional list mail becomes an ad', () => {
		expect(
			classifyHeuristic(signals({ hasListHeaders: true, subject: '20% Rabatt nur heute!' }))
		).toBe('ad')
		expect(
			classifyHeuristic(signals({ hasListHeaders: true, fromAddress: 'offers@shop.example' }))
		).toBe('ad')
	})

	test('noreply senders without list headers are notifications', () => {
		expect(classifyHeuristic(signals({ fromAddress: 'noreply@bank.example' }))).toBe('notification')
		expect(classifyHeuristic(signals({ fromAddress: 'no-reply@service.example' }))).toBe(
			'notification'
		)
		expect(classifyHeuristic(signals({ autoSubmitted: true }))).toBe('notification')
	})

	test('noreply-like prefixes only match with separators', () => {
		expect(classifyHeuristic(signals({ fromAddress: 'alertson@example.com' }))).toBeNull()
		expect(classifyHeuristic(signals({ fromAddress: 'alerts-eu@example.com' }))).toBe(
			'notification'
		)
	})
})
