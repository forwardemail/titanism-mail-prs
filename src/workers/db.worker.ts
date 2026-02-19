/**
 * Dedicated Database Worker
 *
 * This worker is the SOLE owner of the Dexie/IndexedDB connection.
 * All database operations must go through this worker to prevent
 * version conflicts and ensure consistent access.
 */

import Dexie, { type Table } from 'dexie';
import { DB_NAME, SCHEMA_VERSION } from '../utils/db-constants.ts';

// Type definitions for database tables
interface Account {
  id: string;
  email: string;
  createdAt?: number;
  updatedAt?: number;
}

interface Folder {
  account: string;
  path: string;
  parentPath?: string;
  unread_count?: number;
  specialUse?: string;
  updatedAt?: number;
}

interface Message {
  account: string;
  id: string;
  folder: string;
  from?: string;
  subject?: string;
  snippet?: string;
  date?: number;
  flags?: string[];
  is_unread?: boolean;
  is_unread_index?: number;
  has_attachment?: boolean;
  modseq?: string | number;
  updatedAt?: number;
  bodyIndexed?: boolean;
  labels?: string[];
}

interface MessageBody {
  account: string;
  id: string;
  folder?: string;
  body?: string;
  textContent?: string;
  attachments?: unknown[];
  updatedAt?: number;
  sanitizedAt?: number;
  trackingPixelCount?: number;
  blockedRemoteImageCount?: number;
  raw?: string;
}

interface Draft {
  account: string;
  id: string;
  folder?: string;
  updatedAt?: number;
}

interface SearchIndexEntry {
  account: string;
  key: string;
  updatedAt?: number;
}

interface IndexMeta {
  account: string;
  key: string;
  updatedAt?: number;
}

interface Meta {
  key: string;
  updatedAt?: number;
}

interface SyncManifest {
  account: string;
  folder: string;
  lastUID?: number;
  lastSyncAt?: number;
  pagesFetched?: number;
  messagesFetched?: number;
  hasBodiesPass?: boolean;
  updatedAt?: number;
}

interface Label {
  account: string;
  id: string;
  name?: string;
  color?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface Settings {
  account: string;
  settings?: unknown;
  updatedAt?: number;
}

interface SettingsLabels {
  account: string;
  labels?: unknown[];
  updatedAt?: number;
}

interface OutboxItem {
  account: string;
  id: string;
  status?: string;
  retryCount?: number;
  nextRetryAt?: number;
  sendAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

// Database class with typed tables
class WebmailDatabase extends Dexie {
  accounts!: Table<Account>;
  folders!: Table<Folder>;
  messages!: Table<Message>;
  messageBodies!: Table<MessageBody>;
  drafts!: Table<Draft>;
  searchIndex!: Table<SearchIndexEntry>;
  indexMeta!: Table<IndexMeta>;
  meta!: Table<Meta>;
  syncManifests!: Table<SyncManifest>;
  labels!: Table<Label>;
  settings!: Table<Settings>;
  settingsLabels!: Table<SettingsLabels>;
  outbox!: Table<OutboxItem>;

  constructor(name: string) {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      accounts: 'id,email,createdAt,updatedAt',
      folders: '[account+path],account,path,parentPath,unread_count,specialUse,updatedAt',
      messages:
        '[account+id],id,folder,account,[account+folder],[account+folder+date],[account+folder+is_unread_index],from,subject,snippet,date,flags,is_unread,is_unread_index,has_attachment,modseq,updatedAt,bodyIndexed,labels',
      messageBodies:
        '[account+id],account,id,[account+folder],folder,body,textContent,attachments,updatedAt,sanitizedAt,trackingPixelCount,blockedRemoteImageCount',
      drafts: '[account+id],id,account,folder,updatedAt',
      searchIndex: '[account+key],key,account,updatedAt',
      indexMeta: '[account+key],key,account,updatedAt',
      meta: 'key,updatedAt',
      syncManifests:
        '[account+folder],account,folder,lastUID,lastSyncAt,pagesFetched,messagesFetched,hasBodiesPass,updatedAt',
      labels: '[account+id],id,account,name,color,createdAt,updatedAt',
      settings: 'account,settings,updatedAt',
      settingsLabels: 'account,labels,updatedAt',
      outbox: '[account+id],id,account,status,retryCount,nextRetryAt,sendAt,createdAt,updatedAt',
    });
  }
}

// Single Dexie instance for all operations
let db: WebmailDatabase | null = null;
let activeDbName: string | null = null;

function createDb(name: string): WebmailDatabase {
  return new WebmailDatabase(name);
}

