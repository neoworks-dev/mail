import { describe, expect, test } from 'bun:test'
import { buildSnippet, messageSnippet, SNIPPET_LENGTH } from '../sidecar/mail/snippet'

describe('buildSnippet', () => {
	test('drops a style sheet leaked into the text part', () => {
		const text =
			'body, table, td { font-family: Arial, sans-serif !important; } table { border-spacing: 0; } Melde Dich jetzt an'
		expect(buildSnippet(text)).toBe('Melde Dich jetzt an')
	})

	test('drops links, bracketed links and ruler lines', () => {
		const text =
			'======== Consorsbank ======== Im Browser anzeigen ( https://r.mail.example.com/a/b ) Neu: https://example.com/x Sparplan'
		expect(buildSnippet(text)).toBe('Consorsbank Im Browser anzeigen Neu: Sparplan')
	})

	test('drops image alt texts and invisible preheader padding', () => {
		const text = '[Logo JUSKYS] [SALE] Hey Moritz,‌­‌ willkommen'
		expect(buildSnippet(text)).toBe('Hey Moritz, willkommen')
	})

	test('decodes entities and undeclared quoted-printable', () => {
		expect(buildSnippet('Caf&#233; &amp; M=C3=B6bel =\nfür dich')).toBe('Café & Möbel für dich')
	})

	test('keeps ordinary prose and caps the length', () => {
		const prose = 'Lieber Herr Utcke, vielen Dank für Ihre Bestellung. '.repeat(10)
		const snippet = buildSnippet(prose)
		expect(snippet.startsWith('Lieber Herr Utcke, vielen Dank')).toBe(true)
		expect(snippet.length).toBeLessThanOrEqual(SNIPPET_LENGTH)
	})
})

describe('messageSnippet', () => {
	test('falls back to the HTML part when the text part says nothing', () => {
		const html = '<style>p { color: red; }</style><p>Kassenbon</p>'
		expect(messageSnippet('=====', html)).toBe('Kassenbon')
	})

	test('is empty without any body', () => {
		expect(messageSnippet(null, null)).toBe('')
	})
})
