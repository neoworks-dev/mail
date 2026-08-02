import Database from 'better-sqlite3'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Schema notes:
// - Multi-account from day one: every message row carries account_id.
// - message_search holds the one plain-text copy FTS5 indexes (external
//   content), so snippet()/highlight() work without duplicating tokens.
// - message_embeddings is the slot for later context embeddings; unused today.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
	account_id INTEGER PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	imap_host TEXT NOT NULL,
	imap_port INTEGER NOT NULL,
	imap_user TEXT NOT NULL,
	imap_password_encrypted BLOB NOT NULL,
	use_tls INTEGER NOT NULL DEFAULT 1,
	smtp_host TEXT,
	smtp_port INTEGER,
	auth_type TEXT NOT NULL DEFAULT 'password',
	oauth_client_id TEXT,
	oauth_client_secret_encrypted BLOB,
	oauth_refresh_token_encrypted BLOB,
	oauth_access_token TEXT,
	oauth_token_expires_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS folders (
	folder_id INTEGER PRIMARY KEY,
	account_id INTEGER NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
	path TEXT NOT NULL,
	name TEXT NOT NULL,
	delimiter TEXT,
	special_use TEXT,
	uidvalidity INTEGER,
	last_seen_uid INTEGER NOT NULL DEFAULT 0,
	highest_modseq TEXT,
	UNIQUE(account_id, path)
);

