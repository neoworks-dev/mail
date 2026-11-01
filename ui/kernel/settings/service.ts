// The `settings` service: small preferences that outlive a run, such as pane widths, the theme
// and rebound keys. They are one JSON object kept by the sidecar (`ui-settings.json` in the data
// directory). Reads are reactive; writes apply at once and are saved shortly after, so a
// dragged divider saves once rather than on every frame.

import { Service, type Context } from '@neoworks/extension-system'
import { createChangeSignal, type ChangeSignal } from '../reactive'

declare module '@neoworks/extension-system' {
	interface Context {
		settings: SettingsService
	}
}

const SAVE_DELAY_MS = 400

export class SettingsService extends Service {
	static inject = ['sidecar']

	private values: Record<string, unknown> = {}
	private changes: ChangeSignal = createChangeSignal()
	private saveTimer: ReturnType<typeof setTimeout> | null = null

	constructor(ctx: Context) {
		super(ctx, 'settings')
		ctx.effect(() => () => this.flush(), 'settings save')
	}

	async [Service.init](): Promise<void> {
		try {
			this.values = await this.ctx.sidecar.call('settings.load')
		} catch (error) {
			this.ctx.logger('settings').warn('could not load settings; using defaults', error)
		}
		this.changes.notify()
	}

	/** The stored value, or `fallback` when there is none. Reactive. */
	get<Value>(key: string, fallback: Value): Value {
		this.changes.track()
		if (!(key in this.values)) return fallback
		return this.values[key] as Value
	}

	set(key: string, value: unknown): void {
		this.values = { ...this.values, [key]: value }
		this.changes.notify()
		this.scheduleSave()
	}

	remove(key: string): void {
		if (!(key in this.values)) return
		const next = { ...this.values }
		delete next[key]
		this.values = next
		this.changes.notify()
		this.scheduleSave()
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) clearTimeout(this.saveTimer)
		this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS)
	}

	private flush(): void {
		if (this.saveTimer === null) return
		clearTimeout(this.saveTimer)
		this.saveTimer = null
		void this.ctx.sidecar.call('settings.save', this.values).catch((error: unknown) => {
			this.ctx.logger('settings').warn('could not save settings', error)
		})
	}
}
