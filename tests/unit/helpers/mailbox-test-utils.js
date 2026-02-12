import { writable, readable } from 'svelte/store';
import { vi } from 'vitest';

/**
 * Create a mock writable store for testing
 * @param {*} initialValue - Initial value for the store
 * @returns {Object} Mock store with subscribe, set, and update methods
 */
export function createMockStore(initialValue) {
  const store = writable(initialValue);
  return {
    subscribe: store.subscribe,
    set: store.set,
    update: store.update,
  };
}

/**
 * Create a mock readable store for testing
 * @param {*} initialValue - Initial value for the store
 * @returns {Object} Mock readable store
 */
export function createMockReadableStore(initialValue) {
  const store = readable(initialValue);
  return {
    subscribe: store.subscribe,
  };
}

/**
 * Create a mock mailboxView object for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock mailboxView
 */
export function createMockMailboxView(overrides = {}) {
  return {
    composeModal: { open: vi.fn(), close: vi.fn() },
    toasts: { show: vi.fn(), hide: vi.fn() },
    loadMessages: vi.fn(),
    selectConversation: vi.fn(),
    selectMessage: vi.fn(),
    selectFolder: vi.fn(),
    toggleAccountMenu: vi.fn(),
    switchAccount: vi.fn(),
    addAccount: vi.fn(),
    signOut: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleFilters: vi.fn(),
    onSearch: vi.fn(),
    storageUsed: createMockReadableStore(0),
    storageTotal: createMockReadableStore(0),
    accounts: createMockReadableStore([]),
    currentAccount: createMockReadableStore('test@example.com'),
    accountMenuOpen: createMockReadableStore(false),
    mobileReader: createMockStore(false),
    layoutMode: createMockReadableStore('full'),
    query: createMockStore(''),
    unreadOnly: createMockStore(false),
    hasAttachmentsOnly: createMockStore(false),
    threadingEnabled: createMockStore(true),
    selectedConversationIds: createMockReadableStore([]),
    selectedConversation: createMockStore(null),
    selectedMessage: createMockReadableStore(null),
    messageBody: createMockReadableStore(''),
    attachments: createMockReadableStore([]),
    loading: createMockReadableStore(false),
    messageLoading: createMockReadableStore(false),
    page: createMockStore(1),
    hasNextPage: createMockReadableStore(false),
    sidebarOpen: createMockStore(true),
    showFilters: createMockStore(false),
    sortOrder: createMockStore('newest'),
    bulkMoveOpen: createMockStore(false),
    availableMoveTargets: createMockReadableStore([]),
    availableLabels: createMockReadableStore([]),
    ...overrides,
  };
}

/**
 * Create a mock mailboxStore object for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock mailboxStore
 */
export function createMockMailboxStore(overrides = {}) {
  return {
    state: {
      folders: createMockStore([]),
      selectedFolder: createMockStore('INBOX'),
      messages: createMockStore([]),
      selectedMessage: createMockStore(null),
      selectedConversation: createMockStore(null),
      selectedConversationIds: createMockStore([]),
      selectedConversationCount: createMockReadableStore(0),
      filteredConversations: createMockReadableStore([]),
      filteredMessages: createMockReadableStore([]),
      searchResults: createMockStore([]),
      searchActive: createMockStore(false),
      searching: createMockStore(false),
      threadingEnabled: createMockStore(true),
      loading: createMockStore(false),
      messageLoading: createMockStore(false),
      page: createMockStore(1),
      hasNextPage: createMockStore(false),
      query: createMockStore(''),
      unreadOnly: createMockStore(false),
      hasAttachmentsOnly: createMockStore(false),
      messageBody: createMockStore(''),
      attachments: createMockStore([]),
      sidebarOpen: createMockStore(true),
      showFilters: createMockStore(false),
      sortOrder: createMockStore('newest'),
      expandedFolders: createMockStore(new Set()),
      folderContextMenu: createMockStore(null),
      folderOperationInProgress: createMockStore(false),
      bulkMoveOpen: createMockStore(false),
      availableMoveTargets: createMockReadableStore([]),
      availableLabels: createMockReadableStore([]),
      ...overrides.state,
    },
    actions: {
      loadMessages: vi.fn(),
      selectFolder: vi.fn(),
      setSortOrder: vi.fn(),
      ...overrides.actions,
    },
  };
}

/**
 * Create a mock message object for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock message
 */
export function createMockMessage(overrides = {}) {
  return {
    id: 'msg-1',
    folder: 'INBOX',
    subject: 'Test Subject',
    from: 'sender@example.com',
    to: 'recipient@example.com',
    date: new Date().toISOString(),
    dateMs: Date.now(),
    snippet: 'Test snippet',
    is_unread: false,
    is_starred: false,
    has_attachment: false,
    flags: [],
    ...overrides,
  };
}

/**
 * Create a mock conversation object for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock conversation
 */
export function createMockConversation(overrides = {}) {
  return {
    id: 'conv-1',
    subject: 'Test Conversation',
    displaySubject: 'Test Conversation',
    messageCount: 3,
    is_unread: false,
    is_starred: false,
    has_attachment: false,
    latestFrom: 'sender@example.com',
    latestDate: new Date().toISOString(),
    messages: [
      createMockMessage({ id: 'msg-1' }),
      createMockMessage({ id: 'msg-2' }),
      createMockMessage({ id: 'msg-3' }),
    ],
    previewMessages: [
      createMockMessage({ id: 'msg-1' }),
      createMockMessage({ id: 'msg-2' }),
      createMockMessage({ id: 'msg-3' }),
    ],
    ...overrides,
  };
}

/**
 * Create a mock folder object for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock folder
 */
export function createMockFolder(overrides = {}) {
  return {
    path: 'INBOX',
    name: 'Inbox',
    displayName: 'Inbox',
    specialUse: '\\Inbox',
    subscribed: true,
    listed: true,
    delimiter: '/',
    ...overrides,
  };
}

/**
 * Create a mock outbox item for testing
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock outbox item
 */
export function createMockOutboxItem(overrides = {}) {
  return {
    id: 'outbox-1',
    to: ['recipient@example.com'],
    from: 'sender@example.com',
    subject: 'Queued Message',
    html: '<p>Message body</p>',
    text: 'Message body',
    status: 'pending',
    createdAt: Date.now(),
    error: null,
    retryCount: 0,
    ...overrides,
  };
}

/**
 * Helper to wait for Svelte ticks in tests
 * @returns {Promise<void>}
 */
export async function waitForTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Helper to simulate a keyboard event
 * @param {string} key - Key name (e.g., 'Enter', 'ArrowDown')
 * @param {Object} options - Additional event options
 * @returns {KeyboardEvent} Keyboard event
 */
export function createKeyboardEvent(key, options = {}) {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

/**
 * Helper to simulate a mouse event
 * @param {string} type - Event type (e.g., 'click', 'contextmenu')
 * @param {Object} options - Additional event options
 * @returns {MouseEvent} Mouse event
 */
export function createMouseEvent(type, options = {}) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...options,
  });
}