// Track initialization state
let initialized = false;
let initPromise: Promise<{ success: boolean }> | null = null;

// Connected ports for other workers (search, sync)
const connectedPorts = new Map<string, MessagePort>();

interface DbOperationPayload {
  key?: unknown;
  keys?: unknown[];
  record?: unknown;
  records?: unknown[];
  changes?: unknown;
  index?: string;
  value?: unknown;
  lower?: unknown;
  upper?: unknown;
  options?: {
    reverse?: boolean;
    sortBy?: string;
    offset?: number;
    limit?: number;
    includeLower?: boolean;
    includeUpper?: boolean;
  };
  mode?: IDBTransactionMode;
  tables?: string[];
  operations?: DbOperation[];
  dbName?: string;
}

interface DbOperation {
  action: string;
  table?: string;
  payload?: DbOperationPayload;
}

interface DbWorkerMessage {
  id?: number;
  action?: string;
  table?: string;
  payload?: DbOperationPayload;
  type?: string;
  workerId?: string;
}

interface DbWorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
  errorName?: string;
  errorCode?: string | number;
}

/**
 * Initialize the database
 */
async function initializeDb(nameOverride: string | null = null): Promise<{ success: boolean }> {
  if (initialized && (!nameOverride || nameOverride === activeDbName)) {
    return { success: true };
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const name = nameOverride || DB_NAME;
      if (!db || activeDbName !== name) {
        if (db?.isOpen?.()) {
          await db.close();
        }
        db = createDb(name);
        activeDbName = name;
        initialized = false;
      }
      await db.open();
      initialized = true;

      // One-time migration: remove messages whose `id` is a Message-ID header
      // (contains @ and angle brackets). These are orphaned records from a bug
      // where normalizeMessageForCache used the Message-ID email header as the
      // record ID, causing forwarded emails to overwrite each other in IDB.
      try {
        const migrationKey = 'migration:purge-message-id-header-keys';
        const already = await db.meta.get(migrationKey);
        if (!already) {
          const allMessages = await db.messages.toArray();
          const bad = allMessages.filter((m) => {
            const id = m?.id;
            return (
              typeof id === 'string' && id.includes('@') && (id.startsWith('<') || id.includes('>'))
            );
          });
          if (bad.length) {
            const keys = bad.map((m) => [m.account, m.id]);
            await db.messages.bulkDelete(keys);
            // Also clean up corresponding message bodies
            await db.messageBodies.bulkDelete(keys).catch(() => {});
            console.log(`[db.worker] Migration: purged ${bad.length} orphaned message records`);
          }
          await db.meta.put({ key: migrationKey, updatedAt: Date.now() });
        }
      } catch (err) {
        console.warn('[db.worker] Migration failed (non-fatal):', err);
      }

      return { success: true };
    } catch (error) {
      console.error('[db.worker] Database initialization failed:', error);
      initialized = false;
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Ensure database is ready before operations
 */
async function ensureReady(): Promise<void> {
  if (!db) {
    await initializeDb();
  }
  if (!initialized) {
    await initializeDb();
  }
  if (!db!.isOpen()) {
    await db!.open();
  }
}

// ============================================================================
// Generic Table Operations
// ============================================================================

async function tableGet(table: string, key: unknown): Promise<unknown> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].get(key);
}

async function tablePut(table: string, record: unknown): Promise<unknown> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].put(record);
}

async function tableDelete(table: string, key: unknown): Promise<void> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].delete(key);
}

async function tableUpdate(table: string, key: unknown, changes: unknown): Promise<number> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].update(key, changes);
}

async function tableClear(table: string): Promise<void> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].clear();
}

async function tableCount(table: string): Promise<number> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].count();
}

async function tableBulkGet(table: string, keys: unknown[]): Promise<unknown[]> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].bulkGet(keys);
}

async function tableBulkPut(table: string, records: unknown[]): Promise<unknown> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].bulkPut(records);
}

async function tableBulkDelete(table: string, keys: unknown[]): Promise<void> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].bulkDelete(keys);
}

async function tableToArray(table: string): Promise<unknown[]> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].toArray();
}

// ============================================================================
// Query Operations (where clauses)
// ============================================================================

interface QueryOptions {
  reverse?: boolean;
  sortBy?: string;
  offset?: number;
  limit?: number;
  includeLower?: boolean;
  includeUpper?: boolean;
}

