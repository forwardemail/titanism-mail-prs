import { Local } from './storage.js';

export interface AuthOptions {
  allowApiKey?: boolean;
  required?: boolean;
}

const buildBasicHeader = (value: string | null): string => (value ? `Basic ${btoa(value)}` : '');

export const buildAliasAuthHeader = (
  aliasAuth: string | null | undefined,
  { required = false }: { required?: boolean } = {},
): string => {
  if (aliasAuth) return buildBasicHeader(aliasAuth);
  if (required) throw new Error('Authorization required. Please sign in again.');
  return '';
};

export const buildApiKeyAuthHeader = (apiKey: string | null | undefined): string =>
  buildBasicHeader(apiKey ? `${apiKey}:` : '');

export const getAuthHeader = ({
  allowApiKey = true,
  required = false,
}: AuthOptions = {}): string => {
  const aliasAuth = Local.get('alias_auth');
  if (aliasAuth) return buildAliasAuthHeader(aliasAuth, { required });
  if (allowApiKey) {
    const apiKey = Local.get('api_key');
    const header = buildApiKeyAuthHeader(apiKey);
    if (header) return header;
  }
  if (required) throw new Error('Authorization required. Please sign in again.');
  return '';
};
