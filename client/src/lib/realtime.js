import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket = null;

export function getSocket() {
  return socket;
}

// Подключение к серверу событий: при любых изменениях коллег обновляем нужные данные
export function useRealtime(enabled) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;
    socket = io({ path: '/socket.io', withCredentials: true });

    const inv = (key) => qc.invalidateQueries({ queryKey: key });

    socket.on('task', (e) => {
      if (e.projectId) inv(['project-tasks', e.projectId]);
      if (e.previousProjectId && e.previousProjectId !== e.projectId) inv(['project-tasks', e.previousProjectId]);
      inv(['task', e.taskId]);
      if (e.parentId) inv(['task', e.parentId]);
      inv(['my-tasks']);
      inv(['home']);
      inv(['projects']);
      inv(['search']);
      if (e.projectId) { inv(['stats', e.projectId]); inv(['files', e.projectId]); }
    });
    socket.on('project-tasks', (e) => {
      inv(['project', e.projectId]);
      inv(['project-tasks', e.projectId]);
      inv(['fields', e.projectId]);
    });
    socket.on('projects', (e) => {
      inv(['projects']);
      if (e.projectId) { inv(['project', e.projectId]); inv(['status', e.projectId]); }
    });
    socket.on('members', () => inv(['workspace']));
    socket.on('messages', (e) => inv(['messages', e.projectId]));
    socket.on('rules', (e) => inv(['rules', e.projectId]));
    socket.on('tags', () => {
      inv(['workspace']);
      inv(['project-tasks']);
    });
    socket.on('workspace', () => inv(['workspace']));
    socket.on('workspace-deleted', () => inv(['me']));
    socket.on('notification', (e) => {
      inv(['notifications', e.workspaceId]);
      inv(['unread', e.workspaceId]);
    });
    // После обрыва связи перезапрашиваем всё, что могло устареть
    socket.io.on('reconnect', () => qc.invalidateQueries());

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [enabled, qc]);
}
