import { Server } from 'socket.io';
import * as cookie from 'cookie';
import { COOKIE, verifySession } from './auth.js';
import { many } from './db.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, { path: '/socket.io' });

  io.use((socket, next) => {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const uid = verifySession(cookies[COOKIE]);
    if (!uid) return next(new Error('unauthorized'));
    socket.data.uid = uid;
    next();
  });

  io.on('connection', async (socket) => {
    const uid = socket.data.uid;
    socket.join(`user:${uid}`);
    const rows = await many('SELECT workspace_id FROM workspace_members WHERE user_id=$1', [uid]).catch(() => []);
    rows.forEach((r) => socket.join(`ws:${r.workspace_id}`));

    // Кто сейчас смотрит задачу — для индикатора «редактирует»
    socket.on('watch-task', (taskId) => {
      for (const room of socket.rooms) if (room.startsWith('task:')) socket.leave(room);
      if (taskId) socket.join(`task:${taskId}`);
    });
  });
}

// Сообщения несут только идентификаторы — клиент сам перезапрашивает данные со своими правами
export function emitWorkspace(workspaceId, event, payload = {}) {
  io?.to(`ws:${workspaceId}`).emit(event, payload);
}

export function emitUser(userId, event, payload = {}) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export async function joinWorkspaceRoom(userId, workspaceId) {
  if (!io) return;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  sockets.forEach((s) => s.join(`ws:${workspaceId}`));
}

export async function leaveWorkspaceRoom(userId, workspaceId) {
  if (!io) return;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  sockets.forEach((s) => s.leave(`ws:${workspaceId}`));
}
