// Mail on the neo harness. The plugin registers Mail as an app with the neo daemon, offers it
// Mail's tools (sidecar/neo/tools.ts) and tells it what the user is looking at. It also follows
// the session the agent works in and relays its chat to the window as assistant items, so the
// assistant pane shows the same conversation every other neo app does. What the agent asks the
// window to do through the tools reaches it as `assistant.request`.
//
// `NEOMAIL_NEO=off` keeps the sidecar off the bus, which tests use.

import type { Context } from '@neoworks/extension-system'
import { connect, createToolServer, ViewState, type Client, type ToolServer } from '@neoworks-dev/neo-sdk'
import type { ViewItem } from '@neoworks-dev/neo-protocol/types'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AssistantItem, AssistantPrompt, AssistantStatus, AssistantView } from '../../../shared/assistant'
import { RouteError } from '../../kernel/rpc'
import { mailTools, TOOL_INSTRUCTIONS } from '../../neo/tools'
import { assistantItem } from '../../neo/view'

const APP_ID = 'mail'
/** The newest chat items the window gets; older ones stay in neo. */
const VIEW_ITEM_LIMIT = 150
/** Patches arrive per streamed token; the window gets at most one view per interval. */
const VIEW_BROADCAST_INTERVAL_MS = 60

export const neo = {
	name: 'neo',
	inject: ['store', 'paths', 'rpc'],
	apply(ctx: Context) {
		const bridge = new NeoBridge(ctx)
		ctx.effect(() => {
			void bridge.start()
			return () => bridge.stop()
		}, 'neo connection')

		ctx.rpc.handle('assistant.status', () => bridge.status())
		ctx.rpc.handle('assistant.view', () => bridge.view())
		ctx.rpc.handle('assistant.ask', (text) => bridge.ask(text))
		ctx.rpc.handle('assistant.cancel', () => bridge.cancel())
		ctx.rpc.handle('assistant.action', (ref, action, args) => bridge.action(ref, action, args))
		ctx.rpc.handle('assistant.focus', () => bridge.focusHere())
		ctx.rpc.handle('assistant.setContext', (context) => bridge.setContext(context))
		ctx.rpc.handle('assistant.prompts', () => loadPrompts(join(ctx.paths.appRoot, 'sidecar', 'neo', 'prompts')))
	}
}

class NeoBridge {
	private client: Client | null = null
	private tools: ToolServer | null = null
	private stopped = false
	private disabled = process.env.NEOMAIL_NEO === 'off'
	private error: string | null = null
	private context: Record<string, string> = {}
	private viewState = new ViewState()
	private viewSessionId: string | null = null
	private stopView: (() => void) | null = null
	private converted = new WeakMap<ViewItem, AssistantItem>()
	private broadcastTimer: ReturnType<typeof setTimeout> | null = null

	constructor(private ctx: Context) {}

