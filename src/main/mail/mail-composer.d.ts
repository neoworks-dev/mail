// @types/nodemailer only declares the directory specifier; mirror it for the
// explicit index.js path the ESM main bundle needs.
declare module 'nodemailer/lib/mail-composer/index.js' {
	import MailComposer from 'nodemailer/lib/mail-composer'
	export default MailComposer
}
