import { useState } from 'react';
import { GitBranch, MessageSquare, Paperclip, Lock, Repeat, Plus, Diamond, ThumbsUp, ThumbsDown, PenLine, Hourglass } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { dueLabel, dueState, dueClass } from '../lib/format.js';
import { ColorDot, CompleteToggle } from './ui.jsx';
import { TagChip } from './pickers.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { t } from '../i18n/index.js';

// Отметка слева от названия: галочка для задачи, ромб для вехи, значок решения для согласования
export function TaskMark({ task, onToggle, disabled, size = 'md' }) {
  if (task.task_type === 'milestone') {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? t("Веха достигнута") : t("Отметить веху достигнутой")}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`relative inline-flex h-5 w-5 shrink-0 items-center justify-center transition-colors before:absolute before:-inset-3 before:content-[''] ${task.completed ? 'text-success' : 'text-muted hover:text-success'}`}
      >
        <Diamond className="h-[18px] w-[18px]" fill={task.completed ? 'currentColor' : 'none'} strokeWidth={2} />
      </button>
    );
  }
  if (task.task_type === 'approval') {
    const map = {
      approved: [ThumbsUp, 'text-success', t("Одобрено")],
      rejected: [ThumbsDown, 'text-danger', t("Отклонено")],
      changes: [PenLine, 'text-warn', t("Нужны правки")],
      pending: [Hourglass, 'text-muted', t("Ждёт решения")],
    };
    const [Icon, cls, label] = map[task.approval_status || 'pending'];
    return <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center ${cls}`} title={label} aria-label={label}><Icon className="h-4 w-4" /></span>;
  }
  return <CompleteToggle size={size} done={task.completed} disabled={disabled} onToggle={onToggle} />;
}

// Значки под названием задачи: подзадачи, комментарии, файлы, блокировка, повтор
export function TaskMeta({ task, showProject = false }) {
  const items = [];
  if (task.blocked) items.push(<span key="b" className="inline-flex items-center gap-1 text-warn" title={t("Ждёт другую задачу")}><Lock className="h-3.5 w-3.5" />{t("Ждёт")}</span>);
  if (task.recurrence) items.push(<Repeat key="r" className="h-3.5 w-3.5" aria-label={t("Повторяется")} />);
  if (task.subtask_count) items.push(<span key="s" className="inline-flex items-center gap-1" title={t("Подзадачи")}><GitBranch className="h-3.5 w-3.5" />{task.subtask_done}/{task.subtask_count}</span>);
  if (task.comment_count) items.push(<span key="c" className="inline-flex items-center gap-1" title={t("Комментарии")}><MessageSquare className="h-3.5 w-3.5" />{task.comment_count}</span>);
  if (task.attachment_count) items.push(<span key="a" className="inline-flex items-center gap-1" title={t("Файлы")}><Paperclip className="h-3.5 w-3.5" />{task.attachment_count}</span>);
  if (showProject && task.project) items.push(<span key="p" className="inline-flex items-center gap-1 truncate"><ColorDot color={task.project.color} className="h-2 w-2" />{task.project.name}</span>);
  if (!items.length) return null;
  return <span className="flex items-center gap-2.5 text-xs text-muted min-w-0">{items}</span>;
}

export function DueText({ task, className = '' }) {
  if (!task.due_date) return null;
  return <span className={`text-xs font-medium whitespace-nowrap ${dueClass[dueState(task.due_date, task.completed)]} ${className}`}>{dueLabel(task.due_date)}</span>;
}

export function Tags({ tags, max = 3 }) {
  if (!tags?.length) return null;
  return (
    <span className="flex items-center gap-1 flex-wrap">
      {tags.slice(0, max).map((t) => <TagChip key={t.id} tag={t} />)}
      {tags.length > max && <span className="text-xs text-muted">+{tags.length - max}</span>}
    </span>
  );
}

// Быстрое добавление задачи: Enter — создать и продолжить, Esc — закрыть
export function QuickAdd({ payload, placeholder = t("Название задачи"), onCreated, label = t("Добавить задачу"), className = '', autoOpen = false }) {
  const [open, setOpen] = useState(autoOpen);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const task = await api.post('/tasks', { ...payload, title: t });
      setTitle('');
      if (payload.project_id) qc.invalidateQueries({ queryKey: ['project-tasks', payload.project_id] });
      if (payload.parent_id) qc.invalidateQueries({ queryKey: ['task', payload.parent_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
      onCreated?.(task);
    } catch (e) {
      toast(e.message, { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors duration-150 ${className}`}>
        <Plus className="h-4 w-4" /> {label}
      </button>
    );
  }
  return (
    <div className={className}>
      <input
        autoFocus
        className="input h-9"
        placeholder={placeholder}
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') { setOpen(false); setTitle(''); }
        }}
        onBlur={() => { if (!title.trim()) setOpen(false); }}
        aria-label={placeholder}
      />
      <p className="mt-1 text-xs text-muted">{t("Enter — добавить, Esc — отмена")}</p>
    </div>
  );
}
