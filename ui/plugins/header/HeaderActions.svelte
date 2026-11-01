<!--
  Compose, the theme switch and the assistant toggle, at the right of the bar.
-->
<script lang="ts">
	import { IconButton, themeMode } from '@neoworks/svelte-gpui-ui'
	import moon from '@phosphor-icons/core/regular/moon.svg'
	import pencilSimple from '@phosphor-icons/core/regular/pencil-simple.svg'
	import sparkle from '@phosphor-icons/core/regular/sparkle.svg'
	import sun from '@phosphor-icons/core/regular/sun.svg'
	import type { CommandsService } from '../../kernel/commands'
	import type { SettingsService } from '../../kernel/settings/service'

	let { commands, settings }: { commands: CommandsService; settings: SettingsService } = $props()

	const assistantOpen = $derived(settings.get('assistant.open', false))

	const themeIcon = $derived.by(() => {
		if (themeMode() === 'dark') return sun
		return moon
	})

	const themeLabel = $derived.by(() => {
		if (themeMode() === 'dark') return 'Light theme'
		return 'Dark theme'
	})
</script>

<IconButton
	icon={pencilSimple}
	label="New message"
	size="sm"
	onpress={() => void commands.run('compose.new')}
/>
<IconButton
	icon={themeIcon}
	label={themeLabel}
	size="sm"
	onpress={() => void commands.run('theme.toggle')}
/>
<IconButton
	icon={sparkle}
	label="Assistant"
	size="sm"
	selected={assistantOpen}
	onpress={() => void commands.run('assistant.toggle')}
/>
