// Provides `assistant`: follows the agent's session, carries out what the agent asks of the
// window, tells the agent which thread the user is reading, and registers the AI commands. The
// morning digest starts here when the sidecar says it is due.

import type { Context } from '@neoworks/extension-system'
import checksIcon from '@phosphor-icons/core/regular/list-checks.svg'
import packageIcon from '@phosphor-icons/core/regular/package.svg'
import sparkleIcon from '@phosphor-icons/core/regular/sparkle.svg'
import { AssistantService } from './service.svelte'

export const assistant = {
	name: 'assistant',
	inject: ['sidecar', 'reader', 'commands', 'keymap'],
	async apply(ctx: Context) {
		const service = new AssistantService(ctx)
		ctx.provide('assistant', service)

		ctx.sidecar.on('assistant.status', (status) => {
			service.state.status = status
		})
		ctx.sidecar.on('assistant.view', (view) => {
			const turnEnded = service.state.view.running && !view.running
			service.state.view = view
			if (turnEnded) service.settleUnanswered()
		})
		ctx.sidecar.on('assistant.request', (request) => void service.handleRequest(request))
		ctx.sidecar.on('digest.due', () => void service.generateDigest(true))
		ctx.on('reader/opened', (accountId, threadId, messages) => {
			const latest = messages[messages.length - 1]
			if (!latest) return
			void ctx.sidecar
				.call('assistant.setContext', {
					view: 'thread',
					accountId: String(accountId),
					threadId: String(threadId),
					messageId: String(latest.messageId),
					subject: latest.subject,
					from: latest.fromAddress
				})
				.catch(() => {})
		})

		// The prompt commands need the prompts, so they register once those are loaded.
		await service.load()
		registerCommands(ctx, service)
	}
}

function registerCommands(ctx: Context, service: AssistantService): void {
	const hasThread = () => service.available && ctx.reader.openThreadId !== null
	const hasSummary = () => {
		const threadId = ctx.reader.openThreadId
		return threadId !== null && service.state.summaries[threadId] !== undefined
	}
	ctx.commands.register({
		id: 'assistant.summarize',
		title: 'Summarize conversation',
		group: 'Assistant',
		menu: 'thread.more',
		icon: sparkleIcon,
		when: () => hasThread() && !hasSummary(),
		run: async () => {
			const threadId = ctx.reader.openThreadId
			if (threadId !== null) await service.summarize(threadId)
		}
	})
	ctx.commands.register({
		id: 'assistant.extractActions',
		title: 'Extract action items',
		group: 'Assistant',
		menu: 'thread.more',
		icon: checksIcon,
		when: () => service.available && ctx.reader.actionTarget !== null,
		run: async () => {
			const target = ctx.reader.actionTarget
			if (target) await service.extractActions(target)
		}
	})
	ctx.commands.register({
		id: 'assistant.extractShipment',
		title: 'Find shipment tracking',
		group: 'Assistant',
		menu: 'thread.more',
		icon: packageIcon,
		when: () => service.available && ctx.reader.actionTarget !== null,
		run: async () => {
			const target = ctx.reader.actionTarget
			if (target) await service.extractShipment(target)
		}
	})
	ctx.commands.register({
		id: 'assistant.digest',
		title: 'Daily digest',
		group: 'Assistant',
		when: () => service.available,
		run: () => service.generateDigest(false)
	})
	ctx.commands.register({
		id: 'assistant.focus',
		title: 'Bring the agent here',
		group: 'Assistant',
		when: () => service.available,
		run: () => service.focusHere()
	})
	ctx.commands.register({
		id: 'assistant.cancel',
		title: 'Stop the agent',
		group: 'Assistant',
		when: () => service.state.view.running,
		run: () => service.cancel()
	})
	for (const prompt of service.state.prompts) {
		ctx.commands.register({
			id: `assistant.prompt.${prompt.name}`,
			title: `Ask: ${prompt.description || prompt.name}`,
			group: 'Assistant',
			when: () => service.available,
			run: () => service.runPrompt(prompt, '')
		})
	}
}
