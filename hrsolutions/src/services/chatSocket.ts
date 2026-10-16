import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '@/config/constants';
import { api } from './apiClient';

const RETRY_AFTER_AUTH_FAILURE_MS = 5000;
const FATAL_ERRORS = new Set(['NO_EMPLOYEE_PROFILE']);

let socket: Socket | null = null;
let connectedToken = '';
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function backendOrigin(): string {
  try {
    return new URL(API_CONFIG.BASE_URL).origin;
  } catch {
    return 'http://localhost:8080';
  }
}

/**
 * Returns the single shared chat socket, creating it on first use.
 * The token is read on every (re)connect so refreshed sessions are picked up.
 */
export function getChatSocket(): Socket {
  if (socket) return socket;

  socket = io(backendOrigin(), {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    withCredentials: true,
    auth: (cb) => {
      connectedToken = api.getToken();
      cb({ token: connectedToken });
    },
  });

  // Middleware rejections are not retried by socket.io-client on its own.
  socket.on('connect_error', (err) => {
    if (FATAL_ERRORS.has(err.message) || !api.getToken()) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (socket && !socket.connected && api.getToken()) socket.connect();
    }, RETRY_AFTER_AUTH_FAILURE_MS);
  });

  return socket;
}

export function connectChatSocket(): Socket {
  const s = getChatSocket();
  if (!s.connected && api.getToken()) s.connect();
  return s;
}

/** Reconnects when the stored auth token differs from the one used for the live connection. */
export function refreshChatSocketAuth(): void {
  if (!socket) return;
  const token = api.getToken();
  if (!token) {
    socket.disconnect();
    return;
  }
  if (token !== connectedToken) {
    socket.disconnect();
    socket.connect();
  }
}

export function disconnectChatSocket(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  socket?.disconnect();
}
