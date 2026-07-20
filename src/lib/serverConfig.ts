const SERVER_URL_KEY = 'ninki_server_url';

export function getServerUrl(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SERVER_URL_KEY) ?? '';
}

export function setServerUrl(url: string): void {
  localStorage.setItem(SERVER_URL_KEY, url.trim());
}

export function clearServerUrl(): void {
  localStorage.removeItem(SERVER_URL_KEY);
}

export function isConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(SERVER_URL_KEY);
}
