import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useToast } from './toast.jsx';

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api.get('/auth/me'), retry: false, staleTime: 60_000 });

export function useWorkspaceId() {
  const { wid } = useParams();
  return Number(wid);
}

export function useWorkspace() {
  const wid = useWorkspaceId();
  return useQuery({ queryKey: ['workspace', wid], queryFn: () => api.get(`/workspaces/${wid}`), enabled: !!wid, staleTime: 30_000 });
}

export function useProjects() {
  const wid = useWorkspaceId();
  return useQuery({ queryKey: ['projects', wid], queryFn: () => api.get(`/workspaces/${wid}/projects`), enabled: !!wid });
}

export function useProject(pid) {
  return useQuery({ queryKey: ['project', pid], queryFn: () => api.get(`/projects/${pid}`), enabled: !!pid });
}

export function useProjectTasks(pid) {
  return useQuery({ queryKey: ['project-tasks', pid], queryFn: () => api.get(`/projects/${pid}/tasks`), enabled: !!pid });
}

// Открытая карточка задачи хранится в адресе (?task=ID), поэтому ссылкой можно поделиться
export function useTaskPanel() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('task') ? Number(params.get('task')) : null;
  const open = useCallback((id) => {
    setParams((p) => { const n = new URLSearchParams(p); n.set('task', id); return n; });
  }, [setParams]);
  const close = useCallback(() => {
    setParams((p) => { const n = new URLSearchParams(p); n.delete('task'); return n; });
  }, [setParams]);
  return { openId, open, close };
}

// Изменение задачи с мгновенным откликом в интерфейсе: сразу правим кэш, при ошибке откатываем
export function useUpdateTask() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, ...patch }) => api.patch(`/tasks/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      const lists = qc.getQueriesData({ predicate: (q) => ['project-tasks', 'my-tasks'].includes(q.queryKey[0]) });
      const single = qc.getQueryData(['task', id]);
      lists.forEach(([key, data]) => {
        if (Array.isArray(data)) qc.setQueryData(key, data.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      });
      if (single) qc.setQueryData(['task', id], { ...single, ...patch });
      return { lists, single, id };
    },
    onError: (err, vars, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.single) qc.setQueryData(['task', ctx.id], ctx.single);
      if (err.code !== 'blocked') toast(err.message, { type: 'error' });
    },
    onSettled: (data, err, { id }) => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      if (data?.parent_id) qc.invalidateQueries({ queryKey: ['task', data.parent_id] });
    },
  });
}

// Завершение задачи с проверкой зависимостей и отменой
export function useToggleComplete() {
  const update = useUpdateTask();
  const toast = useToast();
  return useCallback((task) => {
    const completed = !task.completed;
    const run = (force) => update.mutate({ id: task.id, completed, force }, {
      onError: (err) => {
        if (err.code === 'blocked' && window.confirm(`${err.message}\n\nВсё равно завершить?`)) run(true);
      },
      onSuccess: (res) => {
        if (!completed) return;
        toast(res.spawned_id ? 'Готово! Следующая повторяющаяся задача создана.' : 'Задача завершена', {
          action: { label: 'Отменить', onClick: () => update.mutate({ id: task.id, completed: false }) },
        });
      },
    });
    run(false);
  }, [update, toast]);
}

export function useMediaQuery(query) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setMatch(m.matches);
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return match;
}

export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : JSON.parse(v);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  }, [key, value]);
  return [value, setValue];
}
