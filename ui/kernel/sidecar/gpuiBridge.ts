// The sidecar bridge in the native app: the host's `sidecar_send` and `sidecar_status`
// commands, and the `sidecar:*` events it emits for each frame. Kept apart from the service
// so the service runs under `bun test`, where there is no host.

import { invoke, listen } from '@neoworks/svelte-gpui'
import type { RequestFrame, ResponseFrame } from '../../../shared/rpc'
import type { HostSidecarStatus, SidecarBridge } from './service'

declare module '@neoworks/svelte-gpui' {
	interface CommandMap {
		sidecar_send: { args: RequestFrame; result: null }
		sidecar_status: { args: Record<string, never>; result: HostSidecarStatus }
	}
}

export const gpuiBridge: SidecarBridge = {
	send: (frame) => invoke('sidecar_send', frame),
	onReply: (handler) => listen<ResponseFrame>('sidecar:reply', (frame) => handler(frame)),
	onEvent: (channel, handler) =>
		listen<unknown>(`sidecar:event:${channel}`, (payload) => handler(payload)),
	onExit: (handler) => listen<{ message: string }>('sidecar:exit', (exit) => handler(exit)),
	status: () => invoke('sidecar_status', {})
}
