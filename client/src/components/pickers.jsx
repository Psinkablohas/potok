import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, Check, Flag, Plus, Tag, UserRound, X, Repeat } from 'lucide-react';
import { addDays, nextMonday } from 'date-fns';
import { Avatar, Dropdown, ColorDot } from './ui.jsx';
import { useWorkspace, useWorkspaceId } from '../lib/hooks.js';
import { dueLabel, dueState, dueClass, PRIORITY, RECURRENCE, toISODate, PROJECT_COLORS } from '../lib/format.js';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { t } from '../i18n/index.js';

function SearchBox({ value, onChange, placeholder }) {
  return (
    <input
      autoFocus
      className="input h-9 mb-1"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function AssigneePicker({ value, onChange, disabled, compact = false, members: membersProp }) {
  const { data: ws } = useWorkspace();
  const members = membersProp || ws?.members || [];
  const [q, setQ] = useState('');
  const current = members.find((m) => m.id === value);
  const list = members.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || m.email.toLowerCase().includes(q.toLowerCase()));

  return (
    <Dropdown
      width={280}
      trigger={({ ref, toggle }) => (
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); setQ(''); toggle(); }}
          className={`inline-flex max-w-full min-w-0 items-center gap-2 rounded-md text-sm transition-colors duration-150 disabled:cursor-default
            ${compact ? 'p-1 hover:bg-subtle' : 'h-8 px-2 hover:bg-subtle'}`}
          aria-label={current ? t("Исполнитель: {0}", current.name) : t("Назначить исполнителя")}
        >
          {current ? <Avatar user={current} size={compact ? 22 : 24} /> : (
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed border-muted/60 text-muted">
              <UserRound className="h-3.5 w-3.5" />
            </span>
          )}
          {!compact && <span className={`truncate whitespace-nowrap ${current ? '' : 'text-muted'}`}>{current ? current.name : t("Не назначено")}</span>}
        </button>
      )}
    >
      {(close) => (
        <div onClick={(e) => e.stopPropagation()}>
          <SearchBox value={q} onChange={setQ} placeholder={t("Имя или почта")} />
          {value && (
            <button className="menu-item text-muted" onClick={() => { onChange(null); close(); }}>
              <X className="h-4 w-4" />{' '}{t("Снять исполнителя")}
            </button>
          )}
          {list.map((m) => (
            <button key={m.id} className="menu-item" onClick={() => { onChange(m.id); close(); }}>
              <Avatar user={m} size={24} />
              <span className="flex-1 min-w-0">
                <span className="block truncate">{m.name}</span>
                <span className="block truncate text-xs text-muted">{m.email}</span>
              </span>
              {m.id === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
          {!list.length && <p className="px-2.5 py-3 text-sm text-muted">{t("Никого не нашлось")}</p>}
        </div>
      )}
    </Dropdown>
  );
}

export function DueDatePicker({ value, onChange, disabled, completed, compact = false, startDate, onStartChange }) {
  const state = dueState(value, completed);
  const quick = useMemo(() => {
    const now = new Date();
    return [
      [t("Сегодня"), toISODate(now)],
      [t("Завтра"), toISODate(addDays(now, 1))],
      [t("Через неделю"), toISODate(addDays(now, 7))],
      [t("Следующий понедельник"), toISODate(nextMonday(now))],
    ];
  }, []);

  return (
    <Dropdown
      width={280}
      trigger={({ ref, toggle }) => (
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className={`inline-flex items-center gap-1.5 rounded-md text-sm transition-colors duration-150 hover:bg-subtle disabled:cursor-default
            ${compact ? 'h-7 px-1.5' : 'h-8 px-2'} ${value ? dueClass[state] : 'text-muted'}`}
          aria-label={value ? t("Срок: {0}", dueLabel(value)) : t("Указать срок")}
        >
          <Calendar className="h-4 w-4 shrink-0" />
          {value ? <span className="whitespace-nowrap">{startDate && !compact ? `${dueLabel(startDate)} – ` : ''}{dueLabel(value)}</span> : !compact && <span>{t("Без срока")}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="p-1 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-1">
            {quick.map(([label, d]) => (
              <button key={label} className="rounded-md bg-subtle px-2 py-1.5 text-xs font-medium hover:bg-primary-soft hover:text-primary text-left" onClick={() => { onChange(d); close(); }}>
                {label}
              </button>
            ))}
          </div>
          {onStartChange && (
            <label className="block">
              <span className="text-xs text-muted">{t("Дата начала")}</span>
              <input type="date" className="input h-9 mt-0.5" value={startDate || ''} max={value || undefined} onChange={(e) => onStartChange(e.target.value || null)} />
            </label>
          )}
          <label className="block">
            <span className="text-xs text-muted">{t("Срок")}</span>
            <input type="date" className="input h-9 mt-0.5" value={value || ''} min={startDate || undefined} onChange={(e) => onChange(e.target.value || null)} />
          </label>
          {(value || startDate) && (
            <button className="menu-item text-muted" onClick={() => { onChange(null); onStartChange?.(null); close(); }}>
              <X className="h-4 w-4" />{' '}{t("Убрать даты")}
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}

export function PriorityPicker({ value, onChange, disabled }) {
  const p = PRIORITY[value] || PRIORITY.none;
  return (
    <Dropdown
      width={200}
      trigger={({ ref, toggle }) => (
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-sm hover:bg-subtle transition-colors duration-150 disabled:cursor-default"
          aria-label={t("Приоритет: {0}", p.label)}
        >
          {value === 'none' ? <span className="inline-flex items-center gap-1.5 text-muted"><Flag className="h-4 w-4" />{t("Без приоритета")}</span> : <span className={`chip ${p.cls}`}>{p.label}</span>}
        </button>
      )}
    >
      {(close) => Object.entries(PRIORITY).map(([key, item]) => (
        <button key={key} className="menu-item" onClick={(e) => { e.stopPropagation(); onChange(key); close(); }}>
          {key === 'none' ? <span className="text-muted">{item.label}</span> : <span className={`chip ${item.cls}`}>{item.label}</span>}
          <span className="flex-1" />
          {key === value && <Check className="h-4 w-4 text-primary" />}
        </button>
      ))}
    </Dropdown>
  );
}

export function PriorityBadge({ value }) {
  if (!value || value === 'none') return null;
  const p = PRIORITY[value];
  return <span className={`chip ${p.cls}`}>{p.short}</span>;
}

export function RecurrencePicker({ value, onChange, disabled }) {
  return (
    <Dropdown
      width={220}
      trigger={({ ref, toggle }) => (
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          onClick={toggle}
          className={`inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-sm hover:bg-subtle transition-colors duration-150 disabled:cursor-default ${value ? 'text-ink' : 'text-muted'}`}
        >
          <Repeat className="h-4 w-4" />
          {RECURRENCE[value || '']}
        </button>
      )}
    >
      {(close) => Object.entries(RECURRENCE).map(([key, label]) => (
        <button key={key} className="menu-item" onClick={() => { onChange(key || null); close(); }}>
          <span className="flex-1">{label}</span>
          {(value || '') === key && <Check className="h-4 w-4 text-primary" />}
        </button>
      ))}
    </Dropdown>
  );
}

export function TagChip({ tag, onRemove }) {
  return (
    <span className="chip text-ink" style={{ background: `${tag.color}22`, color: 'inherit' }}>
      <ColorDot color={tag.color} className="h-2 w-2" />
      {tag.name}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 opacity-60 hover:opacity-100" aria-label={t("Убрать метку {0}", tag.name)}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function TagPicker({ selected, onAdd, onRemove, disabled }) {
  const { data: ws } = useWorkspace();
  const wid = useWorkspaceId();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const tags = ws?.tags || [];
  const selectedIds = new Set(selected.map((t) => t.id));
  const list = tags.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  const exact = tags.some((t) => t.name.toLowerCase() === q.trim().toLowerCase());

  const create = async (close) => {
    try {
      const color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
      const tag = await api.post(`/workspaces/${wid}/tags`, { name: q.trim(), color });
      qc.invalidateQueries({ queryKey: ['workspace', wid] });
      onAdd(tag.id);
      setQ('');
      close();
    } catch (e) {
      toast(e.message, { type: 'error' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((t) => <TagChip key={t.id} tag={t} onRemove={disabled ? null : () => onRemove(t.id)} />)}
      {!disabled && (
        <Dropdown
          width={260}
          trigger={({ ref, toggle }) => (
            <button ref={ref} onClick={() => { setQ(''); toggle(); }} className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-sm text-muted hover:bg-subtle hover:text-ink">
              {selected.length ? <Plus className="h-4 w-4" /> : <><Tag className="h-4 w-4" />{t("Добавить метку")}</>}
            </button>
          )}
        >
          {(close) => (
            <div>
              <SearchBox value={q} onChange={setQ} placeholder={t("Найти или создать метку")} />
              {list.map((t) => (
                <button key={t.id} className="menu-item" onClick={() => { selectedIds.has(t.id) ? onRemove(t.id) : onAdd(t.id); close(); }}>
                  <ColorDot color={t.color} />
                  <span className="flex-1 truncate">{t.name}</span>
                  {selectedIds.has(t.id) && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              {q.trim() && !exact && (
                <button className="menu-item text-primary" onClick={() => create(close)}>
                  <Plus className="h-4 w-4" />{t("Создать «{0}»", q.trim())}
                </button>
              )}
              {!list.length && !q && <p className="px-2.5 py-3 text-sm text-muted">{t("Меток пока нет. Начните вводить название.")}</p>}
            </div>
          )}
        </Dropdown>
      )}
    </div>
  );
}

export function ProjectPicker({ projects, value, onChange, disabled }) {
  const current = projects.find((p) => p.id === value);
  return (
    <Dropdown
      width={260}
      trigger={({ ref, toggle }) => (
        <button ref={ref} disabled={disabled} onClick={toggle} className="inline-flex items-center gap-2 h-8 px-2 rounded-md text-sm hover:bg-subtle disabled:cursor-default">
          {current ? <><ColorDot color={current.color} />{current.name}</> : <span className="text-muted">{t("Без проекта (личная)")}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <button className="menu-item text-muted" onClick={() => { onChange(null); close(); }}>{t("Без проекта (личная)")}</button>
          {projects.filter((p) => !p.archived).map((p) => (
            <button key={p.id} className="menu-item" onClick={() => { onChange(p.id); close(); }}>
              <ColorDot color={p.color} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.id === value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}
