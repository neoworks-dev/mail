<!--
  In the thread's toolbar: widens the reading area over the sidebar and the list, or brings them
  back.
-->
<script lang="ts">
	import { IconButton } from '@neoworks/svelte-gpui-ui'
	import arrowsInIcon from '@phosphor-icons/core/regular/arrows-in-simple.svg'
	import arrowsOutIcon from '@phosphor-icons/core/regular/arrows-out-simple.svg'
	import type { CommandsService } from '../../kernel/commands'
	import type { SettingsService } from '../../kernel/settings/service'
	import { READER_FOCUSED_SETTING } from './layout'

	let { commands, settings }: { commands: CommandsService; settings: SettingsService } = $props()

	const focused = $derived(settings.get(READER_FOCUSED_SETTING, false))

	function label(): string {
		if (focused) return 'Show the list (f)'
		return 'Full width (f)'
	}
</script>

<IconButton
	icon={arrowsOutIcon}
	selectedIcon={arrowsInIcon}
	selected={focused}
	label={label()}
	size="sm"
	onpress={() => void commands.run('frame.toggleReaderFocus')}
/>
