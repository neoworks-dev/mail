import { Menu, nativeImage, Tray } from 'electron'

// 16x16 envelope outline, light gray on transparent — generated PNG, embedded
// so the packaged app needs no icon asset on disk.
const TRAY_ICON_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPklEQVR4nGNgGB7gzp07/8nBWA0g' +
	'xTIUQWxsbJqxqkPXhM0QvGoIaSBoIC5n4wsXogzABwahAXcoSUhDGwAAmezIKQcfYdUAAAAASUVO' +
	'RK5CYII='

export interface TrayCallbacks {
	onShow: () => void
	onCompose: () => void
	onQuit: () => void
}

export function createTray(callbacks: TrayCallbacks): Tray {
	const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
	const tray = new Tray(icon)
	tray.setToolTip('Neomail')
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: 'Open Neomail', click: callbacks.onShow },
			{ label: 'Compose', click: callbacks.onCompose },
			{ type: 'separator' },
			{ label: 'Quit', click: callbacks.onQuit }
		])
	)
	tray.on('click', callbacks.onShow)
	return tray
}

export function setTrayUnread(tray: Tray, unreadCount: number): void {
	if (unreadCount === 0) {
		tray.setToolTip('Neomail')
		return
	}
	tray.setToolTip(`Neomail — ${unreadCount} unread`)
}
