// Screenshots every corpus mail in headless Chromium at the width litehtml renders at. Every
// host resolves to nothing and JavaScript is off, so the page sees only what is in the file.

import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const VIEWPORT_WIDTH = 800
const VIEWPORT_HEIGHT = 900
const MAX_HEIGHT = 20_000

interface CorpusEntry {
	file: string
}

const corpusDirectory = join(import.meta.dir, 'corpus')
const outputDirectory = join(import.meta.dir, 'output', 'chromium')

async function screenshotCorpus(): Promise<void> {
	mkdirSync(outputDirectory, { recursive: true })
	const entries = JSON.parse(readFileSync(join(corpusDirectory, 'index.json'), 'utf8')) as CorpusEntry[]
	const browser = await puppeteer.launch({
		executablePath: '/usr/bin/chromium',
		args: ['--host-resolver-rules=MAP * ~NOTFOUND', '--hide-scrollbars']
	})
	const page = await browser.newPage()
	await page.setJavaScriptEnabled(false)
	await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT })

	for (const entry of entries) {
		const html = readFileSync(join(corpusDirectory, entry.file), 'utf8')
		await page.setContent(html, { waitUntil: 'load', timeout: 15_000 }).catch(() => {})
		const stem = entry.file.replace(/\.html$/, '')
		const height = await page.evaluate(() => document.documentElement.scrollHeight)
		await page.screenshot({
			path: join(outputDirectory, `${stem}.png`),
			clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: Math.min(height, MAX_HEIGHT) }
		})
		console.log(`${stem}: ${VIEWPORT_WIDTH}x${height}`)
	}
	await browser.close()
}

await screenshotCorpus()
