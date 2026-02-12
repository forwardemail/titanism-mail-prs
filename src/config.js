export const config = {
  // Note: Vite only exposes env vars prefixed with VITE_ to the client
  // Use VITE_WEBMAIL_API_BASE=http://localhost:4000 for local development
  apiBase: import.meta.env.VITE_WEBMAIL_API_BASE || 'https://api.forwardemail.net',
};
