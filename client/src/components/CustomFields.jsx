import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useWorkspace } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { fmtDate } from '../lib/format.js';
import { Avatar, Dropdown, ColorDot } from './ui.jsx';
import { t } from '../i18n/index.js';

// Короткое отображение значения поля в списке и на карточке
export function FieldValue({ field, value, members = [] }) {
  if (value === undefined || value === null || value === '') return null;
  if (field.type === 'select') {
    const o = field.options.find((x) => x.id === value);
    if (!o) return null;
    return <span className="chip text-ink truncate max-w-full" style={{ background: `${o.color}26` }}><ColorDot color={o.color} className="h-2 w-2" />{o.name}</span>;
  }
  if (field.type === 'person') {
    const m = members.find((x) => x.id === value);
    return m ? <span className="inline-flex items-center gap-1.5 text-sm truncate"><Avatar user={m} size={20} />{m.name}</span> : null;
  }
  if (field.type === 'date') return <span className="text-sm">{fmtDate(value, 'd MMM yyyy')}</span>;
  if (field.type === 'number') return <span className="text-sm tabular-nums">{Number(value).toLocaleString('ru-RU')}</span>;
  return <span className="text-sm truncate">{String(value)}</span>;
}

// Редактор значения поля (в карточке задачи и в ячейке списка)
export function FieldEditor({ field, value, taskId, projectId, disabled, compact = false }) {
  const { data: ws } = useWorkspace();
  const members = ws?.members || [];
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);

  const save = async (v) => {
    // Мгновенно обновляем кэш, затем сохраняем
    const patchCache = (list) => Array.isArray(list) ? list.map((t) => (t.id === taskId ? { ...t, fields: { ...t.fields, [field.id]: v } } : t)) : list;
    qc.setQueryData(['project-tasks', projectId], patchCache);
    qc.setQueryData(['task', taskId], (t) => (t ? { ...t, fields: { ...t.fields, [field.id]: v } } : t));
    try {
      await api.put(`/tasks/${taskId}/fields/${field.id}`, { value: v });
    } catch (e) {
      toast(e.message, { type: 'error' });
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task', taskId] });
    }
  };

  const btn = `inline-flex items-center min-w-0 max-w-full rounded-md text-sm hover:bg-subtle transition-colors disabled:cursor-default ${compact ? 'h-8 px-1.5' : 'h-8 px-2'}`;
  const empty = <span className="text-muted">{compact ? '' : '—'}</span>;

  if (field.type === 'select' || field.type === 'person') {
    const options = field.type === 'select'
      ? field.options.map((o) => ({ id: o.id, label: o.name, icon: <ColorDot color={o.color} /> }))
      : members.map((m) => ({ id: m.id, label: m.name, icon: <Avatar user={m} size={20} /> }));
    return (
      <Dropdown width={240} trigger={({ ref, toggle }) => (
        <button ref={ref} type="button" disabled={disabled} className={btn} onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={field.name}>
          {value !== undefined && value !== null ? <FieldValue field={field} value={value} members={members} /> : empty}
        </button>
      )}>
        {(close) => (
          <div onClick={(e) => e.stopPropagation()}>
            {value !== undefined && value !== null && <button className="menu-item text-muted" onClick={() => { save(null); close(); }}><X className="h-4 w-4" />{t("Очистить")}</button>}
            {options.map((o) => (
              <button key={o.id} className="menu-item" onClick={() => { save(o.id); close(); }}>
                {o.icon}<span className="flex-1 truncate">{o.label}</span>{o.id === value && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </Dropdown>
    );
  }

  if (field.type === 'date') {
    return (
      <input
        type="date"
        disabled={disabled}
        value={value || ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => save(e.target.value || null)}
        className="h-8 rounded-md bg-transparent px-1.5 text-sm hover:bg-subtle focus:bg-subtle outline-none max-w-full"
        aria-label={field.name}
      />
    );
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      disabled={disabled}
      value={text}
      placeholder={compact ? '' : '—'}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (String(text) !== String(value ?? '')) save(text === '' ? null : field.type === 'number' ? Number(text) : text); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(value ?? ''); e.currentTarget.blur(); } }}
      className="h-8 w-full min-w-0 rounded-md bg-transparent px-2 text-sm hover:bg-subtle focus:bg-subtle outline-none tabular-nums"
      aria-label={field.name}
    />
  );
}
