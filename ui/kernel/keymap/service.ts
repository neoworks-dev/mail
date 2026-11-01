// The `keymap` service: the window's keys. One window listener (KernelShell) hands every key
// that nothing focused took to `dispatch`, which runs a chain of handlers from the highest
// priority down until one claims the key. Bindings are one tier of that chain: a plugin binds a
// command to a default combo, the user can rebind it, and the overrides live in settings.
//
// A bare key such as `j` never fires while a text field has focus, since it is being typed;
// a combo with Ctrl, Alt or Meta fires anywhere.

import { Service, type Context } from '@neoworks/extension-system'
import {
	comboEquals,
	comboMatches,
	isGlobalCombo,
	type KeyCombo,
	type KeyInput
} from '../../lib/keycombo'
import { createChangeSignal, type ChangeSignal } from '../reactive'

declare module '@neoworks/extension-system' {
	interface Context {
		keymap: KeymapService
	}
}

/** A window key event: the key, its modifiers and the two calls that end its delivery. */
export interface KeyEventInput extends KeyInput {
	preventDefault(): void
	stopPropagation(): void
}

/** Returns true when it claims the key, which ends the chain. */
export type KeyHandler = (event: KeyEventInput) => boolean

/** Tiers of the chain; higher runs first, equal ones in registration order. */
export const KeyPriority = {
	/** The rebind recorder owns the keyboard while it waits for a combo. */
	capture: 100,
	/** Dialogs: Escape closes them before any binding sees it. */
	dialog: 90,
	/** Overlays with their own input, such as the palette and the composer. */
	overlay: 80,
	bindings: 40,
	/** App keys that lose to any binding, such as Escape closing the open thread. */
	app: 20
} as const

export interface KeyBinding {
	/** The command the key runs; its title is the binding's label. */
	command: string
	combo: KeyCombo
	/** Whether the binding applies now, beyond the command's own `when`. */
	when?: () => boolean
}

export interface BindingDescription {
	command: string
	title: string
	combo: KeyCombo
	defaultCombo: KeyCombo
	overridden: boolean
}

const OVERRIDES_SETTING = 'keymap.overrides'

interface Subscription {
	order: number
	priority: number
	handle: KeyHandler
}

export class KeymapService extends Service {
	static inject = ['commands', 'settings']

	private subscriptions: Subscription[] = []
	private nextOrder = 0
	private bindings: KeyBinding[] = []
	private changes: ChangeSignal = createChangeSignal()

	constructor(ctx: Context) {
		super(ctx, 'keymap')
		this.subscribe(KeyPriority.bindings, (event) => this.handleBinding(event))
	}

	/** Adds a handler to the chain until the calling plugin unloads or the returned function runs. */
	subscribe(priority: number, handle: KeyHandler): () => void {
		return this.ctx.effect(() => {
			const subscription: Subscription = { order: this.nextOrder, priority, handle }
			this.nextOrder += 1
			this.subscriptions = [...this.subscriptions, subscription].sort(byPriorityThenOrder)
			return () => {
				this.subscriptions = this.subscriptions.filter((entry) => entry !== subscription)
			}
		}, `keymap.subscribe(${priority})`)
	}

	/** Binds a key to a command until the calling plugin unloads or the returned function runs. */
	bind(binding: KeyBinding): () => void {
		return this.ctx.effect(() => {
			this.bindings = [...this.bindings, binding]
			this.changes.notify()
			return () => {
				this.bindings = this.bindings.filter((entry) => entry !== binding)
				this.changes.notify()
			}
		}, `keymap.bind(${binding.command})`)
	}

	/** Runs one keystroke through the chain; true when a handler claimed it. */
	dispatch(event: KeyEventInput): boolean {
		for (const subscription of this.subscriptions) {
			if (subscription.handle(event)) return true
		}
		return false
	}

	/** The combo a command runs on now, with the user's override applied. Reactive. */
	comboFor(command: string): KeyCombo | null {
		this.changes.track()
		const override = this.overrides()[command]
		if (override) return override
		const binding = this.bindings.find((entry) => entry.command === command)
		if (!binding) return null
		return binding.combo
	}

	/** Every binding with its label and current combo, for the shortcuts overlay. Reactive. */
	describe(): BindingDescription[] {
		this.changes.track()
		const overrides = this.overrides()
		return this.bindings.map((binding) => {
			const command = this.ctx.commands.get(binding.command)
			let title = binding.command
			if (command) title = command.title
			return {
				command: binding.command,
				title,
				combo: effectiveCombo(binding, overrides),
				defaultCombo: binding.combo,
				overridden: overrides[binding.command] !== undefined
			}
		})
	}

	setOverride(command: string, combo: KeyCombo): void {
		const binding = this.bindings.find((entry) => entry.command === command)
		if (binding && comboEquals(combo, binding.combo)) {
			this.resetOverride(command)
			return
		}
		this.ctx.settings.set(OVERRIDES_SETTING, { ...this.overrides(), [command]: combo })
	}

	resetOverride(command: string): void {
		const next = { ...this.overrides() }
		delete next[command]
		this.ctx.settings.set(OVERRIDES_SETTING, next)
	}

	private overrides(): Record<string, KeyCombo> {
		return this.ctx.settings.get<Record<string, KeyCombo>>(OVERRIDES_SETTING, {})
	}

	private handleBinding(event: KeyEventInput): boolean {
		const typing = isTyping()
		const overrides = this.overrides()
		for (const binding of this.bindings) {
			const combo = effectiveCombo(binding, overrides)
			if (combo.key === '' || !comboMatches(combo, event)) continue
			if (typing && !isGlobalCombo(combo)) continue
			if (binding.when && !binding.when()) continue
			if (!this.ctx.commands.canRun(binding.command)) continue
			event.preventDefault()
			event.stopPropagation()
			void this.ctx.commands.run(binding.command)
			return true
		}
		return false
	}
}

function effectiveCombo(binding: KeyBinding, overrides: Record<string, KeyCombo>): KeyCombo {
	const override = overrides[binding.command]
	if (override) return override
	return binding.combo
}

function byPriorityThenOrder(first: Subscription, second: Subscription): number {
	if (first.priority !== second.priority) return second.priority - first.priority
	return first.order - second.order
}

interface FocusDocument {
	activeElement: { tagName?: string } | null
}

/** Whether a text field has focus, so a bare key is being typed rather than pressed. */
export function isTyping(): boolean {
	const fakeDocument = (globalThis as { document?: FocusDocument }).document
	if (!fakeDocument || !fakeDocument.activeElement) return false
	const tagName = fakeDocument.activeElement.tagName
	if (!tagName) return false
	return tagName.toLowerCase() === 'g-input'
}