CREATE TABLE IF NOT EXISTS messages (
	message_id INTEGER PRIMARY KEY,
	account_id INTEGER NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
	folder_id INTEGER NOT NULL REFERENCES folders(folder_id) ON DELETE CASCADE,
	uid INTEGER NOT NULL,
	rfc_message_id TEXT NOT NULL DEFAULT '',
	in_reply_to TEXT,
	references_json TEXT NOT NULL DEFAULT '[]',
	subject TEXT NOT NULL DEFAULT '',
	from_name TEXT NOT NULL DEFAULT '',
	from_address TEXT NOT NULL DEFAULT '',
	to_json TEXT NOT NULL DEFAULT '[]',
	cc_json TEXT NOT NULL DEFAULT '[]',
	date TEXT NOT NULL,
	snippet TEXT NOT NULL DEFAULT '',
	seen INTEGER NOT NULL DEFAULT 0,
	flagged INTEGER NOT NULL DEFAULT 0,
	answered INTEGER NOT NULL DEFAULT 0,
	has_attachments INTEGER NOT NULL DEFAULT 0,
	size INTEGER NOT NULL DEFAULT 0,
	thread_id INTEGER,
	label TEXT,
	label_source TEXT,
	list_unsubscribe TEXT,
	list_unsubscribe_one_click INTEGER NOT NULL DEFAULT 0,
	auth_results_json TEXT,
	UNIQUE(folder_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_messages_folder_date ON messages(folder_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_rfc_id ON messages(rfc_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_in_reply_to ON messages(in_reply_to);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_label ON messages(label);
CREATE INDEX IF NOT EXISTS idx_messages_from_address ON messages(account_id, from_address);

CREATE TABLE IF NOT EXISTS message_bodies (
	message_id INTEGER PRIMARY KEY REFERENCES messages(message_id) ON DELETE CASCADE,
	text_body TEXT,
	html_body TEXT
);

CREATE TABLE IF NOT EXISTS message_search (
	message_id INTEGER PRIMARY KEY REFERENCES messages(message_id) ON DELETE CASCADE,
	subject TEXT NOT NULL DEFAULT '',
	from_text TEXT NOT NULL DEFAULT '',
	recipients TEXT NOT NULL DEFAULT '',
	body TEXT NOT NULL DEFAULT ''
);

CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
	subject, from_text, recipients, body,
	content='message_search',
	content_rowid='message_id',
	tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS message_search_ai AFTER INSERT ON message_search BEGIN
	INSERT INTO message_fts(rowid, subject, from_text, recipients, body)
	VALUES (new.message_id, new.subject, new.from_text, new.recipients, new.body);
END;

CREATE TRIGGER IF NOT EXISTS message_search_ad AFTER DELETE ON message_search BEGIN
	INSERT INTO message_fts(message_fts, rowid, subject, from_text, recipients, body)
	VALUES ('delete', old.message_id, old.subject, old.from_text, old.recipients, old.body);
END;

CREATE TRIGGER IF NOT EXISTS message_search_au AFTER UPDATE ON message_search BEGIN
	INSERT INTO message_fts(message_fts, rowid, subject, from_text, recipients, body)
	VALUES ('delete', old.message_id, old.subject, old.from_text, old.recipients, old.body);
	INSERT INTO message_fts(rowid, subject, from_text, recipients, body)
	VALUES (new.message_id, new.subject, new.from_text, new.recipients, new.body);
END;

CREATE TABLE IF NOT EXISTS attachments (
	attachment_id INTEGER PRIMARY KEY,
	message_id INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
	filename TEXT NOT NULL DEFAULT '',
	content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
	size INTEGER NOT NULL DEFAULT 0,
	content_id TEXT,
	is_inline INTEGER NOT NULL DEFAULT 0,
	content BLOB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS message_extractions (
	message_id INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
	kind TEXT NOT NULL,
	source TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (message_id, kind)
);

CREATE TABLE IF NOT EXISTS message_embeddings (
	message_id INTEGER NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
	chunk_index INTEGER NOT NULL,
	model TEXT NOT NULL,
	vector BLOB NOT NULL,
	PRIMARY KEY (message_id, chunk_index, model)
);
`

let databaseInstance: Database.Database | null = null

export function databasePath(): string {
	return join(app.getPath('userData'), 'mail.db')
}

export function openDatabase(): Database.Database {
	if (databaseInstance) return databaseInstance

	mkdirSync(app.getPath('userData'), { recursive: true })
	const database = new Database(databasePath())
	database.pragma('journal_mode = WAL')
	database.pragma('foreign_keys = ON')
	migrateExistingTables(database)
	database.exec(SCHEMA)
	databaseInstance = database
	return database
}

/**
 * CREATE IF NOT EXISTS only covers fresh databases; columns added after the
 * first release must be bolted onto existing tables here.
 */
function migrateExistingTables(database: Database.Database): void {
	addColumnIfMissing(database, 'accounts', 'smtp_host', 'TEXT')
	addColumnIfMissing(database, 'accounts', 'smtp_port', 'INTEGER')
	addColumnIfMissing(database, 'accounts', 'auth_type', "TEXT NOT NULL DEFAULT 'password'")
	addColumnIfMissing(database, 'accounts', 'oauth_client_id', 'TEXT')
	addColumnIfMissing(database, 'accounts', 'oauth_client_secret_encrypted', 'BLOB')
	addColumnIfMissing(database, 'accounts', 'oauth_refresh_token_encrypted', 'BLOB')
	addColumnIfMissing(database, 'accounts', 'oauth_access_token', 'TEXT')
	addColumnIfMissing(database, 'accounts', 'oauth_token_expires_at', 'TEXT')
	addColumnIfMissing(database, 'messages', 'thread_id', 'INTEGER')
	addColumnIfMissing(database, 'messages', 'label', 'TEXT')
	addColumnIfMissing(database, 'messages', 'label_source', 'TEXT')
	addColumnIfMissing(database, 'messages', 'list_unsubscribe', 'TEXT')
	addColumnIfMissing(database, 'messages', 'list_unsubscribe_one_click', 'INTEGER NOT NULL DEFAULT 0')
	addColumnIfMissing(database, 'messages', 'auth_results_json', 'TEXT')
	// TEXT: MODSEQ is a 63-bit counter, past Number.MAX_SAFE_INTEGER territory.
	addColumnIfMissing(database, 'folders', 'highest_modseq', 'TEXT')
}

function addColumnIfMissing(
	database: Database.Database,
	table: string,
	column: string,
	type: string
): void {
	const exists = database
		.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
		.get(table, column)
	if (exists) return
	const tablePresent = database
		.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
		.get(table)
	if (!tablePresent) return
	database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}

export function closeDatabase(): void {
	if (!databaseInstance) return
	databaseInstance.close()
	databaseInstance = null
}
