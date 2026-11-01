// The sidecar's end of the frame stream: one JSON frame per line, requests in on stdin and
// responses and events out on stdout. Stdin closing means the host is gone or wants the
// sidecar to stop.

import { isFrame, type Frame } from '../../shared/rpc'

export interface Transport {
	/** Calls `handler` with every frame that arrives. */
	onFrame(handler: (frame: Frame) => void): void
	/** Calls `handler` once the other end has closed. */
	onClose(handler: () => void): void
	send(frame: Frame): void
}

/** Frames over this process's stdin and stdout. */
export function stdioTransport(): Transport {
	const frameHandlers: Array<(frame: Frame) => void> = []
	const closeHandlers: Array<() => void> = []
	let buffered = ''

	process.stdin.setEncoding('utf8')
	process.stdin.on('data', (chunk: string) => {
		buffered += chunk
		let newline = buffered.indexOf('\n')
		while (newline !== -1) {
			const line = buffered.slice(0, newline)
			buffered = buffered.slice(newline + 1)
			deliverLine(line, frameHandlers)
			newline = buffered.indexOf('\n')
		}
	})
	let closed = false
	const close = (): void => {
		if (closed) return
		closed = true
		for (const handler of closeHandlers) handler()
	}
	process.stdin.on('end', close)
	// A write after the host went away fails with EPIPE; that is the host closing too.
	process.stdout.on('error', close)

	return {
		onFrame: (handler) => frameHandlers.push(handler),
		onClose: (handler) => closeHandlers.push(handler),
		send: (frame) => {
			if (closed) return
			process.stdout.write(`${JSON.stringify(frame)}\n`)
		}
	}
}

function deliverLine(line: string, handlers: Array<(frame: Frame) => void>): void {
	if (line.trim() === '') return
	let parsed: unknown
	try {
		parsed = JSON.parse(line)
	} catch {
		console.error(`[sidecar] a line on stdin was not JSON: ${line.slice(0, 200)}`)
		return
	}
	if (!isFrame(parsed)) {
		console.error(`[sidecar] a line on stdin was not a frame: ${line.slice(0, 200)}`)
		return
	}
	for (const handler of handlers) handler(parsed)
}
