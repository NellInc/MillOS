import { translate } from '../i18n';
import { chatgptClientMessages } from './chatgptClient.messages';

/** Browser bridge for the optional loopback companion. OAuth tokens never enter this module. */
export interface ChatGPTAccount {
  id: string;
  email: string;
  signedIn: boolean;
  model: string | null;
}

export interface ChatGPTStatus {
  available: boolean;
  activeId: string | null;
  accounts: ChatGPTAccount[];
}

export interface ChatGPTModel {
  slug: string;
  name: string;
}

const endpoint = '/api/chatgpt';

/**
 * The message is shown to the person, so it is translated; whether the error
 * means the session is gone is carried separately, because generateContent()
 * cannot recognise a pt-BR message by its English wording.
 */
class ChatGPTClientError extends Error {
  constructor(
    key: keyof (typeof chatgptClientMessages)['en'],
    readonly disconnects: boolean
  ) {
    super(translate(chatgptClientMessages, key));
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
  });
  if (!response.headers.get('content-type')?.startsWith('application/json')) {
    throw new ChatGPTClientError('companionNotRunning', true);
  }
  const data = await response.json();
  if (!response.ok) {
    if (data.error === 'invalid_grant') {
      throw new ChatGPTClientError('sessionExpired', true);
    }
    if (data.error === 'subscription_sharing_usage_limit_exceeded') {
      throw new ChatGPTClientError('usageLimitReached', false);
    }
    if (data.error === 'subscription_sharing_usage_unavailable') {
      throw new ChatGPTClientError('usageUnavailable', false);
    }
    if (data.error) throw new Error(data.error);
    throw new ChatGPTClientError('requestFailed', false);
  }
  return data as T;
}

let connected = false;

export const chatgptClient = {
  isConnected: () => connected,
  async status(): Promise<ChatGPTStatus> {
    try {
      const status = await api<ChatGPTStatus>('/status');
      const active = status.accounts.find((account) => account.id === status.activeId);
      connected = Boolean(active?.signedIn && active.model);
      return status;
    } catch (error) {
      connected = false;
      throw error;
    }
  },
  async start(id?: string): Promise<string> {
    const result = await api<{ url: string }>('/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : {}),
    });
    return result.url;
  },
  async models(): Promise<ChatGPTModel[]> {
    return (await api<{ models: ChatGPTModel[] }>('/models')).models;
  },
  async selectModel(slug: string): Promise<void> {
    await api('/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
  },
  async selectAccount(id: string): Promise<void> {
    await api('/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  },
  async signOut(): Promise<boolean> {
    const result = await api<{ remoteRevocationConfirmed: boolean }>('/signout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    connected = false;
    return result.remoteRevocationConfirmed;
  },
  async generateContent(prompt: string): Promise<string | null> {
    try {
      const result = await api<{ text: string }>('/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(125_000),
      });
      return result.text || null;
    } catch (error) {
      if (
        error instanceof ChatGPTClientError
          ? error.disconnects
          : error instanceof Error && /sign in|401|companion is not running/i.test(error.message)
      )
        connected = false;
      throw error;
    }
  },
};
