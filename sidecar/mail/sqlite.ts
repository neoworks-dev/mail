// The part of better-sqlite3's API the store was written against, over `bun:sqlite`. The
// differences it hides: a missing row is `undefined` rather than `null`, and a BLOB column
// reads as a Node `Buffer` (Bun returns a bare `Uint8Array`, whose `toString` is not text).

import { Database as BunDatabase, type Statement as BunStatement } from 'bun:sqlite'

export type SqlParameter = string | number | bigint | boolean | null | Uint8Array

export interface RunResult {
	changes: number
	lastInsertRowid: number | bigint
}

export class Statement {
	constructor(private statement: BunStatement) {}

	run(...parameters: SqlParameter[]): RunResult {
		const result = this.statement.run(...parameters)
		return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
	}

	get(...parameters: SqlParameter[]): unknown {
		const row = this.statement.get(...parameters)
		if (row === null) return undefined
		return withBuffers(row)
	}

	all(...parameters: SqlParameter[]): unknown[] {
		return this.statement.all(...parameters).map(withBuffers)
	}
}

export class Database {
	private database: BunDatabase
	private statements = new Map<string, Statement>()

	constructor(path: string) {
		this.database = new BunDatabase(path, { create: true })
	}

	/** Prepares a statement once per distinct SQL text and reuses it. */
	prepare(sql: string): Statement {
		const cached = this.statements.get(sql)
		if (cached) return cached
		const statement = new Statement(this.database.prepare(sql))
		this.statements.set(sql, statement)
		return statement
	}

	exec(sql: string): void {
		this.database.run(sql)
	}

	pragma(setting: string): void {
		this.database.run(`PRAGMA ${setting}`)
	}

	transaction<Arguments extends unknown[], Result>(
		body: (...args: Arguments) => Result
	): (...args: Arguments) => Result {
		return this.database.transaction(body) as unknown as (...args: Arguments) => Result
	}

	close(): void {
		this.statements.clear()
		this.database.close()
	}
}

function withBuffers(row: unknown): unknown {
	if (typeof row !== 'object' || row === null) return row
	const record = row as Record<string, unknown>
	for (const key of Object.keys(record)) {
		const value = record[key]
		if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
			record[key] = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
		}
	}
	return record
}
