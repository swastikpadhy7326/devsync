import { io } from 'socket.io-client';
import { api, tokens } from './api';

let socket = null;
let authRetries = 0;

export function getSocket() {
  if (!socket) {
    socket = io({ autoConnect: false, auth: (cb) => cb({ token: tokens.access }) });

    socket.on('connect', () => { authRetries = 0; });

    // The server rejects expired tokens: refresh the token, then try again
    socket.on('connect_error', async () => {
      if (!socket.active && authRetries < 3) {
        authRetries += 1;
        try {
          await api.get('/auth/me');
          socket.connect();
        } catch { /* logged out */ }
      }
    });
  }
  return socket;
}

// Called on logout so the next person who logs in gets their own connection
export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
    authRetries = 0;
  }
}