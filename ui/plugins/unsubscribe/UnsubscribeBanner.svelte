<!--
  "Mailing list · Unsubscribe", asking once more before it acts, then saying how it went.
-->
<script lang="ts">
	import { Text } from '@neoworks/svelte-gpui/ui'
	import { Button, typeStyle } from '@neoworks/svelte-gpui-ui'
	import listIcon from '@phosphor-icons/core/regular/newspaper.svg'
	import type { MessageBody, ThreadMessage } from '../../../shared/mail'
	import type { SidecarService } from '../../kernel/sidecar/service'
	import Banner from '../reading-pane/Banner.svelte'

	let {
		message,
		body,
		sidecar
	}: { message: ThreadMessage; body: MessageBody; sidecar: SidecarService } = $props()

	type Step = 'idle' | 'confirm' | 'working' | 'done' | 'failed'

	const OUTCOMES: Record<'posted' | 'sent' | 'opened', string> = {
		posted: 'Unsubscribed — the list may take a few days to stop sending.',
		sent: 'Unsubscribe request sent by email — the list may take a few days to stop sending.',
		opened: 'The list’s unsubscribe page opened in your browser.'
	}

	let step = $state<Step>('idle')
	let outcome = $state('')

	const tone = $derived.by(() => {
		if (step === 'failed') return 'danger'
		return 'neutral'
	})

	async function run(): Promise<void> {
		step = 'working'
		try {
			const result = await sidecar.call('messages.unsubscribe', message.messageId)
			outcome = OUTCOMES[result]
			step = 'done'
		} catch (error) {
			outcome = error instanceof Error ? error.message : String(error)
			step = 'failed'
		}
	}
</script>

{#if body.unsubscribe}
	{#if step === 'done'}
		<Banner tone="success" icon={listIcon}>
			<Text style={typeStyle('caption')}>{outcome}</Text>
		</Banner>
	{:else}
		<Banner icon={listIcon} {tone}>
			{#if step === 'failed'}
				<Text style={typeStyle('caption')}>Unsubscribing failed: {outcome}</Text>
			{:else if step === 'confirm'}
				<Text style={typeStyle('caption')}>Really unsubscribe from this mailing list?</Text>
			{:else if step === 'working'}
				<Text style={typeStyle('caption')}>Unsubscribing…</Text>
			{:else}
				<Text style={typeStyle('caption')}>Mailing list</Text>
			{/if}
			{#snippet actions()}
				{#if step === 'confirm'}
					<Button variant="danger" size="sm" onpress={() => void run()}
						><Text>Unsubscribe</Text></Button
					>
					<Button variant="ghost" size="sm" onpress={() => (step = 'idle')}
						><Text>Cancel</Text></Button
					>
				{:else if step === 'idle' || step === 'failed'}
					<Button variant="ghost" size="sm" onpress={() => (step = 'confirm')}
						><Text>Unsubscribe</Text></Button
					>
				{/if}
			{/snippet}
		</Banner>
	{/if}
{/if}
