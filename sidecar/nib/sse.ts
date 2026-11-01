// A server-sent event parser: feed it text as it arrives, and it calls back once per complete
// event. Only the fields nib sends are kept: `event`, `id` and `data`.

export interface ServerSentEvent {
	event: string
	id: string | null
	data: string
}

export function createSseParser(onEvent: (event: ServerSentEvent) => void): (chunk: string) => void {
	let buffered = ''
	let eventName = 'message'
	let eventId: string | null = null
	let dataLines: string[] = []

	const dispatch = (): void => {
		if (dataLines.length > 0) {
			onEvent({ event: eventName, id: eventId, data: dataLines.join('\n') })
		}
		eventName = 'message'
		eventId = null
		dataLines = []
	}

	const readLine = (line: string): void => {
		if (line === '') {
			dispatch()
			return
		}
		if (line.startsWith(':')) return
		const colon = line.indexOf(':')
		let field = line
		let value = ''
		if (colon !== -1) {
			field = line.slice(0, colon)
			value = line.slice(colon + 1)
			if (value.startsWith(' ')) value = value.slice(1)
		}
		if (field === 'event') eventName = value
		if (field === 'id') eventId = value
		if (field === 'data') dataLines.push(value)
	}

	return (chunk) => {
		buffered += chunk
		let newline = buffered.search(/\r?\n/)
		while (newline !== -1) {
			const line = buffered.slice(0, newline)
			const skip = buffered[newline] === '\r' ? 2 : 1
			buffered = buffered.slice(newline + skip)
			readLine(line)
			newline = buffered.search(/\r?\n/)
		}
	}
}
