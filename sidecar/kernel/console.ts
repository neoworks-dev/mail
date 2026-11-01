// Stdout carries frames to the host and nothing else, so a stray `console.log` from a plugin
// or a library would corrupt the stream. Everything printed goes to stderr, which the host
// passes through to its own log. Imported first by the entry, before any library loads.

const writeToStderr = (...values: unknown[]): void => {
	console.error(...values)
}

console.log = writeToStderr
console.info = writeToStderr
console.debug = writeToStderr
