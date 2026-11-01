// The nib agent server behind the assistant and the AI features. The plugin starts it eagerly,
// stops it when it unloads, and relays the UI's requests to it over its unix socket: a plain
// request comes back whole, and an event stream is pushed to the UI as `nib.stream` events.

import type { Context } from '@neoworks/extension-system'
import type { IncomingMessage } from 'node:http'
import type { NibRequest, NibResponse } from '../../../shared/routes'
import { createSseParser } from '../../nib/sse'
import { NibServer } from '../../nib/server'
import { nibRequest } from '../../nib/transport'

export const nib = {
	name: 'nib',
	inject: ['paths', 'rpc'],
	apply(ctx: Context) {
		const server = new NibServer({
			locations: { dataDirectory: ctx.paths.data, appRoot: ctx.paths.appRoot },
			mailDatabasePath: ctx.paths.file('mail.db'),
			onReady: (endpoint) => ctx.rpc.broadcast('nib.ready', endpoint),
			onExit: (reason) => ctx.rpc.broadcast('nib.exit', { reason })
		})
		const streams = new Map<number, IncomingMessage>()
		let nextStreamId = 1

		ctx.effect(() => {
			// Started eagerly so the assistant is ready when first opened; a missing checkout shows
			// in the assistant through `nib.status`.
			void server.start().catch(() => {})
			return async () => {
				for (const stream of streams.values()) stream.destroy()
				streams.clear()
				await server.stop()
			}
		}, 'nib server')

		const requireEndpoint = async () => {
			await server.start()
			const endpoint = server.endpoint()
			if (!endpoint) throw new Error('nib is not running')
			return endpoint
		}

		ctx.rpc.handle('nib.status', () => server.status())
		ctx.rpc.handle('nib.start', async () => {
			await server.start().catch(() => {})
			return server.status()
		})

		ctx.rpc.handle('nib.request', async (request) => relayRequest(await requireEndpoint(), request))

		ctx.rpc.handle('nib.openStream', async (path) => {
			const endpoint = await requireEndpoint()
			const response = await nibRequest(endpoint, { method: 'GET', path, headers: { accept: 'text/event-stream' } })
			if (response.statusCode !== 200) {
				response.resume()
				throw new Error(`nib answered HTTP ${response.statusCode} for ${path}`)
			}
			const streamId = nextStreamId
			nextStreamId += 1
			streams.set(streamId, response)
			relayStream(ctx, streamId, response, () => streams.delete(streamId))
			return streamId
		})

		ctx.rpc.handle('nib.closeStream', (streamId) => {
			const stream = streams.get(streamId)
			streams.delete(streamId)
			if (stream) stream.destroy()
		})
	}
}

async function relayRequest(endpoint: Parameters<typeof nibRequest>[0], request: NibRequest): Promise<NibResponse> {
	let body: string | Buffer | undefined = request.body
	if (request.body !== undefined && request.bodyEncoding === 'base64') {
		body = Buffer.from(request.body, 'base64')
	}
	const response = await nibRequest(endpoint, {
		method: request.method,
		path: request.path,
		headers: request.headers,
		body
	})
	const chunks: Buffer[] = []
	for await (const chunk of response) chunks.push(Buffer.from(chunk))
	return {
		status: response.statusCode ?? 502,
		headers: flattenHeaders(response.headers),
		body: Buffer.concat(chunks).toString('utf8')
	}
}

function relayStream(ctx: Context, streamId: number, response: IncomingMessage, onEnd: () => void): void {
	const feed = createSseParser((event) => {
		ctx.rpc.broadcast('nib.stream', { streamId, event: event.event, data: event.data, id: event.id })
	})
	response.setEncoding('utf8')
	response.on('data', (chunk: string) => feed(chunk))
	response.on('close', () => {
		onEnd()
		ctx.rpc.broadcast('nib.streamEnd', { streamId, error: null })
	})
	response.on('error', (error) => {
		onEnd()
		ctx.rpc.broadcast('nib.streamEnd', { streamId, error: error.message })
	})
}

function flattenHeaders(headers: IncomingMessage['headers']): Record<string, string> {
	const flat: Record<string, string> = {}
	for (const [name, value] of Object.entries(headers)) {
		if (value === undefined) continue
		if (Array.isArray(value)) {
			flat[name] = value.join(', ')
			continue
		}
		flat[name] = value
	}
	return flat
}