	async start(): Promise<void> {
		if (this.disabled) return
		try {
			this.tools = await createToolServer({
				name: APP_ID,
				instructions: TOOL_INSTRUCTIONS,
				tools: mailTools({ store: this.ctx.store, request: (request) => this.ctx.rpc.broadcast('assistant.request', request) })
			})
			if (this.stopped) return
			this.client = await connect({
				client: APP_ID,
				waitForDaemon: true,
				presence: this.presence(),
				onError: (error) => this.ctx.logger('neo').warn(error.message)
			})
			this.followClient(this.client)
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error)
			this.ctx.logger('neo').warn(`could not join neo: ${this.error}`)
			this.broadcastStatus()
		}
	}

	async stop(): Promise<void> {
		this.stopped = true
		if (this.stopView) this.stopView()
		if (this.broadcastTimer) clearTimeout(this.broadcastTimer)
		const client = this.client
		this.client = null
		if (client) await client.close().catch(() => {})
		if (this.tools) await this.tools.close().catch(() => {})
	}

	status(): AssistantStatus {
		if (this.disabled) return { state: 'off', error: null, sessionId: null, focusApp: null }
		const client = this.client
		if (!client) return { state: 'connecting', error: this.error, sessionId: null, focusApp: null }
		const focus = client.focus.value
		return {
			state: client.state.value,
			error: this.error,
			sessionId: focus ? focus.session : null,
			focusApp: focus && focus.app ? focus.app : null
		}
	}

	view(): AssistantView {
		const items = this.viewState.items.slice(-VIEW_ITEM_LIMIT).map((item) => this.convert(item))
		return { sessionId: this.viewSessionId, items, running: this.sessionRunning() }
	}

	/** Sends input to the agent's current session, creating one when there is none. */
	async ask(text: string): Promise<void> {
		const client = this.requireClient()
		let sessionId = this.status().sessionId
		if (sessionId === null) {
			const session = await client.createSession({ title: 'Mail' })
			sessionId = session.id
		}
		await client.input(sessionId, text, { app: APP_ID })
	}

	async cancel(): Promise<void> {
		const sessionId = this.status().sessionId
		if (sessionId !== null) await this.requireClient().cancel(sessionId)
	}

	async action(ref: string, action: string, args: unknown): Promise<void> {
		if (this.viewSessionId === null) throw new RouteError('NoSession', 'no session is shown')
		await this.requireClient().action(this.viewSessionId, ref, action, args)
	}

	async focusHere(): Promise<void> {
		await this.requireClient().moveAgent({ app: APP_ID })
	}

	async setContext(context: Record<string, string>): Promise<void> {
		this.context = context
		const client = this.client
		if (client && client.state.value === 'open') await client.setContext(context)
	}

	private presence() {
		return {
			app: APP_ID,
			kind: 'app' as const,
			title: 'Mail',
			open: true,
			pid: process.pid,
			context: this.context,
			mcp: this.tools ? this.tools.endpoint : undefined
		}
	}

	private followClient(client: Client): void {
		client.state.on(() => this.broadcastStatus())
		client.sessions.on(() => this.scheduleViewBroadcast())
		client.focus.on((focus) => {
			this.broadcastStatus()
			if (focus) this.showSession(focus.session)
		})
		const focus = client.focus.value
		if (focus) this.showSession(focus.session)
		this.broadcastStatus()
	}

	/** Follows a session's chat, dropping the one followed before. */
	private showSession(sessionId: string): void {
		if (sessionId === this.viewSessionId || !this.client) return
		if (this.stopView) this.stopView()
		this.viewSessionId = sessionId
		this.viewState = new ViewState()
		this.stopView = this.client.subscribeView(sessionId, {
			onSnapshot: (snapshot) => {
				this.viewState.applySnapshot(snapshot)
				this.scheduleViewBroadcast()
			},
			onPatch: (patch) => {
				this.viewState.applyPatch(patch)
				this.scheduleViewBroadcast()
			},
			onError: (error) => this.ctx.logger('neo').warn(`view: ${error.message}`)
		})
	}

	private convert(item: ViewItem): AssistantItem {
		const cached = this.converted.get(item)
		if (cached) return cached
		const converted = assistantItem(item)
		this.converted.set(item, converted)
		return converted
	}

	private sessionRunning(): boolean {
		const client = this.client
		if (!client || this.viewSessionId === null) return false
		const session = client.sessions.value.find((entry) => entry.id === this.viewSessionId)
		return session !== undefined && session.state === 'running'
	}

	private scheduleViewBroadcast(): void {
		if (this.broadcastTimer) return
		this.broadcastTimer = setTimeout(() => {
			this.broadcastTimer = null
			if (!this.stopped) this.ctx.rpc.broadcast('assistant.view', this.view())
		}, VIEW_BROADCAST_INTERVAL_MS)
	}

	private broadcastStatus(): void {
		if (!this.stopped) this.ctx.rpc.broadcast('assistant.status', this.status())
	}

	private requireClient(): Client {
		if (this.disabled) throw new RouteError('NeoOff', 'neo is turned off for this run')
		const client = this.client
		if (!client || client.state.value !== 'open') {
			throw new RouteError('NeoUnavailable', this.error ?? 'neo is not connected yet')
		}
		return client
	}
}

/** The prompt templates beside the plugin: markdown with a `description` in its frontmatter. */
async function loadPrompts(directory: string): Promise<AssistantPrompt[]> {
	const names = (await readdir(directory).catch(() => [] as string[])).filter((name) => name.endsWith('.md'))
	return Promise.all(
		names.sort().map(async (name) => {
			const source = await readFile(join(directory, name), 'utf8')
			const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n?/)
			let description = ''
			let text = source
			if (frontmatter) {
				const line = frontmatter[1].match(/^description:\s*(.*)$/m)
				if (line) description = line[1].trim()
				text = source.slice(frontmatter[0].length).trim()
			}
			return { name: name.replace(/\.md$/, ''), description, text }
		})
	)
}
