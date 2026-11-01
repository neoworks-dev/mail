<!--
  Back and forward through what the reading pane showed.
-->
<script lang="ts">
	import { IconButton } from '@neoworks/svelte-gpui-ui'
	import arrowLeft from '@phosphor-icons/core/regular/arrow-left.svg'
	import arrowRight from '@phosphor-icons/core/regular/arrow-right.svg'
	import type { CommandsService } from '../../kernel/commands'
	import type { ReaderService } from '../reader/service.svelte'

	let { reader, commands }: { reader: ReaderService; commands: CommandsService } = $props()
</script>

<IconButton
	icon={arrowLeft}
	label="Back"
	size="sm"
	disabled={!reader.canGoBack}
	onpress={() => void commands.run('reader.back')}
/>
<IconButton
	icon={arrowRight}
	label="Forward"
	size="sm"
	disabled={!reader.canGoForward}
	onpress={() => void commands.run('reader.forward')}
/>
