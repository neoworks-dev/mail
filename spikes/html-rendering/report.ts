// Writes output/report.html: each corpus mail as litehtml drew it beside Chromium's screenshot,
// sorted by how far the two page heights disagree, which is a rough first sign of breakage.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface CorpusEntry {
	file: string
	from: string
	subject: string
	traits: string[]
}

interface ReportRow {
	entry: CorpusEntry
	stem: string
	litehtmlHeight: number
	chromiumHeight: number
	heightDifference: number
}

const corpusDirectory = join(import.meta.dir, 'corpus')
const outputDirectory = join(import.meta.dir, 'output')

function pngHeight(path: string): number {
	return readFileSync(path).readUInt32BE(20)
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function reportRow(entry: CorpusEntry): ReportRow {
	const stem = entry.file.replace(/\.html$/, '')
	const litehtmlHeight = pngHeight(join(outputDirectory, 'litehtml', `${stem}.png`))
	const chromiumHeight = pngHeight(join(outputDirectory, 'chromium', `${stem}.png`))
	const heightDifference = Math.abs(litehtmlHeight - chromiumHeight) / chromiumHeight
	return { entry, stem, litehtmlHeight, chromiumHeight, heightDifference }
}

function rowHtml(row: ReportRow): string {
	const percent = Math.round(row.heightDifference * 100)
	return `<section>
	<h2>${row.stem}: ${escapeHtml(row.entry.subject)}</h2>
	<p>${escapeHtml(row.entry.from)} · ${row.entry.traits.join(', ')} · litehtml ${row.litehtmlHeight}px, Chromium ${row.chromiumHeight}px (${percent}% off)</p>
	<div class="pair">
		<figure><figcaption>litehtml</figcaption><img src="litehtml/${row.stem}.png"></figure>
		<figure><figcaption>Chromium</figcaption><img src="chromium/${row.stem}.png"></figure>
	</div>
</section>`
}

function writeReport(): void {
	const entries = JSON.parse(readFileSync(join(corpusDirectory, 'index.json'), 'utf8')) as CorpusEntry[]
	const rows = entries.map(reportRow).sort((first, second) => second.heightDifference - first.heightDifference)
	const page = `<!doctype html><meta charset="utf-8"><title>litehtml vs Chromium</title>
<style>
	body { font: 14px system-ui; margin: 24px; background: #eee; }
	.pair { display: flex; gap: 16px; align-items: flex-start; }
	figure { margin: 0; background: white; outline: 1px solid #bbb; }
	figcaption { font-weight: 600; padding: 4px 8px; background: #ddd; }
	img { display: block; width: 800px; }
</style>
${rows.map(rowHtml).join('\n')}`
	writeFileSync(join(outputDirectory, 'report.html'), page)
	for (const row of rows) console.log(`${row.stem}\t${Math.round(row.heightDifference * 100)}%\t${row.entry.traits.join(',')}`)
}

writeReport()
