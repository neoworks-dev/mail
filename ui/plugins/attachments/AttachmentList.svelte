<!--
  The message's attachments as chips with their sizes; inline parts, drawn in the body, are
  left out.
-->
<script lang="ts">
	import { files } from '@neoworks/svelte-gpui'
	import { Text, View } from '@neoworks/svelte-gpui/ui'
	import { Chip, currentTheme, typeStyle } from '@neoworks/svelte-gpui-ui'
	import paperclipIcon from '@phosphor-icons/core/regular/paperclip.svg'
	import type { AttachmentMeta, MessageBody } from '../../../shared/mail'
	import type { SidecarService } from '../../kernel/sidecar/service'
	import { formatSize } from '../reading-pane/format'

	let { body, sidecar }: { body: MessageBody; sidecar: SidecarService } = $props()

	const theme = $derived(currentTheme())
	const attached = $derived(body.attachments.filter((attachment) => !attachment.isInline))
	let notice = $state<{ text: string; failed: boolean } | null>(null)

	function fileName(attachment: AttachmentMeta): string {
		if (attachment.filename !== '') return attachment.filename
		return 'attachment'
	}

	async function save(attachment: AttachmentMeta): Promise<void> {
		notice = null
		try {
			const path = await files.pickSavePath({ name: fileName(attachment) })
			if (path === null) return
			const saved = await sidecar.call('attachments.saveTo', attachment.attachmentId, path)
			notice = { text: `Saved to ${saved}`, failed: false }
		} catch (error) {
			notice = { text: error instanceof Error ? error.message : String(error), failed: true }
		}
	}

	function noticeColor(failed: boolean): string {
		if (failed) return theme.colors.danger
		return theme.colors.muted
	}
</script>

{#if attached.length > 0}
	<View style={{ paddingX: 20, paddingBottom: 14, gap: 6 }}>
		<View style={{ direction: 'row', wrap: true, gap: 6 }}>
			{#each attached as attachment (attachment.attachmentId)}
				<Chip
					label="{fileName(attachment)} · {formatSize(attachment.size)}"
					icon={paperclipIcon}
					onpress={() => void save(attachment)}
				/>
			{/each}
		</View>
		{#if notice}
			<Text style={{ ...typeStyle('caption'), color: noticeColor(notice.failed) }}
				>{notice.text}</Text
			>
		{/if}
	</View>
{/if}
