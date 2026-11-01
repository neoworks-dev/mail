<!--
  Filter chips under the list's title, after Notion Mail: unread, flagged and with attachments
  toggle, and "From" narrows to one of the senders seen most in the list. They apply on top of
  the folder and category, and the list loads again from the top when one changes.
-->
<script lang="ts">
	import { View } from '@neoworks/svelte-gpui/ui'
	import { Chip, Menu, type MenuEntry } from '@neoworks/svelte-gpui-ui'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import envelopeIcon from '@phosphor-icons/core/regular/envelope-simple.svg'
	import paperclipIcon from '@phosphor-icons/core/regular/paperclip.svg'
	import starIcon from '@phosphor-icons/core/regular/star.svg'
	import userIcon from '@phosphor-icons/core/regular/user.svg'
	import type { MailboxService } from '../mailbox/service.svelte'
	import { frequentSenders, senderOptionLabel, type SenderOption } from './filters'

	let { mailbox }: { mailbox: MailboxService } = $props()

	const SENDER_MENU_SIZE = 12

	const filter = $derived(mailbox.state.filter)
	/** The chosen sender's name, kept from when it was picked since the list may not show it. */
	let chosenSenderName = $state('')

	const senderLabel = $derived.by(() => {
		if (filter.fromAddress === null) return 'From'
		if (chosenSenderName !== '') return `From: ${chosenSenderName}`
		return `From: ${filter.fromAddress}`
	})

	const senderItems = $derived.by((): MenuEntry[] => {
		const items: MenuEntry[] = []
		if (filter.fromAddress !== null) {
			items.push({ label: 'Anyone', onselect: () => chooseSender(null) })
			items.push({ type: 'divider' })
		}
		for (const option of frequentSenders(mailbox.state.threads, SENDER_MENU_SIZE)) {
			items.push({
				label: senderOptionLabel(option),
				shortcut: String(option.threadCount),
				selected: option.address === filter.fromAddress,
				onselect: () => chooseSender(option)
			})
		}
		return items
	})

	function chooseSender(option: SenderOption | null): void {
		if (option === null) {
			chosenSenderName = ''
			void mailbox.setFilter({ fromAddress: null })
			return
		}
		chosenSenderName = senderOptionLabel(option)
		void mailbox.setFilter({ fromAddress: option.address })
	}
</script>

<View
	style={{
		direction: 'row',
		align: 'center',
		gap: 6,
		wrap: true,
		rowGap: 6,
		paddingLeft: 16,
		paddingRight: 12,
		paddingBottom: 8
	}}
>
	<Chip
		variant="filter"
		label="Unread"
		icon={envelopeIcon}
		selected={filter.unread}
		onpress={() => void mailbox.setFilter({ unread: !filter.unread })}
	/>
	<Chip
		variant="filter"
		label="Flagged"
		icon={starIcon}
		selected={filter.flagged}
		onpress={() => void mailbox.setFilter({ flagged: !filter.flagged })}
	/>
	<Chip
		variant="filter"
		label="Attachments"
		icon={paperclipIcon}
		selected={filter.hasAttachments}
		onpress={() => void mailbox.setFilter({ hasAttachments: !filter.hasAttachments })}
	/>
	{#if senderItems.length > 0}
		<Menu items={senderItems} placement="bottom-start">
			{#snippet trigger(triggerProps)}
				<Chip
					variant="filter"
					label={senderLabel}
					icon={userIcon}
					trailingIcon={caretDownIcon}
					selected={filter.fromAddress !== null}
					onpress={triggerProps.onpress}
				/>
			{/snippet}
		</Menu>
	{/if}
</View>
