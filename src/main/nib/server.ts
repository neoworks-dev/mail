// The embedded nib agent server. Runs as a child process for the lifetime of
// the app, reached over a unix socket so nothing agent-related is on the
// network. The server owns sessions, extensions and the provider connection;
// this app owns the mail engine and UI on top of it.

import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import type { NibEndpoint, NibStatus } from '../../shared/nib'
import {
	bundledNibExtensionsDir,
	bundledNibPromptsDir,
	nibDataDir,
	nibLaunch,
	nibSocketPath,
	type NibLaunch
} from './paths'
import { nibRequest } from './transport'

const HEALTH_TIMEOUT_MS = 20_000
const HEALTH_INTERVAL_MS = 100
const RESTART_BASE_MS = 500
const RESTART_MAX_MS = 30_000

export interface NibServerOptions {
	/** Absolute path of the mail SQLite DB, handed to the search extension. */
	mailDatabasePath: string
	/** Fires when the server is up; again after every restart. */
	onReady: (endpoint: NibEndpoint) => void
	/** The child went away unexpectedly; a restart is already scheduled. */
	onExit: (reason: string) => void
}

export class NibServer {
	private child: ChildProcess | null = null
	private currentEndpoint: NibEndpoint | null = null
	private launch: NibLaunch | null = null
	private starting: Promise<void> | null = null
	private restartTimer: NodeJS.Timeout | null = null
	private restartAttempts = 0
	private lastError: string | null = null
	private stopped = false

	constructor(private options: NibServerOptions) {}

	/** Start the server, or join the start already in flight. */
	start(): Promise<void> {
		if (this.child && this.currentEndpoint) return Promise.resolve()
		if (this.starting) return this.starting

		this.stopped = false
		this.starting = this.spawnAndWait().finally(() => {
			this.starting = null
		})
		return this.starting
	}

	endpoint(): NibEndpoint | null {
		return this.currentEndpoint
	}

	status(): NibStatus {
		let source: string | null = null
		if (this.launch) source = this.launch.source
		return {
			running: this.child !== null && this.currentEndpoint !== null,
			pid: this.child ? (this.child.pid ?? null) : null,
			endpoint: this.currentEndpoint,
			source,
			error: this.lastError
		}
	}

	async stop(): Promise<void> {
		this.stopped = true
		if (this.restartTimer) {
			clearTimeout(this.restartTimer)
			this.restartTimer = null
		}
		const child = this.child
		this.child = null
		this.currentEndpoint = null
		if (!child) return

		child.kill('SIGTERM')
		await this.clearSocket()
	}

	private async spawnAndWait(): Promise<void> {
		const launch = nibLaunch()
		if (!launch) {
			this.lastError = missingMessage()
			throw new Error(this.lastError)
		}
		this.launch = launch

		await this.prepareDataDir()
		const endpoint = await this.reserveEndpoint()
		// Workspace = userData: sessions get the mail app's own state dir, not
		// whatever directory the nib checkout happens to live in.
		const child = spawn(launch.command, [...launch.args, ...listenArgs(endpoint), '--data-dir', nibDataDir(), '--workspace', workspaceDir()], {
			cwd: launch.cwd,
			stdio: ['ignore', 'inherit', 'inherit'],
			env: { ...process.env, NEOMAIL_DB_PATH: this.options.mailDatabasePath }
		})
		this.child = child
		this.watch(child)

		const ready = await this.waitForHealth(endpoint, child)
		if (!ready) {
			this.lastError = `nib did not become healthy on ${describe(endpoint)}`
			child.kill('SIGTERM')
			this.child = null
			throw new Error(this.lastError)
		}

		this.currentEndpoint = endpoint
		this.lastError = null
		this.restartAttempts = 0
		this.options.onReady(endpoint)
	}

	/**
	 * Copy the app's own extensions and prompt templates into nib's data dir.
	 * Files there are global rather than per-project, which makes extensions
	 * trusted without a prompt and templates available as slash commands.
	 */
	private async prepareDataDir(): Promise<void> {
		await this.copyBundled(bundledNibExtensionsDir(), 'extensions', ['.ts', '.js'])
		await this.copyBundled(bundledNibPromptsDir(), 'prompts', ['.md'])
	}

