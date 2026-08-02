import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, Notification, shell, type Tray } from 'electron'
import { join } from 'node:path'
import { startDigestScheduler } from './digest'
import { broadcast, registerIpc } from './ipc'
import { databasePath } from './mail/db'
import { MailEngine } from './mail/engine'
import { SendOutbox } from './mail/outbox'
import type { NewMessageInfo } from './mail/sync'
import { registerNibProtocol, registerNibScheme } from './nib/protocol'
import { NibServer } from './nib/server'
import { createTray, setTrayUnread } from './tray'

const TRAY_UNREAD_DEBOUNCE_MS = 1000

let engine: MailEngine | null = null
let outbox: SendOutbox | null = null
let nibServer: NibServer | null = null
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** Closing the window hides to the tray; only Quit (or platform quit) exits. */
let quitting = false
let trayUnreadTimer: ReturnType<typeof setTimeout> | null = null

registerNibScheme()

function createWindow(): void {
	const window = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1024,
		minHeight: 640,
		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: join(__dirname, '../preload/index.mjs'),
			sandbox: false
		}
	})
	mainWindow = window

	window.on('ready-to-show', () => {
		window.show()
	})

	window.on('close', (event) => {
		if (quitting) return
		event.preventDefault()
		window.hide()
	})

	window.on('closed', () => {
		if (mainWindow === window) mainWindow = null
	})

	// External links open in the system browser, never in-app. Only http(s) is
	// forwarded — mail content must not be able to launch arbitrary protocols.
	window.webContents.setWindowOpenHandler((details) => {
		if (details.url.startsWith('http://') || details.url.startsWith('https://')) {
			void shell.openExternal(details.url)
		}
		return { action: 'deny' }
	})

	// Same rule for in-place navigation attempts from any frame.
	window.webContents.on('will-navigate', (event) => {
		event.preventDefault()
	})

	if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
		void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
	} else {
		void window.loadFile(join(__dirname, '../renderer/index.html'))
	}
}

function showMainWindow(): void {
	if (!mainWindow) {
		createWindow()
		return
	}
	mainWindow.show()
	mainWindow.focus()
}

function scheduleTrayUnreadUpdate(): void {
	if (trayUnreadTimer) return
	trayUnreadTimer = setTimeout(() => {
		trayUnreadTimer = null
		if (tray && engine) setTrayUnread(tray, engine.inboxUnreadCount())
	}, TRAY_UNREAD_DEBOUNCE_MS)
}

function notifyNewMessages(messages: NewMessageInfo[]): void {
	if (!Notification.isSupported()) return

	let title = ''
	let body = ''
	if (messages.length === 1) {
		const message = messages[0]
		title = message.fromName !== '' ? message.fromName : message.fromAddress
		body = message.subject !== '' ? message.subject : '(no subject)'
	} else {
		title = `${messages.length} new messages`
		body = messages
			.slice(0, 3)
			.map((message) => (message.fromName !== '' ? message.fromName : message.fromAddress))
			.join(', ')
	}

	const notification = new Notification({ title, body })
	notification.on('click', showMainWindow)
	notification.show()
}

app.whenReady().then(() => {
	electronApp.setAppUserModelId('dev.neoworks.mail')

	app.on('browser-window-created', (_event, window) => {
		optimizer.watchWindowShortcuts(window)
	})

	engine = new MailEngine(
		(status) => broadcast('event:sync-status', status),
		(accountId, folderId) => {
			broadcast('event:messages-changed', { accountId, folderId })
			scheduleTrayUnreadUpdate()
		},
		(messages) => notifyNewMessages(messages),
		(status) => broadcast('event:embedding-status', status)
	)

	const mailEngine = engine
	outbox = new SendOutbox(
		(input) => mailEngine.sendMessage(input),
		{
			onSent: (sendId) => broadcast('event:send-done', { sendId }),
			onFailed: (sendId, errorMessage, input) =>
				broadcast('event:send-failed', { sendId, errorMessage, input })
		}
	)

	nibServer = new NibServer({
		mailDatabasePath: databasePath(),
		onReady: (endpoint) => broadcast('event:nib-ready', endpoint),
		onExit: (reason) => broadcast('event:nib-exit', { reason })
	})

	registerNibProtocol(nibServer)
	registerIpc(engine, nibServer, outbox)

	engine.startAllAccounts()
	// Start nib eagerly so the agent pane is ready when first opened; failures
	// (no checkout) surface in the pane via nib:status.
	void nibServer.start().catch(() => {})

	startDigestScheduler(() => broadcast('event:digest-due', null))

	tray = createTray({
		onShow: showMainWindow,
		onCompose: () => {
			showMainWindow()
			broadcast('event:open-compose', null)
		},
		onQuit: () => {
			quitting = true
			app.quit()
		}
	})
	scheduleTrayUnreadUpdate()

	createWindow()

	app.on('activate', () => {
		showMainWindow()
	})
})

let outboxFlushed = false

app.on('before-quit', (event) => {
	quitting = true
	// Undo-send holds mail back; quitting must not drop what the user sent.
	if (!outboxFlushed && outbox && outbox.pendingCount() > 0) {
		event.preventDefault()
		void outbox.flush().finally(() => {
			outboxFlushed = true
			app.quit()
		})
		return
	}
	if (engine) void engine.shutdown()
	if (nibServer) void nibServer.stop()
})

app.on('window-all-closed', () => {
	// Window closes hide to the tray instead; nothing to do here.
})
