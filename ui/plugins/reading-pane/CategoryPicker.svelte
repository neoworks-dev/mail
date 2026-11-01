<!--
  The thread's category under its subject, as quiet text that opens a menu of the categories,
  as Notion Mail's "Add label". It applies to the message the toolbar's actions do.
-->
<script lang="ts">
	import { Icon, Text, View } from '@neoworks/svelte-gpui/ui'
	import { currentTheme, Menu, typeStyle, type MenuEntry } from '@neoworks/svelte-gpui-ui'
	import caretDownIcon from '@phosphor-icons/core/regular/caret-down.svg'
	import { ALL_MAIL_LABELS, type ThreadMessage } from '../../../shared/mail'
	import { labelIcon, labelIconColor, labelTitle } from '../../components/message-list/labels'
	import type { ReadingTab } from '../reader/service.svelte'
	import { describeError } from './format'
	import { actionTarget, type ReadingServices } from './services'

	let { services, tab }: { services: ReadingServices; tab: ReadingTab } = $props()

	const theme = $derived(currentTheme())
	const target = $derived(actionTarget(services, tab))
	let failure = $state<string | null>(null)

	const items = $derived.by((): MenuEntry[] => {
		const current = target
		if (!current) return []
		const choices: MenuEntry[] = [
			{
				label: 'No category',
				selected: current.label === null,
				onselect: () => setLabel(current, null)
			}
		]
		for (const label of ALL_MAIL_LABELS) {
			choices.push({
				label: labelTitle(label),
				selected: current.label === label,
				onselect: () => setLabel(current, label)
			})
		}
		return choices
	})

	function setLabel(message: ThreadMessage, label: string | null): void {
		if (label === message.label) return
		failure = null
		services.mailbox.setLabel(message, label).catch((error: unknown) => {
			failure = describeError(error)
		})
	}

	function currentLabel(): string | null {
		if (!target) return null
		return target.label
	}
</script>

{#if target}
	<Menu {items} placement="bottom-start">
		{#snippet trigger(triggerProps)}
			<View
				style={{
					direction: 'row',
					align: 'center',
					gap: 6,
					paddingX: 6,
					height: 26,
					radius: 8,
					color: theme.colors.faint,
					cursor: 'pointer',
					...typeStyle('caption'),
					fontSize: 13.5
				}}
				hover={{ background: theme.colors.hover, color: theme.colors.text }}
				onpress={triggerProps.onpress}
			>
				{#if currentLabel() === null}
					<Text>Add category</Text>
				{:else}
					<Icon
						svg={labelIcon(currentLabel() || '')}
						size={14}
						color={labelIconColor(theme, currentLabel() || '')}
					/>
					<Text style={{ color: theme.colors.muted }}>{labelTitle(currentLabel() || '')}</Text>
					<Icon svg={caretDownIcon} size={11} />
				{/if}
			</View>
		{/snippet}
	</Menu>
	{#if failure}
		<Text
			style={{
				...typeStyle('caption'),
				color: theme.colors.danger,
				marginLeft: 8,
				alignSelf: 'center',
				truncate: true
			}}>{failure}</Text
		>
	{/if}
{/if}