	private async copyBundled(source: string, targetName: string, extensions: string[]): Promise<void> {
		const target = join(nibDataDir(), targetName)
		await mkdir(target, { recursive: true })
		const entries = await readdir(source).catch(() => [] as string[])
		for (const entry of entries) {
			if (!extensions.some((extension) => entry.endsWith(extension))) continue
			await copyFile(join(source, entry), join(target, entry))
		}
	}

	private async reserveEndpoint(): Promise<NibEndpoint> {
		// nib binds unix sockets only; Windows gets a loopback port instead.
		if (process.platform === 'win32') {
			return { host: '127.0.0.1', port: await freePort() }
		}
		const socketPath = nibSocketPath()
		await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 })
		// nib removes a stale socket itself, but a leftover file from a hard kill
		// would otherwise make the health check talk to nothing.
		await rm(socketPath, { force: true })
		return { socketPath }
	}

	private async waitForHealth(endpoint: NibEndpoint, child: ChildProcess): Promise<boolean> {
		const deadline = Date.now() + HEALTH_TIMEOUT_MS
		while (Date.now() < deadline) {
			if (child.exitCode !== null || child.signalCode !== null) return false
			if (await isHealthy(endpoint)) return true
			await sleep(HEALTH_INTERVAL_MS)
		}
		return false
	}

	private watch(child: ChildProcess): void {
		child.on('error', (cause: Error) => {
			this.lastError = `nib failed to start: ${cause.message}`
			console.error(`[nib] ${this.lastError}`)
		})

		child.on('exit', (code, signal) => {
			if (this.child !== child) return
			this.child = null
			this.currentEndpoint = null
			if (this.stopped) return

			const reason = signal ? `signal ${signal}` : `exit code ${code}`
			this.lastError = `nib stopped unexpectedly (${reason})`
			console.error(`[nib] ${this.lastError}`)
			this.options.onExit(reason)
			this.scheduleRestart()
		})
	}

	private scheduleRestart(): void {
		if (this.stopped || this.restartTimer) return
		const restartDelay = Math.min(RESTART_BASE_MS * 2 ** this.restartAttempts, RESTART_MAX_MS)
		this.restartAttempts += 1

		this.restartTimer = setTimeout(() => {
			this.restartTimer = null
			void this.start().catch((error: Error) => {
				console.error(`[nib] restart failed: ${error.message}`)
				this.scheduleRestart()
			})
		}, restartDelay)
	}

	private async clearSocket(): Promise<void> {
		if (process.platform === 'win32') return
		await rm(nibSocketPath(), { force: true }).catch(() => {})
	}
}

function workspaceDir(): string {
	return app.getPath('userData')
}

function listenArgs(endpoint: NibEndpoint): string[] {
	if (endpoint.socketPath) return ['--socket', endpoint.socketPath]
	const host = endpoint.host || '127.0.0.1'
	return ['--host', host, '--port', String(endpoint.port)]
}

function describe(endpoint: NibEndpoint): string {
	if (endpoint.socketPath) return endpoint.socketPath
	return `${endpoint.host}:${endpoint.port}`
}

async function isHealthy(endpoint: NibEndpoint): Promise<boolean> {
	try {
		const response = await nibRequest(endpoint, { method: 'GET', path: '/v1/health' })
		response.resume()
		return response.statusCode === 200
	} catch {
		return false
	}
}

/** Ask the OS for an unused port, then hand it straight to nib. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createServer()
		probe.on('error', reject)
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address()
			const port = typeof address === 'object' && address !== null ? address.port : 0
			probe.close(() => resolve(port))
		})
	})
}

function missingMessage(): string {
	return (
		'nib runtime missing — set NEOMAIL_NIB to a nib checkout, ' +
		'or run `bun scripts/build-nib.ts` for a packaged build'
	)
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
