import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, MoreHorizontal, Pencil, Trash2, Plus, Heart } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTaskPanel, useToggleComplete, useUpdateTask } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { Dropdown } from '../components/ui.jsx';
import { AssigneePicker, DueDatePicker, PriorityBadge } from '../components/pickers.jsx';
import { QuickAdd, TaskMeta, Tags } from '../components/TaskBits.jsx';
import { groupBySection, computeDrop, SECTION_PREFIX } from './shared.js';
import { FieldEditor } from '../components/CustomFields.jsx';
import { TaskMark } from '../components/TaskBits.jsx';

// На телефоне — название, исполнитель, срок; на широком экране — все колонки, включая свои поля
const GRID = 'grid grid-cols-[1fr_auto_auto] md:[grid-template-columns:var(--cols)] items-center';
const colsFor = (fields = []) => ({ '--cols': ['minmax(240px,1fr)', '150px', '130px', '110px', '160px', ...fields.map(() => '150px')].join(' ') });
const minWidthFor = (fields = []) => ({ minWidth: `min(100%, ${790 + fields.length * 158}px)` });

export function TaskRow({ task, canEdit, dragHandle, showProject = false, isOverlay = false, fields = [] }) {
  const { open, openId } = useTaskPanel();
  const toggle = useToggleComplete();
  const update = useUpdateTask();
  return (
    <div
      onClick={() => open(task.id)}
      style={colsFor(fields)}
      className={`${GRID} group gap-2 border-b border-line px-2 sm:px-3 min-h-[44px] cursor-pointer transition-colors duration-100
        ${openId === task.id ? 'bg-primary-soft' : 'bg-surface hover:bg-subtle/70'} ${isOverlay ? 'shadow-pop rounded-lg border' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0 py-2">
        {dragHandle ? (
          <span {...dragHandle} onClick={(e) => e.stopPropagation()} className="hidden sm:flex -ml-1 h-6 w-4 items-center justify-center text-muted/0 group-hover:text-muted cursor-grab active:cursor-grabbing touch-none" aria-label="Перетащить">
            <GripVertical className="h-4 w-4" />
          </span>
        ) : <span className="hidden sm:block w-3" />}
        <TaskMark task={task} disabled={!canEdit} onToggle={() => toggle(task)} />
        <div className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${task.completed ? 'text-muted line-through' : ''}`}>{task.title}</span>
          <TaskMeta task={task} showProject={showProject} />
        </div>
        {task.likes?.length > 0 && <span className="hidden sm:inline-flex items-center gap-0.5 text-xs text-muted"><Heart className="h-3.5 w-3.5" />{task.likes.length}</span>}
      </div>
      <div className="hidden md:block" onClick={(e) => e.stopPropagation()}>
        <AssigneePicker value={task.assignee_id} disabled={!canEdit} onChange={(v) => update.mutate({ id: task.id, assignee_id: v })} />
      </div>
      <div className="md:hidden" onClick={(e) => e.stopPropagation()}>
        <AssigneePicker compact value={task.assignee_id} disabled={!canEdit} onChange={(v) => update.mutate({ id: task.id, assignee_id: v })} />
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <DueDatePicker compact value={task.due_date} completed={task.completed} disabled={!canEdit} onChange={(v) => update.mutate({ id: task.id, due_date: v })} />
      </div>
      <div className="hidden md:block"><PriorityBadge value={task.priority} /></div>
      <div className="hidden md:block min-w-0"><Tags tags={task.tags} max={2} /></div>
      {fields.map((f) => (
        <div key={f.id} className="hidden md:block min-w-0" onClick={(e) => e.stopPropagation()}>
          <FieldEditor compact field={f} value={task.fields?.[f.id]} taskId={task.id} projectId={task.project_id} disabled={!canEdit} />
        </div>
      ))}
    </div>
  );
}

function SortableRow({ task, canEdit, fields }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <TaskRow task={task} canEdit={canEdit} fields={fields} dragHandle={canEdit ? { ...attributes, ...listeners } : null} />
    </div>
  );
}

