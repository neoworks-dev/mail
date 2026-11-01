// Provides `sender`: sending over SMTP, keeping a copy in Sent, and drafts in the Drafts
// folder. Serves the immediate-send and draft routes; the delayed send with undo is the
// outbox plugin, built on this.

import type { Context } from '@neoworks/extension-system'
import type { OutgoingMessage } from '../../../shared/mail'
import { freshAccessToken } from '../../mail/auth'
import { parseRawMessage } from '../../mail/parse'
import { composeMail, sendMail, type ComposeInput } from '../../mail/send'
import type { AccountCredentials, MessageLocation } from '../../mail/store'
import { DRAFTS_FALLBACK_NAMES, SENT_FALLBACK_NAMES } from '../mail-ops'

declare module '@neoworks/extension-system' {
	interface Context {
		sender: Sender
	}
}

export interface Sender {
	sendMessage(input: OutgoingMessage): Promise<void>
	/** Sends a plain message from an account, for unsubscribe mail; no Sent copy is kept. */
	sendPlain(
		accountId: number,
		message: Pick<ComposeInput, 'to' | 'subject' | 'markdown'>
	): Promise<void>
	saveDraft(input: OutgoingMessage): Promise<number | null>
	discardDraft(messageId: number): Promise<void>
}

interface ReplyHeaders {
	inReplyTo: string | null
	references: string[]
	location: MessageLocation | null
}

export const send = {
	name: 'send',
	inject: ['store', 'mailOps', 'rpc'],
	apply(ctx: Context) {
		const sender = createSender(ctx)
		ctx.provide('sender', sender)
		ctx.rpc.handle('send.now', (input) => sender.sendMessage(input))
		ctx.rpc.handle('drafts.save', (input) => sender.saveDraft(input))
		ctx.rpc.handle('drafts.discard', (messageId) => sender.discardDraft(messageId))
	}
}

function createSender(ctx: Context): Sender {
	const logger = ctx.logger('send')

	const requireCredentials = (accountId: number): AccountCredentials => {
		const credentials = ctx.store.getCredentials(accountId)
		if (!credentials) throw new Error('account not found')
		return credentials
	}

	const smtpAccessToken = async (credentials: AccountCredentials): Promise<string | null> => {
		if (credentials.authType !== 'oauth') return null
		return freshAccessToken(ctx.store, credentials)
	}

	const resolveReplyHeaders = (input: OutgoingMessage): ReplyHeaders => {
		if (input.replyToMessageId === null) return { inReplyTo: null, references: [], location: null }
		const location = ctx.store.getMessageLocation(input.replyToMessageId)
		if (!location || location.rfcMessageId === '')
			return { inReplyTo: null, references: [], location }
		const body = ctx.store.getMessageBody(input.replyToMessageId)
		let references: string[] = []
		if (body) references = body.references
		return { inReplyTo: location.rfcMessageId, references, location }
	}

	const composeInput = (
		input: OutgoingMessage,
		from: string,
		reply: ReplyHeaders
	): ComposeInput => ({
		from,
		to: input.to,
		cc: input.cc,
		subject: input.subject,
		markdown: input.markdown,
		inReplyTo: reply.inReplyTo,
		references: reply.references,
		attachments: input.attachments
	})

	/** APPENDs the sent bytes to the Sent folder and mirrors them locally. */
	const storeSentCopy = async (accountId: number, raw: Buffer): Promise<void> => {
		const sent = ctx.store.findSpecialFolder(accountId, '\\Sent', SENT_FALLBACK_NAMES)
		if (!sent) {
			logger.warn('no sent folder found — sent message not stored')
			return
		}
		const connection = ctx.mailOps.opsFor(accountId)
		try {
			const uid = await connection.append(sent.path, raw, ['\\Seen'])
			if (uid === null) {
				await connection.syncFolder(sent.folderId, sent.path)
				return
			}
			const parsed = await parseRawMessage(
				raw,
				accountId,
				sent.folderId,
				uid,
				new Set(['\\Seen']),
				raw.length
			)
			ctx.store.insertMessage(parsed)
			ctx.emit('mail/messages-changed', accountId, sent.folderId)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			logger.warn(`storing sent copy failed: ${message}`)
		}
	}

	const discardDraft = async (messageId: number): Promise<void> => {
		const location = ctx.store.getMessageLocation(messageId)
		if (!location) return
		await ctx.mailOps.opsFor(location.accountId).permanentDelete(location.folderPath, location.uid)
		ctx.store.deleteMessageLocal(messageId)
		ctx.emit('mail/messages-changed', location.accountId, location.folderId)
	}

	return {
		discardDraft,

		async sendMessage(input) {
			const credentials = requireCredentials(input.accountId)
			const reply = resolveReplyHeaders(input)
			const composed = await sendMail(
				credentials,
				composeInput(input, credentials.email, reply),
				await smtpAccessToken(credentials)
			)
			if (reply.location) ctx.mailOps.setFlag(reply.location.messageId, 'answered', true)
			if (input.draftMessageId !== null) {
				await discardDraft(input.draftMessageId).catch((error: Error) => {
					logger.warn(`removing draft after send failed: ${error.message}`)
				})
			}
			await storeSentCopy(input.accountId, composed.raw)
		},

		async sendPlain(accountId, message) {
			const credentials = requireCredentials(accountId)
			await sendMail(
				credentials,
				{
					from: credentials.email,
					to: message.to,
					cc: '',
					subject: message.subject,
					markdown: message.markdown,
					inReplyTo: null,
					references: [],
					attachments: []
				},
				await smtpAccessToken(credentials)
			)
		},

		/** APPENDs the composer's state to Drafts, replacing the previous autosave. */
		async saveDraft(input) {
			const credentials = requireCredentials(input.accountId)
			const drafts = ctx.store.findSpecialFolder(input.accountId, '\\Drafts', DRAFTS_FALLBACK_NAMES)
			if (!drafts) {
				logger.warn('no drafts folder found — draft not saved')
				return null
			}
			const composed = await composeMail(
				composeInput(input, credentials.email, resolveReplyHeaders(input))
			)
			const connection = ctx.mailOps.opsFor(input.accountId)
			const uid = await connection.append(drafts.path, composed.raw, ['\\Draft', '\\Seen'])

			// The new draft is safely on the server; now drop the superseded one.
			if (input.draftMessageId !== null) {
				await discardDraft(input.draftMessageId).catch((error: Error) => {
					logger.warn(`removing superseded draft failed: ${error.message}`)
				})
			}
			if (uid === null) {
				await connection.syncFolder(drafts.folderId, drafts.path)
				return null
			}
			const flags = new Set(['\\Draft', '\\Seen'])
			const parsed = await parseRawMessage(
				composed.raw,
				input.accountId,
				drafts.folderId,
				uid,
				flags,
				composed.raw.length
			)
			const messageId = ctx.store.insertMessage(parsed)
			ctx.emit('mail/messages-changed', input.accountId, drafts.folderId)
			return messageId
		}
	}
}