async function queryEquals(
  table: string,
  index: string,
  value: unknown,
  options: QueryOptions = {},
): Promise<unknown[]> {
  await ensureReady();
  let query = (db as unknown as Record<string, Table>)[table].where(index).equals(value);

  if (options.reverse) {
    query = query.reverse();
  }
  if (options.sortBy) {
    return query.sortBy(options.sortBy);
  }
  if (options.offset) {
    query = query.offset(options.offset);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  return query.toArray();
}

async function queryEqualsFirst(table: string, index: string, value: unknown): Promise<unknown> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].where(index).equals(value).first();
}

async function queryEqualsCount(table: string, index: string, value: unknown): Promise<number> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].where(index).equals(value).count();
}

async function queryEqualsDelete(table: string, index: string, value: unknown): Promise<number> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].where(index).equals(value).delete();
}

async function queryEqualsModify(
  table: string,
  index: string,
  value: unknown,
  changes: unknown,
): Promise<number> {
  await ensureReady();
  return (db as unknown as Record<string, Table>)[table].where(index).equals(value).modify(changes);
}

async function queryBetween(
  table: string,
  index: string,
  lower: unknown,
  upper: unknown,
  options: QueryOptions = {},
): Promise<unknown[]> {
  await ensureReady();
  let query = (db as unknown as Record<string, Table>)[table]
    .where(index)
    .between(lower, upper, options.includeLower, options.includeUpper);

  if (options.reverse) {
    query = query.reverse();
  }
  if (options.sortBy) {
    return query.sortBy(options.sortBy);
  }
  if (options.offset) {
    query = query.offset(options.offset);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  return query.toArray();
}

async function queryStartsWith(
  table: string,
  index: string,
  value: string,
  options: QueryOptions = {},
): Promise<unknown[]> {
  await ensureReady();
  let query = (db as unknown as Record<string, Table>)[table].where(index).startsWith(value);

  if (options.reverse) {
    query = query.reverse();
  }
  if (options.sortBy) {
    return query.sortBy(options.sortBy);
  }
  if (options.offset) {
    query = query.offset(options.offset);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  return query.toArray();
}

// ============================================================================
// Transaction Operations
// ============================================================================

async function runTransaction(
  mode: IDBTransactionMode,
  tables: string | string[],
  operations: DbOperation[],
): Promise<unknown[]> {
  await ensureReady();

  // Map table names to actual table objects
  const tableList = Array.isArray(tables) ? tables : [tables];
  const tableObjects = tableList
    .map((t) => {
      if (typeof t === 'string') return (db as unknown as Record<string, Table>)[t];
      const tableObj = t as { name?: string; _table?: string; table?: string; tableName?: string };
      const name = tableObj?.name || tableObj?._table || tableObj?.table || tableObj?.tableName;
      return name ? (db as unknown as Record<string, Table>)[name] : null;
    })
    .filter(Boolean) as Table[];

  return db!.transaction(mode, tableObjects, async () => {
    const results: unknown[] = [];
    for (const op of operations) {
      const result = await executeOperation(op);
      results.push(result);
    }
    return results;
  });
}

// ============================================================================
// Database Management
// ============================================================================

interface DatabaseInfo {
  version: number;
  name: string;
  isOpen: boolean;
  tables: Array<{ name: string; schema: string | undefined }>;
  counts: Record<string, number>;
}

async function getDatabaseInfo(): Promise<DatabaseInfo> {
  await ensureReady();

  const info: DatabaseInfo = {
    version: db!.verno,
    name: db!.name,
    isOpen: db!.isOpen(),
    tables: db!.tables.map((t) => ({
      name: t.name,
      schema: t.schema.primKey?.keyPath?.toString() || t.schema.primKey?.name,
    })),
    counts: {},
  };

  for (const table of db!.tables) {
    try {
      info.counts[table.name] = await table.count();
    } catch {
      info.counts[table.name] = 0;
    }
  }

  return info;
}

// Nuclear cache clear — wipes ALL accounts. Only used for database error recovery.
// For per-account cleanup, use clearAccountCacheData() in storage.js instead.
async function clearCache(): Promise<{ success: boolean }> {
  await ensureReady();

  await Promise.all([
    db!.folders.clear(),
    db!.messages.clear(),
    db!.messageBodies.clear(),
    db!.syncManifests?.clear?.(),
    db!.searchIndex.clear(),
    db!.indexMeta.clear(),
    db!.drafts.clear(),
    db!.outbox.clear(),
    db!.settings?.clear?.(),
    db!.settingsLabels?.clear?.(),
    // meta table intentionally kept
  ]);

  return { success: true };
}

async function resetDatabase(): Promise<{ success: boolean; error?: string }> {
  try {
    if (db!.isOpen()) {
      await db!.close();
    }
    await db!.delete();
    await db!.open();
    initialized = true;
    return { success: true };
  } catch (error) {
    console.error('[db.worker] Reset failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

async function closeDatabase(): Promise<{ success: boolean }> {
  if (db!.isOpen()) {
    await db!.close();
  }
  initialized = false;
  return { success: true };
}

async function tableCollection(table: string, options: QueryOptions = {}): Promise<unknown[]> {
  await ensureReady();
  let collection = (db as unknown as Record<string, Table>)[table].toCollection();
  if (options.reverse) {
    collection = collection.reverse();
  }
  if (options.offset) {
    collection = collection.offset(options.offset);
  }
  if (options.limit) {
    collection = collection.limit(options.limit);
  }
  return collection.toArray();
}

// ============================================================================
// Operation Dispatcher
// ============================================================================

async function executeOperation(op: DbOperation): Promise<unknown> {
  const { action, table, payload = {} } = op;

  switch (action) {
    // Initialization
    case 'init':
      return initializeDb(payload?.dbName ?? null);
    case 'close':
      return closeDatabase();

    // Generic table operations
    case 'get':
      return tableGet(table!, payload.key);
    case 'put':
      return tablePut(table!, payload.record);
    case 'delete':
      return tableDelete(table!, payload.key);
    case 'update':
      return tableUpdate(table!, payload.key, payload.changes);
    case 'clear':
      return tableClear(table!);
    case 'count':
      return tableCount(table!);
    case 'bulkGet':
      return tableBulkGet(table!, payload.keys!);
    case 'bulkPut':
      return tableBulkPut(table!, payload.records!);
    case 'bulkDelete':
      return tableBulkDelete(table!, payload.keys!);
    case 'toArray':
      return tableToArray(table!);

    // Query operations
    case 'queryEquals':
      return queryEquals(table!, payload.index!, payload.value, payload.options);
    case 'queryEqualsFirst':
      return queryEqualsFirst(table!, payload.index!, payload.value);
    case 'queryEqualsCount':
      return queryEqualsCount(table!, payload.index!, payload.value);
    case 'queryEqualsDelete':
      return queryEqualsDelete(table!, payload.index!, payload.value);
    case 'queryEqualsModify':
      return queryEqualsModify(table!, payload.index!, payload.value, payload.changes);
    case 'queryBetween':
      return queryBetween(table!, payload.index!, payload.lower, payload.upper, payload.options);
    case 'queryStartsWith':
      return queryStartsWith(table!, payload.index!, payload.value as string, payload.options);
    case 'tableCollection':
      return tableCollection(table!, payload.options);

    // Transactions
    case 'transaction':
      return runTransaction(payload.mode!, payload.tables!, payload.operations!);

    // Database management
    case 'getInfo':
      return getDatabaseInfo();
    case 'clearCache':
      return clearCache();
    case 'reset':
      return resetDatabase();

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<DbWorkerMessage>) => {
  const { id, action, table, payload, type } = event.data || {};

  if (!action) {
    if (type !== 'connectPort') {
      console.warn('[db.worker] Ignoring message without action', event.data);
    }
    return;
  }

  try {
    const result = await executeOperation({ action, table, payload });
    self.postMessage({ id, ok: true, result } as DbWorkerResponse);
  } catch (error) {
    console.error('[db.worker] Operation failed:', action, error);
    self.postMessage({
      id,
      ok: false,
      error: (error as Error).message,
      errorName: (error as Error).name,
      errorCode: (error as { code?: string | number }).code,
    } as DbWorkerResponse);
  }
};

/**
 * Handle MessageChannel port connections from other workers
 */
self.addEventListener('message', (event: MessageEvent<DbWorkerMessage>) => {
  if (event.data?.type === 'connectPort') {
    const { workerId } = event.data;
    const port = (event as MessageEvent & { ports: MessagePort[] }).ports[0];

    if (port && workerId) {
      connectedPorts.set(workerId, port);

      port.onmessage = async (portEvent: MessageEvent<DbWorkerMessage>) => {
        const { id, action, table, payload } = portEvent.data;

        try {
          const result = await executeOperation({ action: action!, table, payload });
          port.postMessage({ id, ok: true, result } as DbWorkerResponse);
        } catch (error) {
          console.error('[db.worker] Port operation failed:', action, error);
          port.postMessage({
            id,
            ok: false,
            error: (error as Error).message,
            errorName: (error as Error).name,
            errorCode: (error as { code?: string | number }).code,
          } as DbWorkerResponse);
        }
      };

      port.start();
    }
  }
});

// Do not auto-init; wait for explicit init with dbName override from main thread.
