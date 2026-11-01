// Server names guessed from an address, filled in until the user edits them.

export interface ServerGuess {
	user: string
	imapHost: string | null
	smtpHost: string | null
}

export function guessFromEmail(email: string): ServerGuess {
	const domain = email.split('@')[1]
	if (!domain) return { user: email, imapHost: null, smtpHost: null }
	return { user: email, imapHost: `imap.${domain}`, smtpHost: `smtp.${domain}` }
}
