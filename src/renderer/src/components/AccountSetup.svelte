<script lang="ts">
	import { Button, Card, LoadingSpinner } from '@neoworks-dev/ui'
	import { mailState } from '../state/mail.svelte'

	interface Props {
		/** Rendered as an overlay with a close button instead of full screen. */
		modal?: boolean
	}

	let { modal = false }: Props = $props()

	type SetupMode = 'imap' | 'gmail'
	let mode = $state<SetupMode>('imap')

	let email = $state('')
	let imapHost = $state('')
	let imapPort = $state(993)
	let smtpHost = $state('')
	let smtpPort = $state(465)
	let imapUser = $state('')
	let imapPassword = $state('')
	let useTls = $state(true)
	let connecting = $state(false)
	let errorMessage = $state<string | null>(null)

	// Gmail OAuth: one app-wide Google client, configured once; after that
	// every sign-in is a single click in the browser.
	let gmailConfigured = $state<boolean | null>(null)
	let gmailClientId = $state('')
	let gmailClientSecret = $state('')

	$effect(() => {
		if (mode !== 'gmail' || gmailConfigured !== null) return
		void window.neomail.accounts.gmailClientConfigured().then((configured) => {
			gmailConfigured = configured
		})
	})

	// Convenience: derive hosts/user from the address until the user edits them.
	let hostTouched = $state(false)
	let smtpHostTouched = $state(false)
	let userTouched = $state(false)

	function onEmailInput(): void {
		if (!userTouched) imapUser = email
		const domain = email.split('@')[1]
		if (!domain) return
		if (!hostTouched) imapHost = `imap.${domain}`
		if (!smtpHostTouched) smtpHost = `smtp.${domain}`
	}

	function close(): void {
		mailState.accountSetupOpen = false
	}

	async function connect(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		connecting = true
		errorMessage = null
		try {
			const account = await window.neomail.accounts.add({
				email,
				imapHost,
				imapPort: Number(imapPort),
				imapUser,
				imapPassword,
				useTls,
				smtpHost,
				smtpPort: Number(smtpPort)
			})
			await mailState.addAccount(account)
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			connecting = false
		}
	}

	async function connectGmail(event: SubmitEvent): Promise<void> {
		event.preventDefault()
		connecting = true
		errorMessage = null
		try {
			if (gmailConfigured !== true) {
				await window.neomail.accounts.setGmailClientConfig({
					clientId: gmailClientId,
					clientSecret: gmailClientSecret
				})
				gmailConfigured = true
			}
			const account = await window.neomail.accounts.addGmail()
			await mailState.addAccount(account)
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error)
		} finally {
			connecting = false
		}
	}
</script>

