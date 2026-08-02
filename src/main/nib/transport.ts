// Talking to the embedded nib server over its unix socket. Everything nib
// exposes is plain HTTP on /v1, so this is a thin wrapper over node's http
// client with the socket wired in. Responses are handed back as streams: an
// SSE response never ends, and buffering one would hang whoever waits on it.

import { request as httpRequest, type IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'
import type { NibEndpoint } from '../../shared/nib'

export interface NibRequestOptions {
	method: string
	path: string
	headers?: Record<string, string>
	body?: Readable | string
}

/** Send a request to nib and resolve as soon as the response headers arrive. */
export function nibRequest(
	endpoint: NibEndpoint,
	{ method, path, headers, body }: NibRequestOptions
): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const outgoing = httpRequest({ ...endpoint, method, path, headers }, resolve)
		outgoing.on('error', reject)

		if (body === undefined) {
			outgoing.end()
			return
		}
		if (typeof body === 'string') {
			outgoing.end(body)
			return
		}
		body.pipe(outgoing)
	})
}

/** Forward a renderer request to nib and stream the reply straight back. */
export async function proxyToNib(endpoint: NibEndpoint, request: Request): Promise<Response> {
	const url = new URL(request.url)
	const incoming = await nibRequest(endpoint, {
		method: request.method,
		path: `${url.pathname}${url.search}`,
		headers: forwardedHeaders(request),
		body: requestBody(request)
	})

	return new Response(responseStream(incoming), {
		status: incoming.statusCode || 502,
		headers: responseHeaders(incoming)
	})
}

// A 204 or a 304 must not carry a body, and Response rejects one that does.
function responseStream(incoming: IncomingMessage): ReadableStream | null {
	const status = incoming.statusCode || 502
	if (status === 204 || status === 304) {
		incoming.resume()
		return null
	}
	return Readable.toWeb(incoming) as ReadableStream
}

function forwardedHeaders(request: Request): Record<string, string> {
	const headers: Record<string, string> = {}
	for (const [name, value] of request.headers) {
		// These describe the renderer's own origin and mean nothing to a server
		// reached over a socket.
		if (name === 'host' || name === 'origin' || name === 'referer') continue
		headers[name] = value
	}
	return headers
}

function requestBody(request: Request): Readable | undefined {
	if (request.body === null) return undefined
	return Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0])
}

function responseHeaders(incoming: IncomingMessage): Headers {
	const headers = new Headers()
	for (const [name, value] of Object.entries(incoming.headers)) {
		if (value === undefined) continue
		if (!Array.isArray(value)) {
			headers.set(name, value)
			continue
		}
		for (const entry of value) {
			headers.append(name, entry)
		}
	}
	return headers
}
