import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTaskPanel, useToggleComplete } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { Avatar } from '../components/ui.jsx';
import { PriorityBadge } from '../components/pickers.jsx';
import { QuickAdd, TaskMeta, Tags, DueText, TaskMark } from '../components/TaskBits.jsx';
import { groupBySection, SECTION_PREFIX } from './shared.js';
import { useTaskDnd } from './ListView.jsx';
import { t } from '../i18n/index.js';

function Card({ task, canEdit, overlay = false }) {
  const { open, openId } = useTaskPanel();
  const toggle = useToggleComplete();
  return (
    <div
      onClick={() => open(task.id)}
      className={`card p-3 cursor-pointer transition-colors duration-150 hover:border-primary/40
        ${openId === task.id ? 'border-primary ring-2 ring-primary/20' : ''} ${overlay ? 'shadow-pop rotate-1' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5"><TaskMark size="sm" task={task} disabled={!canEdit} onToggle={() => toggle(task)} /></span>
        <span className={`flex-1 text-sm font-medium leading-snug break-words ${task.completed ? 'line-through text-muted' : ''}`}>{task.title}</span>
      </div>
      {(task.tags.length > 0 || task.priority !== 'none') && (
        <div className="mt-2 flex flex-wrap items-center gap-1"><PriorityBadge value={task.priority} /><Tags tags={task.tags} max={3} /></div>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <TaskMeta task={task} />
        <span className="flex-1" />
        <DueText task={task} />
        {task.assignee && <Avatar user={task.assignee} size={22} />}
      </div>
    </div>
  );
}

function SortableCard({ task, canEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canEdit });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }} className="touch-manipulation">
      <Card task={task} canEdit={canEdit} />
    </div>
  );
}

function Column({ section, tasks, project }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${SECTION_PREFIX}${section.id}` });
  return (
    <div className="flex w-[280px] sm:w-[300px] shrink-0 flex-col max-h-full">
      <div className="flex items-center gap-2 px-1 pb-2">
        <h3 className="font-semibold text-sm truncate">{section.name}</h3>
        <span className="text-sm text-muted">{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-[120px] overflow-y-auto scrollbar-thin rounded-xl p-2 space-y-2 transition-colors ${isOver ? 'bg-primary-soft' : 'bg-subtle/70'}`}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => <SortableCard key={t.id} task={t} canEdit={project.canEdit} />)}
        </SortableContext>
        {project.canEdit && <QuickAdd className="px-1 py-1" payload={{ project_id: project.id, section_id: section.id }} />}
      </div>
    </div>
  );
}

export default function BoardView({ project, tasks }) {
  const groups = useMemo(() => groupBySection(tasks, project.sections), [tasks, project.sections]);
  const { handlers, activeId } = useTaskDnd(groups);
  const active = activeId ? tasks.find((t) => t.id === activeId) : null;
  const qc = useQueryClient();
  const toast = useToast();

  const addColumn = async () => {
    const name = window.prompt(t("Название колонки"));
    if (!name?.trim()) return;
    try {
      await api.post(`/projects/${project.id}/sections`, { name: name.trim() });
      qc.invalidateQueries({ queryKey: ['project', project.id] });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };

  return (
    <DndContext {...handlers}>
      <div className="flex h-full gap-3 overflow-x-auto scrollbar-thin px-3 sm:px-6 py-4">
        {project.sections.map((s) => <Column key={s.id} section={s} project={project} tasks={groups.get(s.id) || []} />)}
        {project.canEdit && (
          <button onClick={addColumn} className="flex h-11 w-[220px] shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm text-muted hover:border-primary hover:text-primary transition-colors">
            <Plus className="h-4 w-4" />{' '}{t("Добавить колонку")}
          </button>
        )}
      </div>
      <DragOverlay>{active ? <div className="w-[280px]"><Card task={active} canEdit overlay /></div> : null}</DragOverlay>
    </DndContext>
  );
}
