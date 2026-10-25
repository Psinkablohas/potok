import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { toISODate } from '../lib/format.js';
import { useTaskPanel, useUpdateTask } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function Chip({ task, canEdit, overlay }) {
  const { open } = useTaskPanel();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !canEdit || overlay });
  const color = task.project?.color || '#6366F1';
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); open(task.id); }}
      className={`w-full truncate rounded-md px-1.5 py-1 text-left text-xs font-medium transition-opacity touch-manipulation
        ${task.completed ? 'line-through opacity-60' : ''} ${isDragging ? 'opacity-30' : ''} ${overlay ? 'shadow-pop' : ''}`}
      style={{ background: `${color}22`, borderLeft: `3px solid ${color}` }}
      title={task.title}
    >
      {task.assignee && <span className="mr-1 font-semibold">{task.assignee.name.split(' ')[0]}:</span>}
      {task.title}
    </button>
  );
}

function Day({ date, month, tasks, project, onAdd }) {
  const iso = toISODate(date);
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const today = isToday(date);
  return (
    <div
      ref={setNodeRef}
      className={`group relative min-h-[96px] sm:min-h-[120px] border-b border-r border-line p-1 transition-colors
        ${isSameMonth(date, month) ? 'bg-surface' : 'bg-subtle/50'} ${isOver ? 'bg-primary-soft' : ''}`}
    >
      <div className="flex items-center justify-between px-0.5 pb-1">
        <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-xs font-semibold
          ${today ? 'bg-primary text-primary-ink' : isSameMonth(date, month) ? 'text-ink' : 'text-muted'}`}>
          {format(date, 'd')}
        </span>
        {project.canEdit && (
          <button onClick={() => onAdd(iso)} className="icon-btn h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Добавить задачу на ${format(date, 'd MMMM', { locale: ru })}`}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-1">
        {tasks.slice(0, 4).map((t) => <Chip key={t.id} task={t} canEdit={project.canEdit} />)}
        {tasks.length > 4 && <p className="px-1 text-xs text-muted">ещё {tasks.length - 4}</p>}
      </div>
    </div>
  );
}

export default function CalendarView({ project, tasks }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [activeId, setActiveId] = useState(null);
  const update = useUpdateTask();
  const qc = useQueryClient();
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const list = [];
    for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
    return list;
  }, [month]);

  const byDate = useMemo(() => {
    const map = {};
    for (const t of tasks) if (t.due_date) (map[t.due_date] ||= []).push(t);
    return map;
  }, [tasks]);

  const undated = tasks.filter((t) => !t.due_date && !t.completed).length;

  const addOn = async (iso) => {
    const title = window.prompt(`Новая задача на ${format(new Date(iso), 'd MMMM', { locale: ru })}`);
    if (!title?.trim()) return;
    try {
      await api.post('/tasks', { project_id: project.id, title: title.trim(), due_date: iso });
      qc.invalidateQueries({ queryKey: ['project-tasks', project.id] });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };

  const active = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div className="px-2 sm:px-6 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold capitalize min-w-[150px]">{format(month, 'LLLL yyyy', { locale: ru })}</h2>
        <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-5 w-5" /></button>
        <button className="btn-secondary h-8" onClick={() => setMonth(startOfMonth(new Date()))}>Сегодня</button>
        <button className="icon-btn" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Следующий месяц"><ChevronRight className="h-5 w-5" /></button>
        {undated > 0 && <span className="ml-auto text-sm text-muted">Без срока: {undated} — они видны в списке</span>}
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[700px] rounded-xl border-l border-t border-line overflow-hidden">
          <div className="grid grid-cols-7 bg-subtle">
            {WEEKDAYS.map((d) => <div key={d} className="border-b border-r border-line px-2 py-1.5 text-xs font-semibold text-muted">{d}</div>)}
          </div>
          <DndContext
            sensors={sensors}
            onDragStart={(e) => setActiveId(e.active.id)}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={({ active: a, over }) => {
              setActiveId(null);
              if (!over) return;
              const task = tasks.find((t) => t.id === a.id);
              if (!task || task.due_date === over.id) return;
              const patch = { due_date: over.id };
              // Сдвигаем и дату начала, чтобы длительность сохранилась
              if (task.start_date && task.due_date) {
                const shift = (new Date(over.id) - new Date(task.due_date)) / 86400000;
                patch.start_date = toISODate(addDays(new Date(task.start_date), shift));
              }
              update.mutate({ id: a.id, ...patch });
            }}
          >
            <div className="grid grid-cols-7">
              {days.map((d) => <Day key={d.toISOString()} date={d} month={month} project={project} tasks={byDate[toISODate(d)] || []} onAdd={addOn} />)}
            </div>
            <DragOverlay>{active ? <div className="w-[140px]"><Chip task={active} overlay /></div> : null}</DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
