/**
 * API type definitions
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  status?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface MessageListResponse {
  messages: ApiMessage[];
  total?: number;
  page?: number;
  hasMore?: boolean;
  uidNext?: number;
  uidValidity?: number;
  highestModSeq?: string;
}

export interface ApiMessage {
  id?: string;
  Id?: string;
  message_id?: string;
  messageId?: string;
  uid?: number;
  Uid?: number;
  folder?: string;
  folder_path?: string;
  path?: string;
  folder_id?: string;
  folderId?: string;
  date?: string | number;
  Date?: string | number;
  header_date?: string;
  internal_date?: string;
  received_at?: string;
  from?: string | ApiAddress | ApiAddress[];
  From?: string | ApiAddress | ApiAddress[];
  to?: string | ApiAddress | ApiAddress[];
  To?: string | ApiAddress | ApiAddress[];
  cc?: string | ApiAddress | ApiAddress[];
  Cc?: string | ApiAddress | ApiAddress[];
  bcc?: string | ApiAddress | ApiAddress[];
  Bcc?: string | ApiAddress | ApiAddress[];
  subject?: string;
  Subject?: string;
  snippet?: string;
  preview?: string;
  text?: string;
  Plain?: string;
  flags?: string[];
  is_unread?: boolean;
  isUnread?: boolean;
  IsUnread?: boolean;
  is_starred?: boolean;
  is_flagged?: boolean;
  has_attachment?: boolean;
  hasAttachments?: boolean;
  modseq?: string;
  ModSeq?: string;
  modSeq?: string;
  header_message_id?: string;
  headerMessageId?: string;
  in_reply_to?: string;
  inReplyTo?: string;
  references?: string;
  References?: string;
  root_id?: string;
  rootId?: string;
  thread_id?: string;
  threadId?: string;
  thread?: string;
  labels?: string[] | ApiLabel[];
  label_ids?: string[];
  labelIds?: string[];
  Labels?: string[] | ApiLabel[];
  tags?: string[];
  Tags?: string[];
  LabelIds?: string[];
  nodemailer?: NodemailerParsed;
  sender?: string | ApiAddress;
}

export interface ApiAddress {
  address?: string;
  name?: string;
  email?: string;
  value?: ApiAddress[];
  text?: string;
}

export interface ApiLabel {
  id?: string;
  Id?: string;
  name?: string;
  keyword?: string;
  value?: string;
  label?: string;
  color?: string;
}

export interface NodemailerParsed {
  from?: ApiAddress | { value: ApiAddress[] };
  to?: ApiAddress | { value: ApiAddress[] };
  cc?: ApiAddress | { value: ApiAddress[] };
  bcc?: ApiAddress | { value: ApiAddress[] };
  headers?: Record<string, string>;
  Headers?: Record<string, string>;
  text?: string;
  textAsHtml?: string;
  html?: string;
  attachments?: ApiAttachment[];
}

export interface ApiAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
  contentDisposition?: string;
  cid?: string;
  content?: string; // Base64 encoded
  partId?: string;
}

export interface FolderListResponse {
  folders: ApiFolder[];
}

export interface ApiFolder {
  id?: string;
  name: string;
  path: string;
  delimiter?: string;
  parent?: string;
  specialUse?: string;
  flags?: string[];
  subscribed?: boolean;
  unread?: number;
  total?: number;
  uidNext?: number;
  uidValidity?: number;
  modseq?: string;
}

export interface LabelListResponse {
  labels: ApiLabel[];
}

export interface ContactListResponse {
  contacts: ApiContact[];
  total?: number;
  hasMore?: boolean;
}

export interface ApiContact {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  company?: string;
  phone?: string;
  notes?: string;
  groups?: string[];
}

export interface CalendarEventListResponse {
  events: ApiCalendarEvent[];
  total?: number;
}

export interface ApiCalendarEvent {
  id: string;
  calendarId?: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  recurrence?: string;
  attendees?: ApiEventAttendee[];
  organizer?: string;
  status?: string;
  visibility?: string;
  reminders?: ApiEventReminder[];
}

export interface ApiEventAttendee {
  email: string;
  name?: string;
  status?: string;
  role?: string;
}

export interface ApiEventReminder {
  method: string;
  minutes: number;
}

export interface SendMessageRequest {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body: string;
  html?: string;
  attachments?: SendAttachment[];
  inReplyTo?: string;
  references?: string;
  draftId?: string;
}

export interface SendAttachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
  cid?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface DraftSaveRequest {
  id?: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  body?: string;
  html?: string;
  attachments?: SendAttachment[];
  inReplyTo?: string;
  references?: string;
}

export interface DraftSaveResponse {
  success: boolean;
  draftId?: string;
  error?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: ApiUser;
  error?: string;
}

export interface ApiUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  plan?: string;
  storageUsed?: number;
  storageTotal?: number;
}

export interface StorageInfoResponse {
  used: number;
  total: number;
  percentage: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  apiKey?: string;
  pathOverride?: string;
  perfLabel?: string;
}
