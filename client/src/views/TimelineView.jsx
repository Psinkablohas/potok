import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, differenceInCalendarDays, format, isToday, isWeekend, parseISO, startOfWeek } from 'date-fns';
import { dateLocale as ru } from '../i18n/index.js';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { toISODate } from '../lib/format.js';
import { useTaskPanel, useUpdateTask } from '../lib/hooks.js';
import { Avatar } from '../components/ui.jsx';
import { groupBySection } from './shared.js';
import { t } from '../i18n/index.js';

const DAY_W = 36;
const ROW_H = 40;
const DAYS = 84;

function Bar({ task, rangeStart, canEdit }) {
  const { open } = useTaskPanel();
  const update = useUpdateTask();
  const [drag, setDrag] = useState(null); // { mode, x0, delta }
  const moved = useRef(false);

  const due = parseISO(task.due_date);
  const start = task.start_date ? parseISO(task.start_date) : due;
  let s = differenceInCalendarDays(start, rangeStart);
  let e = differenceInCalendarDays(due, rangeStart);
  if (drag) {
    if (drag.mode === 'move') { s += drag.delta; e += drag.delta; }
    if (drag.mode === 'start') s = Math.min(s + drag.delta, e);
    if (drag.mode === 'end') e = Math.max(e + drag.delta, s);
  }
  const color = task.project?.color || '#6366F1';

  const begin = (mode) => (ev) => {
    if (!canEdit) return;
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    moved.current = false;
    setDrag({ mode, x0: ev.clientX, delta: 0 });
  };
  const onMove = (ev) => {
    if (!drag) return;
    const delta = Math.round((ev.clientX - drag.x0) / DAY_W);
    if (delta !== drag.delta) { moved.current = true; setDrag({ ...drag, delta }); }
  };
  const onUp = () => {
    if (!drag) return;
    const { mode, delta } = drag;
    setDrag(null);
    if (!delta) return;
    const shift = (d) => toISODate(addDays(d, delta));
    if (mode === 'move') update.mutate({ id: task.id, due_date: shift(due), start_date: task.start_date ? shift(start) : null });
    if (mode === 'end') update.mutate({ id: task.id, due_date: toISODate(addDays(rangeStart, Math.max(e, s))) });
    if (mode === 'start') update.mutate({ id: task.id, start_date: toISODate(addDays(rangeStart, Math.min(s, e))) });
  };

  if (e < 0 || s >= DAYS) return null;
  const left = Math.max(s, 0) * DAY_W + 2;
  const width = (Math.min(e, DAYS - 1) - Math.max(s, 0) + 1) * DAY_W - 4;

  return (
    <div
      className={`absolute top-1.5 h-7 rounded-md flex items-center text-xs font-medium select-none group/bar
        ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${task.completed ? 'opacity-50' : ''} ${drag ? 'ring-2 ring-primary/40 z-10' : ''}`}
      style={{ left, width, background: `${color}33`, borderLeft: `3px solid ${color}` }}
      onPointerDown={begin('move')}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onClick={() => { if (!moved.current) open(task.id); }}
      title={`${task.title}${task.start_date ? ` · ${task.start_date} – ` : ' · '}${task.due_date}`}
    >
      {canEdit && <span onPointerDown={begin('start')} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" aria-hidden />}
      <span className="truncate px-2 text-ink">{task.title}</span>
      {canEdit && <span onPointerDown={begin('end')} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" aria-hidden />}
    </div>
  );
}

export default function TimelineView({ project, tasks }) {
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(addDays(new Date(), -14), { weekStartsOn: 1 }));
  const scrollRef = useRef(null);
  const { open } = useTaskPanel();
  const update = useUpdateTask();
  const groups = useMemo(() => groupBySection(tasks, project.sections), [tasks, project.sections]);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(rangeStart, i)), [rangeStart]);

  useEffect(() => {
    const el = scrollRef.current;
    const idx = differenceInCalendarDays(new Date(), rangeStart);
    if (el && idx >= 0 && idx < DAYS) el.scrollLeft = Math.max(0, idx * DAY_W - 120);
    // прокрутка к «сегодня» только при первом открытии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = [];
  for (const s of project.sections) {
    rows.push({ type: 'section', section: s });
    for (const t of groups.get(s.id) || []) rows.push({ type: 'task', task: t });
  }

  const months = [];
  days.forEach((d, i) => {
    const key = format(d, 'LLLL yyyy', { locale: ru });
    if (!months.length || months[months.length - 1].key !== key) months.push({ key, start: i, count: 1 });
    else months[months.length - 1].count++;
  });

  const todayIdx = differenceInCalendarDays(new Date(), rangeStart);

  return (
    <div className="flex h-full flex-col px-2 sm:px-6 py-4">
      <div className="mb-3 flex items-center gap-2">
        <button className="icon-btn" onClick={() => setRangeStart((d) => addDays(d, -28))} aria-label={t("Раньше")}><ChevronLeft className="h-5 w-5" /></button>
        <button className="btn-secondary h-8" onClick={() => {
          setRangeStart(startOfWeek(addDays(new Date(), -14), { weekStartsOn: 1 }));
          requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = 14 * DAY_W - 120; });
        }}>{t("Сегодня")}</button>
        <button className="icon-btn" onClick={() => setRangeStart((d) => addDays(d, 28))} aria-label={t("Позже")}><ChevronRight className="h-5 w-5" /></button>
        <span className="ml-2 hidden sm:inline text-sm text-muted">{t("Перетаскивайте полосы, чтобы менять даты. Края — изменить длительность.")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-line bg-surface flex">
        {/* Названия задач */}
        <div className="w-[150px] sm:w-[260px] shrink-0 border-r border-line overflow-hidden flex flex-col">
          <div className="h-[52px] shrink-0 border-b border-line px-3 flex items-end pb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("Задача")}</div>
          <div className="overflow-hidden" id="tl-names">
            {rows.map((r) => r.type === 'section' ? (
              <div key={`s${r.section.id}`} className="flex items-center px-3 text-sm font-semibold bg-subtle/60 border-b border-line" style={{ height: ROW_H }}>{r.section.name}</div>
            ) : (
              <button key={r.task.id} onClick={() => open(r.task.id)} className="flex w-full items-center gap-2 px-3 text-left text-sm border-b border-line hover:bg-subtle/60" style={{ height: ROW_H }}>
                {r.task.blocked && <Lock className="h-3.5 w-3.5 text-warn shrink-0" />}
                <span className={`truncate flex-1 ${r.task.completed ? 'line-through text-muted' : ''}`}>{r.task.title}</span>
                {r.task.assignee && <Avatar user={r.task.assignee} size={20} className="hidden sm:inline-flex" />}
              </button>
            ))}
          </div>
        </div>

        {/* Шкала */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto scrollbar-thin"
          onScroll={(e) => { const n = document.getElementById('tl-names'); if (n) n.scrollTop = e.currentTarget.scrollTop; }}
        >
          <div style={{ width: DAYS * DAY_W }} className="relative">
            <div className="sticky top-0 z-[5] bg-surface border-b border-line h-[52px]">
              <div className="flex h-6">
                {months.map((m) => (
                  <div key={m.key} className="border-r border-line px-2 text-xs font-semibold capitalize text-muted truncate leading-6" style={{ width: m.count * DAY_W }}>{m.key}</div>
                ))}
              </div>
              <div className="flex h-[27px]">
                {days.map((d) => (
                  <div key={d.toISOString()} className={`flex flex-col items-center justify-center border-r border-line text-[11px] leading-none ${isWeekend(d) ? 'text-muted/70' : 'text-muted'}`} style={{ width: DAY_W }}>
                    <span className={isToday(d) ? 'rounded bg-primary text-primary-ink px-1 py-0.5 font-semibold' : ''}>{format(d, 'd')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Фон: выходные и линия сегодняшнего дня */}
            <div className="absolute inset-x-0 top-[52px] bottom-0 flex pointer-events-none">
              {days.map((d) => <div key={d.toISOString()} className={`border-r border-line/60 ${isWeekend(d) ? 'bg-subtle/60' : ''}`} style={{ width: DAY_W }} />)}
            </div>
            {todayIdx >= 0 && todayIdx < DAYS && (
              <div className="absolute top-[52px] bottom-0 w-0.5 bg-primary/70 pointer-events-none z-[4]" style={{ left: todayIdx * DAY_W + DAY_W / 2 }} />
            )}

            {rows.map((r) => r.type === 'section' ? (
              <div key={`s${r.section.id}`} className="relative border-b border-line bg-subtle/40" style={{ height: ROW_H }} />
            ) : (
              <div
                key={r.task.id}
                className="relative border-b border-line"
                style={{ height: ROW_H }}
                onClick={(e) => {
                  // Задаче без срока можно поставить дату кликом по шкале
                  if (r.task.due_date || !project.canEdit) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const idx = Math.floor((e.clientX - rect.left) / DAY_W);
                  update.mutate({ id: r.task.id, due_date: toISODate(addDays(rangeStart, idx)) });
                }}
              >
                {r.task.due_date ? <Bar task={r.task} rangeStart={rangeStart} canEdit={project.canEdit} /> : (
                  project.canEdit && <span className="absolute inset-0 flex items-center px-3 text-xs text-muted/0 hover:text-muted cursor-pointer">{t("Нажмите на день, чтобы назначить срок")}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