function SectionBlock({ section, tasks, project, collapsed, onToggle, fields }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${SECTION_PREFIX}${section.id}` });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['project', project.id] });
    qc.invalidateQueries({ queryKey: ['project-tasks', project.id] });
  };
  const rename = async () => {
    setRenaming(false);
    if (!name.trim() || name === section.name) return setName(section.name);
    try { await api.patch(`/sections/${section.id}`, { name: name.trim() }); refresh(); } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const remove = async () => {
    if (!window.confirm(`Удалить раздел «${section.name}»? Задачи из него переместятся в первый раздел.`)) return;
    try { await api.del(`/sections/${section.id}`); refresh(); } catch (e) { toast(e.message, { type: 'error' }); }
  };

  return (
    <section className="mb-6">
      <div className="group flex items-center gap-1 px-1 sm:px-2 h-10">
        <button onClick={onToggle} className="icon-btn h-7 w-7" aria-label={collapsed ? 'Развернуть раздел' : 'Свернуть раздел'} aria-expanded={!collapsed}>
          <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        {renaming ? (
          <input autoFocus className="input h-8 max-w-xs font-semibold" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setName(section.name); setRenaming(false); } }} />
        ) : (
          <h3 className="font-semibold text-[15px] truncate" onDoubleClick={() => project.canEdit && setRenaming(true)}>{section.name}</h3>
        )}
        <span className="text-sm text-muted ml-1">{tasks.length}</span>
        {project.canEdit && (
          <Dropdown width={220} trigger={({ ref, toggle }) => (
            <button ref={ref} onClick={toggle} className="icon-btn h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" aria-label="Действия с разделом"><MoreHorizontal className="h-4 w-4" /></button>
          )}>
            {(close) => (
              <>
                <button className="menu-item" onClick={() => { close(); setRenaming(true); }}><Pencil className="h-4 w-4" />Переименовать</button>
                <button className="menu-item text-danger" onClick={() => { close(); remove(); }}><Trash2 className="h-4 w-4" />Удалить раздел</button>
              </>
            )}
          </Dropdown>
        )}
      </div>
      {!collapsed && (
        <div ref={setNodeRef} className={`border-t border-line rounded-b-lg transition-colors ${isOver && !tasks.length ? 'bg-primary-soft' : ''}`}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((t) => <SortableRow key={t.id} task={t} canEdit={project.canEdit} fields={fields} />)}
          </SortableContext>
          {!tasks.length && <div className="px-4 py-3 text-sm text-muted">Здесь пока пусто{project.canEdit ? ' — перетащите задачу или добавьте новую' : ''}</div>}
          {project.canEdit && (
            <div className="px-3 sm:px-10 py-2.5">
              <QuickAdd payload={{ project_id: project.id, section_id: section.id }} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function useTaskDnd(groups) {
  const update = useUpdateTask();
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handlers = {
    sensors,
    collisionDetection: closestCorners,
    onDragStart: (e) => setActiveId(e.active.id),
    onDragCancel: () => setActiveId(null),
    onDragEnd: ({ active, over }) => {
      setActiveId(null);
      const drop = computeDrop(groups, active.id, over?.id);
      if (drop) update.mutate({ id: active.id, ...drop });
    },
  };
  return { handlers, activeId };
}

export default function ListView({ project, tasks, fields = [] }) {
  const groups = useMemo(() => groupBySection(tasks, project.sections), [tasks, project.sections]);
  const [collapsed, setCollapsed] = useState({});
  const { handlers, activeId } = useTaskDnd(groups);
  const active = activeId ? tasks.find((t) => t.id === activeId) : null;
  const qc = useQueryClient();
  const toast = useToast();

  const addSection = async () => {
    const name = window.prompt('Название раздела');
    if (!name?.trim()) return;
    try {
      await api.post(`/projects/${project.id}/sections`, { name: name.trim() });
      qc.invalidateQueries({ queryKey: ['project', project.id] });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };

  return (
    <div className="px-2 sm:px-6 py-4 overflow-x-auto scrollbar-thin">
     <div style={minWidthFor(fields)} className="md:min-w-0">
      <div style={colsFor(fields)} className={`${GRID} gap-2 px-2 sm:px-3 h-9 text-xs font-medium uppercase tracking-wide text-muted border-b border-line`}>
        <span className="pl-0 sm:pl-7">Задача</span>
        <span className="hidden md:block pl-2">Исполнитель</span>
        <span className="hidden md:block pl-1.5">Срок</span>
        <span className="hidden md:block">Приоритет</span>
        <span className="hidden md:block">Метки</span>
        {fields.map((f) => <span key={f.id} className="hidden md:block truncate pl-1.5 normal-case tracking-normal text-[13px]">{f.name}</span>)}
      </div>
      <DndContext {...handlers}>
        <div className="pt-3">
          {project.sections.map((s) => (
            <SectionBlock
              key={s.id}
              section={s}
              project={project}
              tasks={groups.get(s.id) || []}
              fields={fields}
              collapsed={!!collapsed[s.id]}
              onToggle={() => setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))}
            />
          ))}
        </div>
        <DragOverlay>{active ? <TaskRow task={active} canEdit isOverlay fields={fields} /> : null}</DragOverlay>
      </DndContext>
      {project.canEdit && (
        <button onClick={addSection} className="btn-ghost ml-1"><Plus className="h-4 w-4" />Добавить раздел</button>
      )}
     </div>
    </div>
  );
}
