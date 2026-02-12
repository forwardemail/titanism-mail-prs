/**
 * Database Worker Client
 *
 * Provides a clean API for database operations that mirrors Dexie's interface.
 * All operations are routed through the dedicated db.worker.js.
 *
 * Usage:
 *   import { dbClient, initDbClient } from './db-worker-client';
 *
 *   // Initialize (call once at app startup)
 *   await initDbClient();
 *
 *   // Use like Dexie tables
 *   const messages = await dbClient.messages.where('[account+folder]').equals([account, folder]).toArray();
 *   await dbClient.messages.bulkPut(records);
 */

import DbWorker from '../workers/db.worker.ts?worker&inline';
import { DB_NAME } from './db-constants.ts';
import { bootstrapReady } from './bootstrap-ready.js';

let worker = null;
let messagePort = null; // For worker-to-worker communication
let requestId = 0;
const pendingRequests = new Map();
let initialized = false;
let initPromise = null;

// Determine if we're running in a worker context
const isWorkerContext =
  typeof globalThis.WorkerGlobalScope !== 'undefined' &&
  self instanceof globalThis.WorkerGlobalScope;

/**
 * Create the database worker (main thread only)
 */
function createWorker() {
  try {
    return new DbWorker();
  } catch (error) {
    console.error('[db-worker-client] Failed to create worker', error);
    throw error;
  }
}

/**
 * Send a request to the db worker and wait for response
 */
async function send(action, table = null, payload = {}) {
  if (!messagePort && !worker) {
    if (!isWorkerContext && action !== 'init') {
      await initDbClient();
    }
  }

  const attemptSend = () =>
    new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests.set(id, { resolve, reject });

      const message = { id, action, table, payload };

      if (messagePort) {
        // Worker-to-worker communication via MessageChannel
        messagePort.postMessage(message);
      } else if (worker) {
        // Main thread to worker
        worker.postMessage(message);
      } else {
        pendingRequests.delete(id);
        reject(new Error('Database worker not initialized'));
      }
    });

  try {
    return await attemptSend();
  } catch (error) {
    if (!isWorkerContext && error?.message?.includes('Database worker terminated')) {
      await initDbClient();
      return attemptSend();
    }
    throw error;
  }
}

/**
 * Handle response from db worker
 */
function handleMessage(event) {
  const { id, ok, result, error, errorName, errorCode } = event.data;
  const pending = pendingRequests.get(id);

  if (!pending) return;

  pendingRequests.delete(id);

  if (ok) {
    pending.resolve(result);
  } else {
    const err = new Error(error || 'Database operation failed');
    if (errorName) err.name = errorName;
    if (errorCode) err.code = errorCode;
    pending.reject(err);
  }
}

/**
 * Initialize the database client (main thread)
 */
export async function initDbClient() {
  if (initialized) return { success: true };
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (isWorkerContext) {
        throw new Error('Use connectToDbWorker() in worker contexts');
      }

      if (import.meta.env?.DEV) {
        await bootstrapReady;
      }
      let initTimeoutId = null;
      const initTimeoutPromise = new Promise((_, reject) => {
        initTimeoutId = setTimeout(() => {
          const err = new Error('Database worker init timeout');
          err.code = 'DB_WORKER_INIT_TIMEOUT';
          reject(err);
        }, 10000); // Increased timeout for dev mode
      });
      worker = createWorker();
      worker.onerror = (event) => {
        console.error('[db-worker-client] Worker error', event);
      };
      worker.onmessageerror = (event) => {
        console.error('[db-worker-client] Worker message error', event);
      };
      worker.onmessage = handleMessage;

      // Wait for db worker to initialize
      const result = await Promise.race([
        send('init', null, { dbName: DB_NAME }),
        initTimeoutPromise,
      ]);
      if (initTimeoutId) clearTimeout(initTimeoutId);
      if (result?.success === false) {
        const err = new Error(result?.error || 'Database initialization failed');
        err.code = 'DB_INIT_FAILED';
        throw err;
      }
      initialized = true;
      return result;
    } catch (error) {
      console.error('[db-worker-client] Initialization failed:', error);
      terminateDbWorker();
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Connect to db worker via MessageChannel (for other workers)
 * @param {MessagePort} port - The MessagePort connected to db.worker
 */
export function connectToDbWorker(port) {
  if (initialized) return;

  messagePort = port;
  messagePort.onmessage = handleMessage;
  messagePort.start();
  initialized = true;
}

/**
 * Get the underlying worker (for setting up MessageChannels)
 */
export function getDbWorker() {
  return worker;
}

/**
 * Terminate the database worker
 */
export function terminateDbWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  if (messagePort) {
    messagePort.close();
    messagePort = null;
  }
  initialized = false;
  initPromise = null;
  // Reject all pending requests
  for (const [, pending] of pendingRequests) {
    pending.reject(new Error('Database worker terminated'));
  }
  pendingRequests.clear();
}

