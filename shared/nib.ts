export interface NibEndpoint {
	socketPath?: string
	host?: string
	port?: number
}

export interface NibStatus {
	running: boolean
	pid: number | null
	endpoint: NibEndpoint | null
	source: string | null
	error: string | null
}
