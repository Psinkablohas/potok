import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Link2, Copy, Trash2, Bell, BellOff, MoreHorizontal, Paperclip, Lock, ArrowUpRight, ChevronRight,
  FileText, Download, Send, Pencil, GitBranch, Plus, Check, Heart, ThumbsUp, ThumbsDown, PenLine, Diamond,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe, useProjects, useTaskPanel, useToggleComplete, useUpdateTask, useWorkspace, useWorkspaceId } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { getSocket } from '../lib/realtime.js';
import { fmtDateTime, timeAgo, fileSize, PRIORITY, fmtDate, TASK_TYPE, APPROVAL } from '../lib/format.js';
import { FieldEditor } from './CustomFields.jsx';
import { Avatar, CompleteToggle, Dropdown, Spinner } from './ui.jsx';
import { AssigneePicker, DueDatePicker, PriorityPicker, TagPicker, ProjectPicker, RecurrencePicker } from './pickers.jsx';
import { QuickAdd, DueText } from './TaskBits.jsx';
import { t } from '../i18n/index.js';

function AutoTextarea({ value, onSave, className, placeholder, disabled, ariaLabel, singleLine }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [v]);
  const commit = () => { if (v !== value) onSave(v); };
  return (
    <textarea
      ref={ref}
      rows={1}
      value={v}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setV(singleLine ? e.target.value.replace(/\n/g, '') : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (singleLine && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setV(value); e.currentTarget.blur(); }
      }}
      className={`w-full resize-none bg-transparent outline-none rounded-md transition-colors duration-150 hover:bg-subtle/60 focus:bg-subtle/60 disabled:hover:bg-transparent ${className}`}
    />
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] sm:grid-cols-[130px_1fr] items-center gap-2 min-h-[36px]">
      <span className="text-sm text-muted">{label}</span>
      <div className="min-w-0 flex items-center flex-wrap gap-1">{children}</div>
    </div>
  );
}