// ============================================================================
// Query Builder - Mimics Dexie's fluent API
// ============================================================================

class QueryBuilder {
  constructor(tableName, index, value) {
    this._table = tableName;
    this._index = index;
    this._value = value;
    this._options = {};
  }

  equals(value) {
    this._value = value;
    return this;
  }

  between(lower, upper, includeLower = true, includeUpper = false) {
    this._lower = lower;
    this._upper = upper;
    this._options.includeLower = includeLower;
    this._options.includeUpper = includeUpper;
    this._isBetween = true;
    this._isStartsWith = false;
    return this;
  }

  startsWith(value) {
    this._value = value;
    this._isStartsWith = true;
    this._isBetween = false;
    return this;
  }

  limit(n) {
    this._options.limit = n;
    return this;
  }

  offset(n) {
    this._options.offset = n;
    return this;
  }

  sortBy(field) {
    this._options.sortBy = field;
    return this;
  }

  reverse() {
    this._options.reverse = true;
    return this;
  }

  async toArray() {
    if (this._isBetween) {
      return send('queryBetween', this._table, {
        index: this._index,
        lower: this._lower,
        upper: this._upper,
        options: this._options,
      });
    }
    if (this._isStartsWith) {
      return send('queryStartsWith', this._table, {
        index: this._index,
        value: this._value,
        options: this._options,
      });
    }
    return send('queryEquals', this._table, {
      index: this._index,
      value: this._value,
      options: this._options,
    });
  }

  async first() {
    return send('queryEqualsFirst', this._table, {
      index: this._index,
      value: this._value,
    });
  }

  async count() {
    return send('queryEqualsCount', this._table, {
      index: this._index,
      value: this._value,
    });
  }

  async delete() {
    return send('queryEqualsDelete', this._table, {
      index: this._index,
      value: this._value,
    });
  }

  async modify(changes) {
    if (typeof changes === 'function') {
      throw new Error('db worker modify does not support function callbacks; pass an object');
    }
    return send('queryEqualsModify', this._table, {
      index: this._index,
      value: this._value,
      changes,
    });
  }
}

// ============================================================================
// Table Proxy - Mimics Dexie table interface
// ============================================================================

class TableProxy {
  constructor(tableName) {
    this._table = tableName;
  }

  // Direct operations
  get(key) {
    return send('get', this._table, { key });
  }

  put(record) {
    return send('put', this._table, { record });
  }

  delete(key) {
    return send('delete', this._table, { key });
  }

  update(key, changes) {
    return send('update', this._table, { key, changes });
  }

  clear() {
    return send('clear', this._table);
  }

  count() {
    return send('count', this._table);
  }

  toArray() {
    return send('toArray', this._table);
  }

  limit(n) {
    return new TableCollectionBuilder(this._table).limit(n);
  }

  // Bulk operations
  bulkGet(keys) {
    return send('bulkGet', this._table, { keys });
  }

  bulkPut(records) {
    return send('bulkPut', this._table, { records });
  }

  bulkDelete(keys) {
    return send('bulkDelete', this._table, { keys });
  }

  // Query builder
  where(index) {
    return new QueryBuilder(this._table, index, null);
  }
}

