import { readFileSync, writeFileSync } from 'node:fs'

// Daily digest scheduler. The sidecar only decides WHEN a digest is due
// and pings the UI; the generation itself (nib) runs there. Config in
// digest.json in the data directory: {"enabled": true, "hour": 8}.

const CHECK_INTERVAL_MS = 5 * 60_000

interface DigestConfig {
	enabled: boolean
	hour: number
	lastRun?: string
}

function loadConfig(configPath: string): DigestConfig {
	try {
		const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
		return {
			enabled: parsed.enabled !== false,
			hour: Number.isInteger(parsed.hour) ? parsed.hour : 8,
			lastRun: typeof parsed.lastRun === 'string' ? parsed.lastRun : undefined
		}
	} catch {
		return { enabled: true, hour: 8 }
	}
}

function saveConfig(configPath: string, config: DigestConfig): void {
	writeFileSync(configPath, JSON.stringify(config, null, '\t'))
}

/** Fire onDue once per day at/after the configured hour. Returns a stop function. */
export function startDigestScheduler(configPath: string, onDue: () => void): () => void {
	const check = (): void => {
		const config = loadConfig(configPath)
		if (!config.enabled) return
		const now = new Date()
		if (now.getHours() < config.hour) return
		const today = now.toISOString().slice(0, 10)
		if (config.lastRun === today) return
		saveConfig(configPath, { ...config, lastRun: today })
		onDue()
	}
	const timer = setInterval(check, CHECK_INTERVAL_MS)
	// One early check so a digest still fires when the app starts after the hour.
	const startupTimer = setTimeout(check, 15_000)
	return () => {
		clearInterval(timer)
		clearTimeout(startupTimer)
	}
}
