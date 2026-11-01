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
	body?: Readable | string | Buffer
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
		if (typeof body === 'string' || Buffer.isBuffer(body)) {
			outgoing.end(body)
			return
		}
		body.pipe(outgoing)
	})
}
