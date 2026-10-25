import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, Trash2, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { Avatar, EmptyState, PageLoader } from '../components/ui.jsx';
import { timeAgo, fmtDateTime } from '../lib/format.js';

function Reply({ project, parentId }) {
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const send = async () => {
    if (!text.trim()) return;
    try {
      await api.post(`/projects/${project.id}/messages`, { parent_id: parentId, body: text.trim() });
      setText('');
      qc.invalidateQueries({ queryKey: ['messages', project.id] });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  return (
    <div className="flex items-end gap-2">
      <textarea rows={1} className="input h-auto py-2 flex-1" placeholder="Ответить…" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} aria-label="Ответ" />
      <button className="btn-primary h-10 w-10 px-0" onClick={send} disabled={!text.trim()} aria-label="Отправить"><Send className="h-4 w-4" /></button>
    </div>
  );
}

export default function MessagesView({ project }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', body: '' });
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ['messages', project.id], queryFn: () => api.get(`/projects/${project.id}/messages`) });

  const create = async () => {
    try {
      await api.post(`/projects/${project.id}/messages`, form);
      setForm({ title: '', body: '' });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['messages', project.id] });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const remove = async (id) => {
    if (!window.confirm('Удалить сообщение?')) return;
    try { await api.del(`/messages/${id}`); qc.invalidateQueries({ queryKey: ['messages', project.id] }); } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const canDelete = (m) => m.user_id === me?.user.id || project.canManage;

  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-6 py-6 space-y-4">
      {open ? (
        <div className="card p-4 space-y-3">
          <input autoFocus className="input" placeholder="Тема" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Тема" />
          <textarea rows={5} className="input h-auto py-2" placeholder="Сообщение для всех участников проекта" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-label="Сообщение" />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Отмена</button>
            <button className="btn-primary" disabled={!form.title.trim() || !form.body.trim()} onClick={create}>Опубликовать</button>
          </div>
        </div>
      ) : (
        <button className="w-full card px-4 py-3 text-left text-sm text-muted hover:border-primary/40 transition-colors" onClick={() => setOpen(true)}>
          Начните обсуждение для всей команды проекта…
        </button>
      )}

      {isLoading ? <PageLoader /> : data.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="Обсуждений пока нет" text="Здесь удобно делиться новостями проекта и обсуждать вопросы, которые не относятся к конкретной задаче." />
      ) : data.map((m) => (
        <article key={m.id} className="card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Avatar user={m.author} size={36} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold">{m.title}</h3>
              <p className="text-xs text-muted" title={fmtDateTime(m.created_at)}>{m.author?.name} · {timeAgo(m.created_at)}</p>
            </div>
            {canDelete(m) && <button className="icon-btn h-8 w-8" aria-label="Удалить" onClick={() => remove(m.id)}><Trash2 className="h-4 w-4" /></button>}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
          {m.replies.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 border-line pl-4">
              {m.replies.map((r) => (
                <div key={r.id} className="group flex gap-2.5">
                  <Avatar user={r.author} size={26} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs"><span className="font-semibold">{r.author?.name}</span> <span className="text-muted">{timeAgo(r.created_at)}</span></p>
                    <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                  </div>
                  {canDelete(r) && <button className="icon-btn h-7 w-7 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Удалить ответ" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4"><Reply project={project} parentId={m.id} /></div>
        </article>
      ))}
    </div>
  );
}