// Текст комментария: упоминания @[Имя](id) превращаем в подсветку
function CommentBody({ body }) {
  const parts = [];
  const re = /@\[([^\]]{1,100})\]\((\d+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    parts.push(<span key={m.index} className="rounded bg-primary-soft px-1 font-medium text-primary">@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  parts.push(body.slice(last));
  return <p className="whitespace-pre-wrap break-words text-sm">{parts}</p>;
}

function CommentComposer({ taskId, members }) {
  const [text, setText] = useState('');
  const [mention, setMention] = useState(null); // { start, query }
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const qc = useQueryClient();
  const toast = useToast();

  const onChange = (e) => {
    const value = e.target.value;
    setText(value);
    const caret = e.target.selectionStart;
    const before = value.slice(0, caret);
    const m = before.match(/(^|\s)@([\p{L}\w-]{0,30})$/u);
    setMention(m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase() } : null);
  };

  const pick = (member) => {
    const caret = ref.current.selectionStart;
    const token = `@[${member.name}](${member.id}) `;
    setText(text.slice(0, mention.start) + token + text.slice(caret));
    setMention(null);
    requestAnimationFrame(() => ref.current?.focus());
  };

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { body: text.trim() });
      setText('');
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    } catch (e) {
      toast(e.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const matches = mention ? members.filter((m) => m.name.toLowerCase().includes(mention.query)).slice(0, 6) : [];

  return (
    <div className="relative">
      {mention && matches.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 w-64 card shadow-pop p-1 z-pop">
          {matches.map((m) => (
            <button key={m.id} className="menu-item" onMouseDown={(e) => { e.preventDefault(); pick(m); }}>
              <Avatar user={m} size={22} /> {m.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <textarea
          ref={ref}
          rows={2}
          value={text}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            if (e.key === 'Escape') setMention(null);
          }}
          placeholder={t("Напишите комментарий. @ — упомянуть коллегу")}
          aria-label={t("Комментарий")}
          className="flex-1 resize-none bg-transparent text-sm outline-none px-1"
        />
        <button className="btn-primary h-8 px-3" onClick={send} disabled={!text.trim() || busy} aria-label={t("Отправить комментарий")}>
          {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">{t("Ctrl + Enter — отправить")}</p>
    </div>
  );
}

const ACTIVITY_TEXT = {
  created: () => t("создал(а) задачу"),
  renamed: (d) => t("переименовал(а) задачу в «{0}»", d.to),
  assigned: (d, members) => (d.to ? t("назначил(а) исполнителя: {0}", members.find((m) => m.id === d.to)?.name || 'участник') : t("снял(а) исполнителя")),
  due: (d) => (d.to ? t("изменил(а) срок на {0}", fmtDate(d.to, 'd MMMM')) : t("убрал(а) срок")),
  priority: (d) => t("изменил(а) приоритет: {0}", PRIORITY[d.to]?.label.toLowerCase()),
  completed: () => t("завершил(а) задачу"),
  reopened: () => t("вернул(а) задачу в работу"),
  moved_section: (d) => t("переместил(а) в раздел «{0}»", d.to),
  moved_project: () => t("перенёс(ла) в другой проект"),
  dependency: (d) => t("добавил(а) зависимость от «{0}»", d.title),
  recurred: () => t("создано повтором предыдущей задачи"),
  approval: (d) => t("принял(а) решение: {0}", APPROVAL[d.to]?.label.toLowerCase() || 'сброшено'),
  rule: (d) => t("— сработало правило «{0}»", d.name),
  form: (d) => t("— заявка из формы{0}", d.name ? ` от ${d.name}` : ''),
};

function DependencyAdder({ taskId, onAdd }) {
  const wid = useWorkspaceId();
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['search', wid, q],
    queryFn: () => api.get(`/workspaces/${wid}/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 1,
  });
  return (
    <Dropdown
      width={320}
      trigger={({ ref, toggle }) => (
        <button ref={ref} onClick={() => { setQ(''); toggle(); }} className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-sm text-muted hover:bg-subtle hover:text-ink">
          <Plus className="h-4 w-4" />{' '}{t("Ждёт задачу")}
        </button>
      )}
    >
      {(close) => (
        <div>
          <input autoFocus className="input h-9 mb-1" placeholder={t("Найти задачу по названию")} value={q} onChange={(e) => setQ(e.target.value)} />
          {(data?.tasks || []).filter((t) => t.id !== taskId).map((t) => (
            <button key={t.id} className="menu-item" onClick={() => { onAdd(t.id); close(); }}>
              <span className={`flex-1 truncate ${t.completed ? 'line-through text-muted' : ''}`}>{t.title}</span>
              {t.project && <span className="text-xs text-muted truncate max-w-[100px]">{t.project.name}</span>}
            </button>
          ))}
          {q.trim().length > 1 && data && !data.tasks.length && <p className="px-2.5 py-3 text-sm text-muted">{t("Ничего не найдено")}</p>}
          {q.trim().length <= 1 && <p className="px-2.5 py-2 text-xs text-muted">{t("Введите хотя бы 2 символа")}</p>}
        </div>
      )}
    </Dropdown>
  );
}

export default function TaskPanel() {
  const { openId, open, close } = useTaskPanel();
  const { data: me } = useMe();
  const { data: ws } = useWorkspace();
  const { data: projects = [] } = useProjects();
  const qc = useQueryClient();
  const toast = useToast();
  const update = useUpdateTask();
  const toggleComplete = useToggleComplete();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [feed, setFeed] = useState('comments');
  const [editing, setEditing] = useState(null);

  const { data: task, isLoading, error } = useQuery({
    queryKey: ['task', openId],
    queryFn: () => api.get(`/tasks/${openId}`),
    enabled: !!openId,
  });

  const { data: fields = [] } = useQuery({
    queryKey: ['fields', task?.project_id],
    queryFn: () => api.get(`/projects/${task.project_id}/fields`),
    enabled: !!task?.project_id,
  });

  useEffect(() => {
    getSocket()?.emit('watch-task', openId || null);
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]') && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId, close]);

  if (!openId) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['task', openId] });
    if (task?.project_id) qc.invalidateQueries({ queryKey: ['project-tasks', task.project_id] });
  };
  const patch = (fields) => update.mutate({ id: openId, ...fields });
  const call = async (fn, okMsg) => {
    try {
      await fn();
      refresh();
      if (okMsg) toast(okMsg);
    } catch (e) {
      toast(e.message, { type: 'error' });
    }
  };

  const members = ws?.members || [];
  const canEdit = task?.canEdit;
  const following = task?.followers?.some((f) => f.id === me?.user.id);

  const upload = async (files) => {
    if (!files?.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    setUploading(true);
    await call(() => api.post(`/tasks/${openId}/attachments`, fd));
    setUploading(false);
  };

  const remove = async () => {
    if (!window.confirm(t("Удалить задачу вместе с подзадачами и комментариями? Это нельзя отменить."))) return;
    try {
      await api.del(`/tasks/${openId}`);
      if (task.project_id) qc.invalidateQueries({ queryKey: ['project-tasks', task.project_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
      if (task.parent_id) open(task.parent_id); else close();
      toast(t("Задача удалена"));
    } catch (e) {
      toast(e.message, { type: 'error' });
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-panel bg-slate-950/30 lg:hidden animate-fade-in" onClick={close} />
      <aside
        className="fixed inset-y-0 right-0 z-panel w-full sm:w-[560px] lg:w-[600px] bg-surface border-l border-line shadow-pop flex flex-col animate-slide-in"
        aria-label={t("Карточка задачи")}
      >
        {/* Верхняя панель */}
        <div className="flex items-center gap-2 border-b border-line px-3 sm:px-4 h-14 shrink-0">
          {task && task.task_type === 'approval' ? (
            <div className="flex items-center gap-1 overflow-x-auto">
              {[['approved', ThumbsUp, t("Одобрить"), 'hover:border-success hover:text-success', 'border-success bg-success/10 text-success'],
                ['changes', PenLine, t("Нужны правки"), 'hover:border-warn hover:text-warn', 'border-warn bg-warn/10 text-warn'],
                ['rejected', ThumbsDown, t("Отклонить"), 'hover:border-danger hover:text-danger', 'border-danger bg-danger/10 text-danger']].map(([key, Icon, label, hover, active]) => (
                <button key={key} disabled={!canEdit} title={label} aria-label={label} aria-pressed={task.approval_status === key}
                  onClick={() => patch({ approval_status: task.approval_status === key ? 'pending' : key })}
                  className={`btn h-8 px-2.5 border ${task.approval_status === key ? active : `border-line text-ink ${hover}`}`}>
                  <Icon className="h-4 w-4" />{(key === 'approved' || task.approval_status === key) && <span className="hidden sm:inline">{label}</span>}
                </button>
              ))}
            </div>
          ) : task && (
            <button
              disabled={!canEdit}
              onClick={() => toggleComplete(task)}
              className={`btn h-8 border ${task.completed ? 'border-success bg-success/10 text-success' : 'border-line text-ink hover:border-success hover:text-success'}`}
            >
              {task.task_type === 'milestone' ? <Diamond className="h-4 w-4" /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
              {task.task_type === 'milestone'
                ? (task.completed ? t("Веха достигнута") : t("Отметить веху"))
                : (task.completed ? t("Выполнена") : t("Отметить выполненной"))}
            </button>
          )}
          <div className="flex-1" />
          {task && (
            <>
              <button
                className={`icon-btn ${task.likes?.includes(me?.user.id) ? 'text-danger hover:text-danger' : ''}`}
                title={t("Нравится")}
                aria-pressed={task.likes?.includes(me?.user.id)}
                aria-label={t("Нравится{0}", task.likes?.length ? `: ${task.likes.length}` : '')}
                onClick={() => call(() => api.post(`/tasks/${openId}/like`))}
              >
                <Heart className="h-[18px] w-[18px]" fill={task.likes?.includes(me?.user.id) ? 'currentColor' : 'none'} />
                {task.likes?.length > 0 && <span className="ml-0.5 text-xs">{task.likes.length}</span>}
              </button>
              <button className="icon-btn" title={t("Скопировать ссылку")} aria-label={t("Скопировать ссылку")} onClick={() => {
                navigator.clipboard?.writeText(window.location.href).then(() => toast(t("Ссылка скопирована")));
              }}><Link2 className="h-[18px] w-[18px]" /></button>
              <label className="icon-btn" title={t("Прикрепить файл")} aria-label={t("Прикрепить файл")}>
                <Paperclip className="h-[18px] w-[18px]" />
                <input ref={fileRef} type="file" multiple className="sr-only" disabled={!canEdit} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
              </label>
              <Dropdown
                width={240}
                align="end"
                trigger={({ ref, toggle }) => <button ref={ref} onClick={toggle} className="icon-btn" aria-label={t("Ещё")}><MoreHorizontal className="h-[18px] w-[18px]" /></button>}
              >
                {(closeMenu) => (
                  <>
                    <button className="menu-item" onClick={() => { closeMenu(); call(() => api[following ? 'del' : 'post'](`/tasks/${openId}/follow`), following ? t("Вы отписались от задачи") : t("Вы подписаны на задачу")); }}>
                      {following ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                      {following ? t("Отписаться") : t("Подписаться на изменения")}
                    </button>
                    {canEdit && (
                      <button className="menu-item" onClick={async () => {
                        closeMenu();
                        try {
                          const copy = await api.post(`/tasks/${openId}/duplicate`);
                          refresh();
                          open(copy.id);
                          toast(t("Создана копия задачи"));
                        } catch (e) { toast(e.message, { type: 'error' }); }
                      }}><Copy className="h-4 w-4" />{' '}{t("Дублировать")}</button>
                    )}
                    {canEdit && <button className="menu-item text-danger" onClick={() => { closeMenu(); remove(); }}><Trash2 className="h-4 w-4" />{' '}{t("Удалить задачу")}</button>}
                  </>
                )}
              </Dropdown>
            </>
          )}
          <button className="icon-btn" onClick={close} aria-label={t("Закрыть карточку")}><X className="h-5 w-5" /></button>
        </div>

        {isLoading && <div className="flex-1 flex items-center justify-center"><Spinner /></div>}
        {error && <div className="p-6 text-sm text-muted">{error.message}</div>}

        {task && (
          <div
            className="flex-1 overflow-y-auto scrollbar-thin"
            onDragOver={(e) => { if (canEdit) e.preventDefault(); }}
            onDrop={(e) => { if (canEdit && e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}
          >
            <div className="px-4 sm:px-6 py-5 space-y-5">
              {task.parent && (
                <button onClick={() => open(task.parent.id)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
                  <GitBranch className="h-4 w-4" /> {task.parent.title} <ChevronRight className="h-4 w-4" />
                </button>
              )}
              {!canEdit && <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-muted">{t("У вас доступ только для просмотра и комментариев.")}</p>}

              <AutoTextarea
                value={task.title}
                singleLine
                disabled={!canEdit}
                ariaLabel={t("Название задачи")}
                onSave={(v) => v.trim() && patch({ title: v.trim() })}
                className={`text-xl sm:text-2xl font-semibold px-2 py-1 -mx-2 ${task.completed ? 'text-muted line-through' : ''}`}
              />

              <div className="space-y-0.5">
                <Row label={t("Исполнитель")}>
                  <AssigneePicker value={task.assignee_id} disabled={!canEdit} onChange={(v) => patch({ assignee_id: v })} />
                </Row>
                <Row label={t("Срок")}>
                  <DueDatePicker
                    value={task.due_date}
                    startDate={task.start_date}
                    completed={task.completed}
                    disabled={!canEdit}
                    onChange={(v) => patch({ due_date: v })}
                    onStartChange={(v) => patch({ start_date: v })}
                  />
                </Row>
                {!task.parent_id && (
                  <Row label={t("Проект")}>
                    <ProjectPicker projects={projects} value={task.project_id} disabled={!canEdit} onChange={(v) => patch({ project_id: v })} />
                    {task.project_id && task.sections?.length > 0 && (
                      <select
                        className="h-8 rounded-md bg-transparent px-1.5 text-sm text-muted hover:bg-subtle"
                        value={task.section_id || ''}
                        disabled={!canEdit}
                        onChange={(e) => patch({ section_id: Number(e.target.value) })}
                        aria-label={t("Раздел")}
                      >
                        {task.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                  </Row>
                )}
                <Row label={t("Тип")}>
                  <select
                    className="h-8 rounded-md bg-transparent px-1.5 text-sm hover:bg-subtle disabled:hover:bg-transparent"
                    value={task.task_type}
                    disabled={!canEdit}
                    onChange={(e) => patch({ task_type: e.target.value })}
                    aria-label={t("Тип задачи")}
                  >
                    {Object.entries(TASK_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {task.task_type === 'approval' && <span className={`chip ${APPROVAL[task.approval_status || 'pending'].cls}`}>{APPROVAL[task.approval_status || 'pending'].label}</span>}
                </Row>
                <Row label={t("Приоритет")}>
                  <PriorityPicker value={task.priority} disabled={!canEdit} onChange={(v) => patch({ priority: v })} />
                </Row>
                <Row label={t("Повтор")}>
                  <RecurrencePicker value={task.recurrence} disabled={!canEdit} onChange={(v) => patch({ recurrence: v })} />
                </Row>
                <Row label={t("Метки")}>
                  <TagPicker
                    selected={task.tags}
                    disabled={!canEdit}
                    onAdd={(tagId) => call(() => api.post(`/tasks/${openId}/tags`, { tag_id: tagId }))}
                    onRemove={(tagId) => call(() => api.del(`/tasks/${openId}/tags/${tagId}`))}
                  />
                </Row>
                {fields.map((f) => (
                  <Row key={f.id} label={<span className="truncate block" title={f.name}>{f.name}</span>}>
                    <FieldEditor field={f} value={task.fields?.[f.id]} taskId={task.id} projectId={task.project_id} disabled={!canEdit} />
                  </Row>
                ))}
                <Row label={t("Зависимости")}>
                  <div className="w-full space-y-1">
                    {task.blocked_by.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-sm">
                        <Lock className={`h-3.5 w-3.5 shrink-0 ${d.completed ? 'text-success' : 'text-warn'}`} />
                        <span className="text-muted shrink-0">{t("Ждёт:")}</span>
                        <button onClick={() => open(d.id)} className={`truncate hover:text-primary ${d.completed ? 'line-through text-muted' : ''}`}>{d.title}</button>
                        {canEdit && <button className="ml-auto opacity-60 hover:opacity-100" aria-label={t("Убрать зависимость")} onClick={() => call(() => api.del(`/tasks/${openId}/dependencies/${d.id}`))}><X className="h-3.5 w-3.5" /></button>}
                      </div>
                    ))}
                    {task.blocking.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-sm">
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span className="text-muted shrink-0">{t("Блокирует:")}</span>
                        <button onClick={() => open(d.id)} className="truncate hover:text-primary">{d.title}</button>
                      </div>
                    ))}
                    {canEdit && <DependencyAdder taskId={openId} onAdd={(id) => call(() => api.post(`/tasks/${openId}/dependencies`, { depends_on_id: id }))} />}
                  </div>
                </Row>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-1.5">{t("Описание")}</h3>
                <AutoTextarea
                  value={task.description}
                  disabled={!canEdit}
                  ariaLabel={t("Описание задачи")}
                  placeholder={canEdit ? t("Добавьте подробности: цель, ссылки, критерии готовности…") : t("Описания нет")}
                  onSave={(v) => patch({ description: v })}
                  className="min-h-[80px] text-sm leading-relaxed px-3 py-2 border border-line rounded-lg"
                />
              </div>

              {/* Подзадачи */}
              <div>
                <h3 className="text-sm font-semibold mb-1.5">
                  {t("Подзадачи")}{' '}{task.subtasks.length > 0 && <span className="font-normal text-muted">{t("{0} из {1}", task.subtasks.filter((s) => s.completed).length, task.subtasks.length)}</span>}
                </h3>
                <div className="divide-y divide-line rounded-lg border border-line empty:hidden">
                  {task.subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-subtle/60 cursor-pointer" onClick={() => open(s.id)}>
                      <CompleteToggle size="sm" done={s.completed} disabled={!canEdit} onToggle={() => toggleComplete(s)} />
                      <span className={`flex-1 text-sm truncate ${s.completed ? 'line-through text-muted' : ''}`}>{s.title}</span>
                      <DueText task={s} />
                      {s.assignee && <Avatar user={s.assignee} size={22} />}
                    </div>
                  ))}
                </div>
                {canEdit && <QuickAdd className="mt-2" payload={{ parent_id: openId }} label={t("Добавить подзадачу")} placeholder={t("Название подзадачи")} />}
              </div>

              {/* Файлы */}
              {(task.attachments.length > 0 || uploading) && (
                <div>
                  <h3 className="text-sm font-semibold mb-1.5">{t("Файлы")}</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {task.attachments.map((a) => (
                      <div key={a.id} className="group flex items-center gap-2.5 rounded-lg border border-line p-2.5">
                        {a.mime.startsWith('image/') ? (
                          <img src={`/api/attachments/${a.id}`} alt={a.filename} className="h-10 w-10 rounded object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded bg-subtle"><FileText className="h-5 w-5 text-muted" /></span>
                        )}
                        <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="flex-1 min-w-0">
                          <span className="block text-sm truncate hover:text-primary">{a.filename}</span>
                          <span className="block text-xs text-muted">{fileSize(a.size)} · {a.author}</span>
                        </a>
                        <a href={`/api/attachments/${a.id}`} download className="icon-btn h-8 w-8" aria-label={t("Скачать")}><Download className="h-4 w-4" /></a>
                        {canEdit && <button className="icon-btn h-8 w-8" aria-label={t("Удалить файл")} onClick={() => window.confirm(t("Удалить файл?")) && call(() => api.del(`/attachments/${a.id}`))}><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    ))}
                    {uploading && <div className="flex items-center gap-2 p-3 text-sm text-muted"><Spinner className="h-4 w-4" />{' '}{t("Загружаем…")}</div>}
                  </div>
                </div>
              )}
              {canEdit && task.attachments.length === 0 && !uploading && (
                <button onClick={() => fileRef.current?.click()} className="w-full rounded-lg border border-dashed border-line py-3 text-sm text-muted hover:border-primary hover:text-primary transition-colors">
                  {t("Перетащите файлы сюда или нажмите, чтобы прикрепить (до 10 МБ)")}
                </button>
              )}
            </div>

            {/* Обсуждение и история */}
            <div className="border-t border-line bg-bg/60 px-4 sm:px-6 py-5 space-y-4">
              <div className="flex items-center gap-4 text-sm">
                {[['comments', t("Комментарии {0}", task.comments.length || '')], ['activity', t("История")]].map(([k, label]) => (
                  <button key={k} onClick={() => setFeed(k)} className={`pb-1 border-b-2 font-medium transition-colors ${feed === k ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
                ))}
              </div>

              {feed === 'comments' ? (
                <div className="space-y-4">
                  {task.comments.length === 0 && <p className="text-sm text-muted">{t("Комментариев пока нет. Задайте вопрос или отметьте коллегу через @.")}</p>}
                  {task.comments.map((c) => (
                    <div key={c.id} className="flex gap-3 group">
                      <Avatar user={c.author} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold">{c.author?.name || t("Удалённый пользователь")}</span>
                          <span className="text-xs text-muted" title={fmtDateTime(c.created_at)}>{timeAgo(c.created_at)}{c.edited_at ? t(" · изменён") : ''}</span>
                          <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            {c.user_id === me?.user.id && <button className="icon-btn h-7 w-7" aria-label={t("Изменить")} onClick={() => setEditing({ id: c.id, body: c.body })}><Pencil className="h-3.5 w-3.5" /></button>}
                            {(c.user_id === me?.user.id || ws?.role !== 'member') && <button className="icon-btn h-7 w-7" aria-label={t("Удалить")} onClick={() => window.confirm(t("Удалить комментарий?")) && call(() => api.del(`/comments/${c.id}`))}><Trash2 className="h-3.5 w-3.5" /></button>}
                          </span>
                        </div>
                        {editing?.id === c.id ? (
                          <div className="mt-1 space-y-2">
                            <textarea className="input h-auto py-2" rows={3} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} autoFocus />
                            <div className="flex gap-2">
                              <button className="btn-primary h-8" onClick={() => call(() => api.patch(`/comments/${c.id}`, { body: editing.body })).then(() => setEditing(null))}>{t("Сохранить")}</button>
                              <button className="btn-ghost h-8" onClick={() => setEditing(null)}>{t("Отмена")}</button>
                            </div>
                          </div>
                        ) : <CommentBody body={c.body} />}
                        <button
                          onClick={() => call(() => api.post(`/comments/${c.id}/like`))}
                          className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors ${c.likes?.includes(me?.user.id) ? 'text-danger' : 'text-muted hover:text-ink'}`}
                          aria-pressed={c.likes?.includes(me?.user.id)}
                          aria-label={t("Нравится")}
                        >
                          <Heart className="h-3.5 w-3.5" fill={c.likes?.includes(me?.user.id) ? 'currentColor' : 'none'} />
                          {c.likes?.length > 0 && c.likes.length}
                        </button>
                      </div>
                    </div>
                  ))}
                  <CommentComposer taskId={openId} members={members} />
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {task.activity.map((a) => (
                    <li key={a.id} className="flex gap-2 text-sm">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-muted/50 shrink-0" />
                      <span>
                        <span className="font-medium">{a.user_name || t("Кто-то")}</span>{' '}
                        <span className="text-muted">{(ACTIVITY_TEXT[a.type] || (() => a.type))(a.data, members)}</span>
                        <span className="text-xs text-muted"> · {fmtDateTime(a.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2 pt-2 text-xs text-muted flex-wrap">
                <span>{t("Подписаны:")}</span>
                {task.followers.map((f) => <Avatar key={f.id} user={f} size={22} />)}
                <span className="ml-auto">{t("Создал(а) {0} · {1}", task.creator?.name || '—', fmtDateTime(task.created_at))}</span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

