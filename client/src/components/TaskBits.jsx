import { useState } from 'react';
import { GitBranch, MessageSquare, Paperclip, Lock, Repeat, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { dueLabel, dueState, dueClass } from '../lib/format.js';
import { ColorDot } from './ui.jsx';
import { TagChip } from './pickers.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

// Значки под названием задачи: подзадачи, комментарии, файлы, блокировка, повтор
export function TaskMeta({ task, showProject = false }) {
  const items = [];
  if (task.blocked) items.push(<span key="b" className="inline-flex items-center gap-1 text-warn" title="Ждёт другую задачу"><Lock className="h-3.5 w-3.5" />Ждёт</span>);
  if (task.recurrence) items.push(<Repeat key="r" className="h-3.5 w-3.5" aria-label="Повторяется" />);
  if (task.subtask_count) items.push(<span key="s" className="inline-flex items-center gap-1" title="Подзадачи"><GitBranch className="h-3.5 w-3.5" />{task.subtask_done}/{task.subtask_count}</span>);
  if (task.comment_count) items.push(<span key="c" className="inline-flex items-center gap-1" title="Комментарии"><MessageSquare className="h-3.5 w-3.5" />{task.comment_count}</span>);
  if (task.attachment_count) items.push(<span key="a" className="inline-flex items-center gap-1" title="Файлы"><Paperclip className="h-3.5 w-3.5" />{task.attachment_count}</span>);
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
export function QuickAdd({ payload, placeholder = 'Название задачи', onCreated, label = 'Добавить задачу', className = '', autoOpen = false }) {
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
      <p className="mt-1 text-xs text-muted">Enter — добавить, Esc — отмена</p>
    </div>
  );
}
