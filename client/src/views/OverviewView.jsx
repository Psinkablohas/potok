import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Flag } from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { Avatar, Modal, Field, Spinner } from '../components/ui.jsx';
import { PROJECT_STATUS, ROLE_LABEL, fmtDateTime, dueLabel } from '../lib/format.js';

function StatusModal({ project, open, onClose }) {
  const [form, setForm] = useState({ status: 'on_track', title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/projects/${project.id}/status`, form);
      qc.invalidateQueries({ queryKey: ['status', project.id] });
      setForm({ status: 'on_track', title: '', body: '' });
      onClose();
      toast('Отчёт о статусе опубликован');
    } catch (e) { toast(e.message, { type: 'error' }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Отчёт о статусе проекта" width={560}
      footer={<><button className="btn-ghost" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={!form.title.trim() || busy} onClick={submit}>Опубликовать</button></>}>
      <div className="space-y-4">
        <Field label="Как идут дела?">
          <div className="flex flex-wrap gap-2">
            {Object.entries(PROJECT_STATUS).map(([k, s]) => (
              <button key={k} type="button" onClick={() => setForm({ ...form, status: k })}
                className={`chip px-3 py-1.5 text-sm border transition-colors ${form.status === k ? `${s.cls} border-transparent ring-2 ring-primary/40` : 'border-line text-muted hover:text-ink'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Заголовок" htmlFor="st-title"><input id="st-title" className="input" placeholder="Например: макеты готовы, начинаем вёрстку" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Подробности" htmlFor="st-body"><textarea id="st-body" rows={6} className="input h-auto py-2" placeholder="Что сделано, что мешает, что дальше" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
        <p className="text-xs text-muted">Участники проекта получат уведомление во «Входящих».</p>
      </div>
    </Modal>
  );
}

export default function OverviewView({ project, tasks }) {
  const { data: me } = useMe();
  const [modal, setModal] = useState(false);
  const [desc, setDesc] = useState(project.description);
  const qc = useQueryClient();
  const toast = useToast();
  const { data: updates = [], isLoading } = useQuery({ queryKey: ['status', project.id], queryFn: () => api.get(`/projects/${project.id}/status`) });
  const latest = updates[0];
  const milestones = tasks.filter((t) => t.task_type === 'milestone').sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9'));

  const saveDesc = async () => {
    if (desc === project.description) return;
    try {
      await api.patch(`/projects/${project.id}`, { description: desc });
      qc.invalidateQueries({ queryKey: ['project', project.id] });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const remove = async (id) => {
    if (!window.confirm('Удалить отчёт?')) return;
    try { await api.del(`/status/${id}`); qc.invalidateQueries({ queryKey: ['status', project.id] }); } catch (e) { toast(e.message, { type: 'error' }); }
  };

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-6 py-6 grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6 min-w-0">
        <section>
          <h2 className="font-semibold mb-2">О проекте</h2>
          <textarea
            rows={4}
            disabled={!project.canEdit}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={saveDesc}
            placeholder={project.canEdit ? 'Расскажите, зачем этот проект, какие цели и как будете работать' : 'Описания нет'}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y"
          />
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Статус проекта</h2>
            {project.canEdit && <button className="btn-secondary h-8" onClick={() => setModal(true)}><Plus className="h-4 w-4" />Новый отчёт</button>}
          </div>
          {isLoading ? <Spinner /> : !latest ? (
            <div className="card p-5 text-sm text-muted">
              Отчётов пока нет. Короткий отчёт раз в неделю помогает всей команде понимать, всё ли идёт по плану.
            </div>
          ) : (
            <div className="space-y-3">
              {updates.map((u, i) => {
                const s = PROJECT_STATUS[u.status];
                return (
                  <article key={u.id} className={`card p-4 sm:p-5 ${i === 0 ? '' : 'opacity-90'}`} style={i === 0 ? { borderLeft: `4px solid ${s.dot}` } : undefined}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`chip ${s.cls}`}>{s.label}</span>
                      <h3 className="font-semibold flex-1 min-w-0">{u.title}</h3>
                      {(u.user_id === me?.user.id || project.canManage) && <button className="icon-btn h-8 w-8" aria-label="Удалить отчёт" onClick={() => remove(u.id)}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    {u.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{u.body}</p>}
                    <p className="mt-3 flex items-center gap-2 text-xs text-muted"><Avatar user={u.author} size={20} />{u.author?.name} · {fmtDateTime(u.created_at)}</p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section>
          <h2 className="font-semibold mb-2">Участники · {project.members.length}</h2>
          <ul className="space-y-2">
            {project.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <Avatar user={m} size={30} />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block text-xs text-muted">{ROLE_LABEL[m.role]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-semibold mb-2">Вехи</h2>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted">Отметьте ключевые точки проекта: в карточке задачи выберите тип «Веха».</p>
          ) : (
            <ul className="space-y-2">
              {milestones.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <Flag className={`h-4 w-4 shrink-0 ${m.completed ? 'text-success' : 'text-primary'}`} />
                  <span className={`flex-1 truncate ${m.completed ? 'line-through text-muted' : ''}`}>{m.title}</span>
                  {m.due_date && <span className="text-xs text-muted">{dueLabel(m.due_date)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <StatusModal project={project} open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
