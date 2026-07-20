import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Namespace /ninki — nginx proxifie /socket.io/ → NestJS port 3000
    socket = io('/ninki', {
      path: '/socket.io/',
      // Callback form : Socket.IO réévalue le token à chaque tentative de reconnexion,
      // ce qui garantit que le token rafraîchi est utilisé après un refresh JWT.
      auth: (cb) => cb({ token: typeof window !== 'undefined' ? localStorage.getItem('ninki_access_token') : null }),
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
