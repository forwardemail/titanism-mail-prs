/**
 * Central type exports for the webmail application
 */

// Message types
export type {
  Message,
  MessageBody,
  MessageMeta,
  Attachment,
  ParsedEmail,
  ImageStatus,
  PgpStatus,
  Conversation,
  SortOrder,
} from './message';

// Folder types
export type {
  Folder,
  SpecialUseFlag,
  FolderTreeNode,
  FolderContextMenuState,
  FolderOperation,
} from './folder';

// Account types
export type {
  Account,
  AccountSettings,
  ThemeMode,
  Label,
  Contact,
  ContactGroup,
  CalendarEvent,
  EventAttendee,
  EventReminder,
  PgpKey,
} from './account';

// Worker types
export type {
  SyncWorkerMessageType,
  SyncWorkerMessage,
  SyncWorkerResponse,
  SyncProgress,
  DbWorkerAction,
  DbWorkerMessage,
  DbWorkerPayload,
  DbWorkerResponse,
  SearchWorkerMessageType,
  SearchWorkerMessage,
  SearchDocument,
  SearchOptions,
  SearchWorkerResponse,
  SearchResult,
  SearchStats,
} from './worker';

// API types
export type {
  ApiResponse,
  PaginatedResponse,
  MessageListResponse,
  ApiMessage,
  ApiAddress,
  ApiLabel,
  NodemailerParsed,
  ApiAttachment,
  FolderListResponse,
  ApiFolder,
  LabelListResponse,
  ContactListResponse,
  ApiContact,
  CalendarEventListResponse,
  ApiCalendarEvent,
  ApiEventAttendee,
  ApiEventReminder,
  SendMessageRequest,
  SendAttachment,
  SendMessageResponse,
  DraftSaveRequest,
  DraftSaveResponse,
  AuthResponse,
  ApiUser,
  StorageInfoResponse,
  RequestOptions,
} from './api';

// Re-export for convenience
export * from './message';
export * from './folder';
export * from './account';
export * from './worker';
export * from './api';