{#snippet setupCard()}
	<Card surface="elevated" padding="lg" class="w-[420px]">
		<div class="flex flex-col gap-4">
			<div class="flex items-start justify-between">
				<div>
					<h1 class="text-lg font-semibold">Add a mail account</h1>
					<p class="text-muted mt-1 text-sm">
						{#if mode === 'imap'}
							IMAP credentials — password or app password.
						{:else}
							Sign in with Google via your own OAuth client.
						{/if}
					</p>
				</div>
				{#if modal}
					<button type="button" class="text-faint hover:text-default text-sm" onclick={close}>✕</button>
				{/if}
			</div>

			<div class="border-line flex gap-1 rounded-lg border p-1">
				<button
					type="button"
					class="flex-1 rounded-md px-3 py-1.5 text-sm {mode === 'imap' ? 'bg-raised font-medium' : 'text-muted'}"
					onclick={() => (mode = 'imap')}
				>
					IMAP password
				</button>
				<button
					type="button"
					class="flex-1 rounded-md px-3 py-1.5 text-sm {mode === 'gmail' ? 'bg-raised font-medium' : 'text-muted'}"
					onclick={() => (mode = 'gmail')}
				>
					Gmail (OAuth)
				</button>
			</div>

			{#if mode === 'imap'}
				<form onsubmit={connect} class="flex flex-col gap-4">
					<label class="flex flex-col gap-1 text-sm">
						<span class="text-muted">Email address</span>
						<input
							type="email"
							bind:value={email}
							oninput={onEmailInput}
							required
							class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
							placeholder="you@example.com"
						/>
					</label>

					<div class="flex gap-3">
						<label class="flex flex-1 flex-col gap-1 text-sm">
							<span class="text-muted">IMAP host</span>
							<input
								type="text"
								bind:value={imapHost}
								oninput={() => (hostTouched = true)}
								required
								class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
								placeholder="imap.example.com"
							/>
						</label>
						<label class="flex w-24 flex-col gap-1 text-sm">
							<span class="text-muted">Port</span>
							<input
								type="number"
								bind:value={imapPort}
								required
								class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
							/>
						</label>
					</div>

					<div class="flex gap-3">
						<label class="flex flex-1 flex-col gap-1 text-sm">
							<span class="text-muted">SMTP host</span>
							<input
								type="text"
								bind:value={smtpHost}
								oninput={() => (smtpHostTouched = true)}
								required
								class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
								placeholder="smtp.example.com"
							/>
						</label>
						<label class="flex w-24 flex-col gap-1 text-sm">
							<span class="text-muted">Port</span>
							<input
								type="number"
								bind:value={smtpPort}
								required
								class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
							/>
						</label>
					</div>

					<label class="flex flex-col gap-1 text-sm">
						<span class="text-muted">Username</span>
						<input
							type="text"
							bind:value={imapUser}
							oninput={() => (userTouched = true)}
							required
							class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
						/>
					</label>

					<label class="flex flex-col gap-1 text-sm">
						<span class="text-muted">Password</span>
						<input
							type="password"
							bind:value={imapPassword}
							required
							class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
						/>
					</label>

					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={useTls} />
						<span>Use TLS (port 993)</span>
					</label>

					{#if errorMessage}
						<p class="text-red text-sm">{errorMessage}</p>
					{/if}

					<Button type="submit" variant="primary" full disabled={connecting}>
						{#if connecting}
							<LoadingSpinner size={16} class="mr-2" /> Connecting…
						{:else}
							Connect
						{/if}
					</Button>
				</form>
			{:else}
				<form onsubmit={connectGmail} class="flex flex-col gap-4">
					{#if gmailConfigured === null}
						<div class="flex justify-center py-4">
							<LoadingSpinner size={20} />
						</div>
					{:else if gmailConfigured === false}
						<p class="text-muted text-xs">
							One-time setup: Google requires a registered OAuth client. Create one in the Google
							Cloud Console (type "Desktop app", Gmail API enabled) and paste it here — it is
							stored app-wide, and every future sign-in is just the button below.
						</p>

						<label class="flex flex-col gap-1 text-sm">
							<span class="text-muted">OAuth client ID</span>
							<input
								type="text"
								bind:value={gmailClientId}
								required
								class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
								placeholder="….apps.googleusercontent.com"
							/>
						</label>

						<label class="flex flex-col gap-1 text-sm">
							<span class="text-muted">OAuth client secret</span>
							<input
								type="password"
								bind:value={gmailClientSecret}
								required
								class="border-line bg-canvas rounded-lg border px-3 py-2 outline-none focus:border-line-strong"
							/>
						</label>
					{:else}
						<p class="text-muted text-sm">
							Your browser opens to the Google sign-in page; pick the account and Neomail does the
							rest — the address is detected automatically.
						</p>
					{/if}

					{#if errorMessage}
						<p class="text-red text-sm">{errorMessage}</p>
					{/if}

					{#if gmailConfigured !== null}
						<Button type="submit" variant="primary" full disabled={connecting}>
							{#if connecting}
								<LoadingSpinner size={16} class="mr-2" /> Waiting for Google sign-in…
							{:else}
								Sign in with Google
							{/if}
						</Button>
					{/if}
				</form>
			{/if}
		</div>
	</Card>
{/snippet}

{#if modal}
	<div class="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 py-8">
		{@render setupCard()}
	</div>
{:else}
	<div class="flex h-full items-center justify-center">
		{@render setupCard()}
	</div>
{/if}
