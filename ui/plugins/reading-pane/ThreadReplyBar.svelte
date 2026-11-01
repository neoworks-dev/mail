<!--
  Under the thread's last message, as in Gmail: reply and reply all to the newest message, or
  edit it when it is a draft.
-->
<script lang="ts">
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { Button, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import replyAllIcon from '@phosphor-icons/core/regular/arrow-bend-double-up-left.svg'
	import replyIcon from '@phosphor-icons/core/regular/arrow-bend-up-left.svg'
	import pencilIcon from '@phosphor-icons/core/regular/pencil-simple.svg'
	import type { ReadingTab } from '../reader/service.svelte'
	import { describeError } from './format'
	import { actionTarget, isDraftMessage, type ReadingServices } from './services'

	let {
		services,
		tab,
		paneIndex
	}: { services: ReadingServices; tab: ReadingTab; paneIndex: number } = $props()

	const theme = $derived(currentTheme())
	let actionError = $state<string | null>(null)

	const newest = $derived(tab.messages[tab.messages.length - 1])
	const target = $derived(actionTarget(services, tab))
	const isDraft = $derived(target !== null && isDraftMessage(services, target))

	async function run(action: () => Promise<void>): Promise<void> {
		actionError = null
		services.reader.setActivePane(paneIndex)
		try {
			await action()
		} catch (error) {
			actionError = describeError(error)
		}
	}

	async function reply(replyAll: boolean): Promise<void> {
		const message = newest
		if (!message) return
		await run(async () => {
			const body = await services.reader.loadBody(message.messageId)
			services.composer.openReply(message, body, replyAll)
		})
	}

	async function editDraft(): Promise<void> {
		const current = target
		if (!current) return
		await run(async () => {
			const body = await services.reader.loadBody(current.messageId)
			await services.composer.editDraft(current, body)
		})
	}
</script>

<View
	style={{
		direction: 'row',
		align: 'center',
		gap: 8,
		wrap: true,
		paddingX: 20,
		paddingTop: 16
	}}
>
	{#if isDraft}
		<Button icon={pencilIcon} onpress={() => void editDraft()}><Text>Edit draft</Text></Button>
	{:else}
		<Button icon={replyIcon} onpress={() => void reply(false)}><Text>Reply</Text></Button>
		<Button icon={replyAllIcon} onpress={() => void reply(true)}><Text>Reply all</Text></Button>
	{/if}
	{#if actionError}
		<Text style={{ ...typeStyle('caption'), color: theme.colors.danger, flex: 1, minWidth: 0 }}
			>{actionError}</Text
		>
	{/if}
</View>