class TableCollectionBuilder {
  constructor(tableName) {
    this._table = tableName;
    this._options = {};
  }

  limit(n) {
    this._options.limit = n;
    return this;
  }

  offset(n) {
    this._options.offset = n;
    return this;
  }

  reverse() {
    this._options.reverse = true;
    return this;
  }

  async toArray() {
    return send('tableCollection', this._table, { options: this._options });
  }
}
// ============================================================================
// Transaction Support
// ============================================================================

/**
 * Run multiple operations in a transaction
 * @param {string} mode - 'r' for read, 'rw' for read-write
 * @param {string[]} tables - Table names involved in transaction
 * @param {Function} callback - Async function that returns array of operations
 */
export async function transaction(mode, ...args) {
  if (!args.length) {
    throw new Error('Transaction requires a callback');
  }

  const callback = args.pop();
  if (typeof callback !== 'function') {
    throw new Error('Transaction callback must be a function');
  }

  const tablesArg = args.length === 1 ? args[0] : args;
  const tables = normalizeTables(tablesArg);

  // Build operations from callback (optional, for txProxy usage)
  const ops = [];
  const txProxy = {
    table: (name) => ({
      get: (key) => ops.push({ action: 'get', table: name, payload: { key } }),
      put: (record) => ops.push({ action: 'put', table: name, payload: { record } }),
      delete: (key) => ops.push({ action: 'delete', table: name, payload: { key } }),
      bulkPut: (records) => ops.push({ action: 'bulkPut', table: name, payload: { records } }),
      bulkDelete: (keys) => ops.push({ action: 'bulkDelete', table: name, payload: { keys } }),
      clear: () => ops.push({ action: 'clear', table: name }),
      update: (key, changes) =>
        ops.push({ action: 'update', table: name, payload: { key, changes } }),
    }),
  };

  const result = await callback(txProxy);

  if (!ops.length) {
    return result;
  }

  return send('transaction', null, { mode, tables, operations: ops });
}

function normalizeTables(tables) {
  if (!tables) return [];
  const list = Array.isArray(tables) ? tables : [tables];
  return list
    .map((table) => {
      if (typeof table === 'string') return table;
      if (table && typeof table === 'object') {
        return table._table || table.name || table.table || table.tableName;
      }
      return null;
    })
    .filter(Boolean);
}

// ============================================================================
// Database Management
// ============================================================================

export async function getDatabaseInfo() {
  return send('getInfo');
}

export async function clearCache() {
  return send('clearCache');
}

export async function resetDatabase() {
  return send('reset');
}

export async function closeDatabase() {
  return send('close');
}

// ============================================================================
// Main Export - Database Client with Table Proxies
// ============================================================================

/**
 * Database client with Dexie-like table access
 *
 * @example
 * import { dbClient } from './db-worker-client';
 *
 * // Get messages
 * const messages = await dbClient.messages.where('[account+folder]').equals([account, folder]).toArray();
 *
 * // Put a record
 * await dbClient.folders.put(folderRecord);
 *
 * // Bulk operations
 * await dbClient.messages.bulkPut(messages);
 */
export const dbClient = {
  // Tables
  accounts: new TableProxy('accounts'),
  folders: new TableProxy('folders'),
  messages: new TableProxy('messages'),
  messageBodies: new TableProxy('messageBodies'),
  drafts: new TableProxy('drafts'),
  searchIndex: new TableProxy('searchIndex'),
  indexMeta: new TableProxy('indexMeta'),
  meta: new TableProxy('meta'),
  syncManifests: new TableProxy('syncManifests'),
  labels: new TableProxy('labels'),
  settings: new TableProxy('settings'),
  settingsLabels: new TableProxy('settingsLabels'),
  outbox: new TableProxy('outbox'),

  // Transaction helper
  transaction,

  // Management functions
  getInfo: getDatabaseInfo,
  clearCache,
  reset: resetDatabase,
  close: closeDatabase,

  // Check if initialized
  get isOpen() {
    return initialized;
  },
};

// Default export for convenience
export default dbClient;

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    terminateDbWorker();
  });
}
