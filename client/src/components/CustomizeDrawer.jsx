import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Zap, ListPlus, FileInput, Download, Copy, ExternalLink } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { Field, Modal, Segmented, Spinner } from './ui.jsx';
import { FIELD_TYPES, PROJECT_COLORS, PRIORITY } from '../lib/format.js';

const TRIGGER_LABEL = {
  task_added: 'Задача добавлена в проект',
  section_changed: 'Задача перемещена в раздел',
  completed: 'Задача выполнена',
  assignee_changed: 'Изменён исполнитель',
  due_changed: 'Изменён срок',
};
const ACTION_LABEL = {
  complete: 'Отметить выполненной',
  move_section: 'Переместить в раздел',
  assign: 'Назначить исполнителя',
  add_follower: 'Добавить подписчика',
  set_priority: 'Установить приоритет',
  set_due_in: 'Поставить срок через N дней',
};

// ---------- Поля ----------
function FieldsTab({ project }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: fields = [], isLoading } = useQuery({ queryKey: ['fields', project.id], queryFn: () => api.get(`/projects/${project.id}/fields`) });
  const [form, setForm] = useState(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['fields', project.id] });
    qc.invalidateQueries({ queryKey: ['project-tasks', project.id] });
  };
  const save = async () => {
    try {
      const body = { name: form.name, type: form.type, options: form.options.filter((o) => o.name.trim()) };
      if (form.id) await api.patch(`/fields/${form.id}`, body); else await api.post(`/projects/${project.id}/fields`, body);
      setForm(null);
      refresh();
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const remove = async (f) => {
    if (!window.confirm(`Удалить поле «${f.name}» и все его значения?`)) return;
    try { await api.del(`/fields/${f.id}`); refresh(); } catch (e) { toast(e.message, { type: 'error' }); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Свои поля появятся колонками в списке и строками в карточке задачи: этап, бюджет, оценка в часах, клиент — что угодно.</p>
      {isLoading ? <Spinner /> : fields.map((f) => (
        <div key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate">{f.name}</span>
            <span className="block text-xs text-muted">{FIELD_TYPES[f.type]}{f.type === 'select' ? `: ${f.options.map((o) => o.name).join(', ')}` : ''}</span>
          </span>
          {project.canEdit && <button className="btn-ghost h-8" onClick={() => setForm({ ...f, options: f.options.map((o) => ({ ...o })) })}>Изменить</button>}
          {project.canEdit && <button className="icon-btn h-8 w-8" aria-label={`Удалить поле ${f.name}`} onClick={() => remove(f)}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {project.canEdit && <button className="btn-secondary w-full" onClick={() => setForm({ name: '', type: 'select', options: [{ name: '', color: PROJECT_COLORS[0] }] })}><Plus className="h-4 w-4" />Новое поле</button>}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Изменить поле' : 'Новое поле'}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Отмена</button><button className="btn-primary" disabled={!form?.name.trim()} onClick={save}>Сохранить</button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Название" htmlFor="f-name"><input id="f-name" autoFocus className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Тип">
              <select className="input" value={form.type} disabled={!!form.id} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {form.type === 'select' && (
              <Field label="Варианты">
                <div className="space-y-2">
                  {form.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select aria-label="Цвет варианта" className="h-10 w-12 rounded-lg border border-line" style={{ background: o.color }} value={o.color}
                        onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })}>
                        {PROJECT_COLORS.map((c) => <option key={c} value={c} style={{ background: c }}>{c}</option>)}
                      </select>
                      <input className="input flex-1" placeholder={`Вариант ${i + 1}`} value={o.name}
                        onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                      <button className="icon-btn" aria-label="Убрать вариант" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button className="btn-ghost" onClick={() => setForm({ ...form, options: [...form.options, { name: '', color: PROJECT_COLORS[form.options.length % PROJECT_COLORS.length] }] })}><Plus className="h-4 w-4" />Добавить вариант</button>
                </div>
              </Field>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Правила ----------
function ActionEditor({ action, onChange, onRemove, project }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle p-2">
      <select className="input h-9 flex-1 min-w-[180px]" value={action.type} onChange={(e) => onChange({ type: e.target.value })}>
        {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {action.type === 'move_section' && (
        <select className="input h-9 flex-1 min-w-[140px]" value={action.section_id || ''} onChange={(e) => onChange({ ...action, section_id: Number(e.target.value) })}>
          <option value="">Раздел…</option>
          {project.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {(action.type === 'assign' || action.type === 'add_follower') && (
        <select className="input h-9 flex-1 min-w-[140px]" value={action.user_id || ''} onChange={(e) => onChange({ ...action, user_id: Number(e.target.value) })}>
          <option value="">Кто…</option>
          {project.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {action.type === 'set_priority' && (
        <select className="input h-9 flex-1 min-w-[140px]" value={action.priority || 'high'} onChange={(e) => onChange({ ...action, priority: e.target.value })}>
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      )}
      {action.type === 'set_due_in' && (
        <input type="number" min={0} max={365} className="input h-9 w-24" value={action.days ?? 1} onChange={(e) => onChange({ ...action, days: Number(e.target.value) })} aria-label="Дней" />
      )}
      <button className="icon-btn h-9 w-9" aria-label="Убрать действие" onClick={onRemove}><X className="h-4 w-4" /></button>
    </div>
  );
}

function RulesTab({ project }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: rules = [], isLoading } = useQuery({ queryKey: ['rules', project.id], queryFn: () => api.get(`/projects/${project.id}/rules`) });
  const [form, setForm] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['rules', project.id] });
  const sectionName = (id) => project.sections.find((s) => s.id === id)?.name || 'любой раздел';

  const save = async () => {
    try {
      const body = { name: form.name, trigger: form.trigger, actions: form.actions };
      if (form.id) await api.patch(`/rules/${form.id}`, body); else await api.post(`/projects/${project.id}/rules`, body);
      setForm(null);
      refresh();
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const toggle = async (r) => {
    try { await api.patch(`/rules/${r.id}`, { enabled: !r.enabled }); refresh(); } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Удалить правило «${r.name}»?`)) return;
    try { await api.del(`/rules/${r.id}`); refresh(); } catch (e) { toast(e.message, { type: 'error' }); }
  };

  const presets = [
    { name: 'Готово → отметить выполненной', trigger: { type: 'section_changed', section_id: project.sections[project.sections.length - 1]?.id }, actions: [{ type: 'complete' }] },
    { name: 'Выполнено → переместить в последний раздел', trigger: { type: 'completed' }, actions: [{ type: 'move_section', section_id: project.sections[project.sections.length - 1]?.id }] },
    { name: 'Новая задача → срок через 3 дня', trigger: { type: 'task_added' }, actions: [{ type: 'set_due_in', days: 3 }] },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Правила делают рутину за вас: «когда произошло событие — выполнить действия». Работают для всех участников проекта.</p>
      {isLoading ? <Spinner /> : rules.map((r) => (
        <div key={r.id} className="rounded-lg border border-line p-3">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 shrink-0 ${r.enabled ? 'text-warn' : 'text-muted'}`} />
            <span className="flex-1 text-sm font-medium truncate">{r.name}</span>
            {project.canEdit && (
              <>
                <label className="relative inline-flex cursor-pointer items-center" title={r.enabled ? 'Выключить' : 'Включить'}>
                  <input type="checkbox" className="peer sr-only" checked={r.enabled} onChange={() => toggle(r)} aria-label="Правило включено" />
                  <span className="h-5 w-9 rounded-full bg-line peer-checked:bg-primary transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                </label>
                <button className="btn-ghost h-8" onClick={() => setForm({ ...r })}>Изменить</button>
                <button className="icon-btn h-8 w-8" aria-label="Удалить правило" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
          <p className="mt-1 pl-6 text-xs text-muted">
            Когда: {TRIGGER_LABEL[r.trigger.type]}{r.trigger.type === 'section_changed' ? ` «${sectionName(r.trigger.section_id)}»` : ''} → {r.actions.map((a) => ACTION_LABEL[a.type]?.toLowerCase()).join(', ')}
          </p>
        </div>
      ))}
      {project.canEdit && (
        <>
          <button className="btn-secondary w-full" onClick={() => setForm({ name: '', trigger: { type: 'section_changed', section_id: project.sections[0]?.id }, actions: [{ type: 'complete' }] })}><Plus className="h-4 w-4" />Новое правило</button>
          {rules.length === 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-xs font-medium text-muted">Готовые варианты</p>
              {presets.map((p) => (
                <button key={p.name} className="menu-item border border-line" onClick={() => setForm(p)}><Zap className="h-4 w-4 text-warn" />{p.name}</button>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Изменить правило' : 'Новое правило'} width={600}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Отмена</button><button className="btn-primary" disabled={!form?.name.trim() || !form?.actions.length} onClick={save}>Сохранить</button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Название" htmlFor="r-name"><input id="r-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Готово → закрыть задачу" /></Field>
            <Field label="Когда">
              <div className="flex flex-wrap gap-2">
                <select className="input flex-1 min-w-[200px]" value={form.trigger.type} onChange={(e) => setForm({ ...form, trigger: { type: e.target.value, section_id: project.sections[0]?.id } })}>
                  {Object.entries(TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {form.trigger.type === 'section_changed' && (
                  <select className="input flex-1 min-w-[160px]" value={form.trigger.section_id || ''} onChange={(e) => setForm({ ...form, trigger: { ...form.trigger, section_id: e.target.value ? Number(e.target.value) : null } })}>
                    <option value="">Любой раздел</option>
                    {project.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            </Field>
            <Field label="Сделать">
              <div className="space-y-2">
                {form.actions.map((a, i) => (
                  <ActionEditor key={i} action={a} project={project}
                    onChange={(na) => setForm({ ...form, actions: form.actions.map((x, j) => (j === i ? na : x)) })}
                    onRemove={() => setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })} />
                ))}
                <button className="btn-ghost" onClick={() => setForm({ ...form, actions: [...form.actions, { type: 'set_priority', priority: 'high' }] })}><Plus className="h-4 w-4" />Добавить действие</button>
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Форма ----------
function FormTab({ project }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: form, isLoading } = useQuery({ queryKey: ['form', project.id], queryFn: () => api.get(`/projects/${project.id}/form`) });
  const { data: fields = [] } = useQuery({ queryKey: ['fields', project.id], queryFn: () => api.get(`/projects/${project.id}/fields`) });
  const [draft, setDraft] = useState(null);
  useEffect(() => { if (form) setDraft(form); }, [form]);
  if (isLoading || !draft) return <Spinner />;

  const link = `${window.location.origin}/form/${draft.token}`;
  const save = async (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      const saved = await api.patch(`/forms/${draft.id}`, patch);
      qc.setQueryData(['form', project.id], saved);
    } catch (e) { toast(e.message, { type: 'error' }); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Публичная форма: клиенты и коллеги без аккаунта отправляют заявки, а они сразу появляются задачами в проекте.</p>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
        <span className="text-sm font-medium">Форма принимает заявки</span>
        <span className="relative inline-flex items-center">
          <input type="checkbox" className="peer sr-only" checked={draft.enabled} disabled={!project.canEdit} onChange={(e) => save({ enabled: e.target.checked })} />
          <span className="h-5 w-9 rounded-full bg-line peer-checked:bg-primary transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
        </span>
      </label>
      {draft.enabled && (
        <div className="flex items-center gap-2 rounded-lg bg-primary-soft p-2 pl-3">
          <code className="flex-1 truncate text-xs">{link}</code>
          <button className="icon-btn h-8 w-8" aria-label="Скопировать ссылку" onClick={() => navigator.clipboard?.writeText(link).then(() => toast('Ссылка на форму скопирована'))}><Copy className="h-4 w-4" /></button>
          <a className="icon-btn h-8 w-8" href={link} target="_blank" rel="noreferrer" aria-label="Открыть форму"><ExternalLink className="h-4 w-4" /></a>
        </div>
      )}
      <Field label="Заголовок формы"><input className="input" disabled={!project.canEdit} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={() => save({ title: draft.title })} /></Field>
      <Field label="Пояснение для отправителя"><textarea rows={3} className="input h-auto py-2" disabled={!project.canEdit} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={() => save({ description: draft.description })} /></Field>
      <Field label="Куда добавлять заявки">
        <select className="input" disabled={!project.canEdit} value={draft.section_id || ''} onChange={(e) => save({ section_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">В первый раздел</option>
          {project.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      {fields.filter((f) => f.type !== 'person').length > 0 && (
        <Field label="Дополнительные вопросы из полей проекта">
          <div className="space-y-1.5">
            {fields.filter((f) => f.type !== 'person').map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" disabled={!project.canEdit} checked={draft.field_ids.includes(f.id)}
                  onChange={(e) => save({ field_ids: e.target.checked ? [...draft.field_ids, f.id] : draft.field_ids.filter((x) => x !== f.id) })} />
                {f.name} <span className="text-muted">· {FIELD_TYPES[f.type]}</span>
              </label>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

export default function CustomizeDrawer({ project, open, onClose }) {
  const [tab, setTab] = useState('fields');
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-panel bg-slate-950/30 animate-fade-in" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-panel w-full sm:w-[480px] bg-surface border-l border-line shadow-pop flex flex-col animate-slide-in" aria-label="Настройка проекта">
        <div className="flex items-center gap-2 border-b border-line px-4 h-14 shrink-0">
          <h2 className="flex-1 font-semibold">Настроить проект</h2>
          <a className="btn-ghost h-8" href={`/api/projects/${project.id}/export.csv`} download><Download className="h-4 w-4" />Экспорт в Excel</a>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <Segmented value={tab} onChange={setTab} className="w-full [&>button]:flex-1 [&>button]:justify-center" options={[
            { value: 'fields', label: 'Поля', icon: ListPlus },
            { value: 'rules', label: 'Правила', icon: Zap },
            { value: 'form', label: 'Форма', icon: FileInput },
          ]} />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          {tab === 'fields' && <FieldsTab project={project} />}
          {tab === 'rules' && <RulesTab project={project} />}
          {tab === 'form' && <FormTab project={project} />}
        </div>
      </aside>
    </>,
    document.body,
  );
}

