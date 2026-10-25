import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  List, Columns3, CalendarDays, GanttChart, Search, MoreHorizontal, Users, Archive, Trash2, Pencil, Lock, Globe, SlidersHorizontal, X, ArchiveRestore,
  LayoutDashboard, BarChart3, MessagesSquare, Paperclip, Settings2,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe, useProject, useProjectTasks, useLocalState, useWorkspace } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { Avatar, Dropdown, Modal, PageLoader, EmptyState, Field } from '../components/ui.jsx';
import { applyFilters } from '../views/shared.js';
import ListView from '../views/ListView.jsx';
import BoardView from '../views/BoardView.jsx';
import CalendarView from '../views/CalendarView.jsx';
import TimelineView from '../views/TimelineView.jsx';
import OverviewView from '../views/OverviewView.jsx';
import DashboardView from '../views/DashboardView.jsx';
import MessagesView from '../views/MessagesView.jsx';
import FilesView from '../views/FilesView.jsx';
import CustomizeDrawer from '../components/CustomizeDrawer.jsx';
import { PROJECT_COLORS, ROLE_LABEL } from '../lib/format.js';

const VIEWS = [
  { value: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { value: 'list', label: 'Список', icon: List },
  { value: 'board', label: 'Доска', icon: Columns3 },
  { value: 'timeline', label: 'График', icon: GanttChart },
  { value: 'calendar', label: 'Календарь', icon: CalendarDays },
  { value: 'dashboard', label: 'Панель', icon: BarChart3 },
  { value: 'messages', label: 'Сообщения', icon: MessagesSquare },
  { value: 'files', label: 'Файлы', icon: Paperclip },
];
const TASK_VIEWS = ['list', 'board', 'timeline', 'calendar'];

function MembersModal({ project, open, onClose }) {
  const { data: ws } = useWorkspace();
  const qc = useQueryClient();
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('editor');
  const memberIds = new Set(project.members.map((m) => m.id));
  const candidates = (ws?.members || []).filter((m) => !memberIds.has(m.id));
  const refresh = () => qc.invalidateQueries({ queryKey: ['project', project.id] });
  const run = async (fn) => { try { await fn(); refresh(); } catch (e) { toast(e.message, { type: 'error' }); } };

  return (
    <Modal open={open} onClose={onClose} title="Участники проекта" width={520}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-subtle p-3 text-sm">
          {project.privacy === 'workspace' ? <Globe className="h-5 w-5 text-primary shrink-0" /> : <Lock className="h-5 w-5 text-primary shrink-0" />}
          <div className="flex-1">
            <p className="font-medium">{project.privacy === 'workspace' ? 'Открытый проект' : 'Закрытый проект'}</p>
            <p className="text-muted">{project.privacy === 'workspace' ? 'Все участники пространства видят и редактируют задачи. Наблюдатели — только читают.' : 'Видят только участники из списка ниже и администраторы.'}</p>
          </div>
          {project.canManage && (
            <button className="btn-secondary h-8" onClick={() => run(() => api.patch(`/projects/${project.id}`, { privacy: project.privacy === 'workspace' ? 'private' : 'workspace' }))}>
              {project.privacy === 'workspace' ? 'Сделать закрытым' : 'Открыть всем'}
            </button>
          )}
        </div>
        {project.canManage && candidates.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <select className="input flex-1" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Кого добавить">
              <option value="">Выберите участника пространства</option>
              {candidates.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.email}</option>)}
            </select>
            <select className="input sm:w-40" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Роль">
              <option value="editor">Редактор</option>
              <option value="viewer">Наблюдатель</option>
              <option value="owner">Владелец</option>
            </select>
            <button className="btn-primary h-10" disabled={!userId} onClick={() => run(async () => { await api.post(`/projects/${project.id}/members`, { user_id: Number(userId), role }); setUserId(''); })}>Добавить</button>
          </div>
        )}
        <ul className="divide-y divide-line">
          {project.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar user={m} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.name}</p>
                <p className="text-xs text-muted truncate">{m.email}</p>
              </div>
              {project.canManage ? (
                <select className="h-8 rounded-md border border-line bg-surface px-2 text-sm" value={m.role} onChange={(e) => run(() => api.post(`/projects/${project.id}/members`, { user_id: m.id, role: e.target.value }))} aria-label={`Роль ${m.name}`}>
                  <option value="owner">Владелец</option>
                  <option value="editor">Редактор</option>
                  <option value="viewer">Наблюдатель</option>
                </select>
              ) : <span className="text-sm text-muted">{ROLE_LABEL[m.role]}</span>}
              {project.canManage && (
                <button className="icon-btn h-8 w-8" aria-label={`Убрать ${m.name}`} onClick={() => run(() => api.del(`/projects/${project.id}/members/${m.id}`))}><X className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function EditProjectModal({ project, open, onClose }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [color, setColor] = useState(project.color);
  const qc = useQueryClient();
  const toast = useToast();
  const save = async () => {
    try {
      await api.patch(`/projects/${project.id}`, { name, description, color });
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Настройки проекта" footer={<><button className="btn-ghost" onClick={onClose}>Отмена</button><button className="btn-primary" onClick={save} disabled={!name.trim()}>Сохранить</button></>}>
      <div className="space-y-4">
        <Field label="Название" htmlFor="pname"><input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Описание" htmlFor="pdesc"><textarea id="pdesc" className="input h-auto py-2" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Цвет">
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`Цвет ${c}`} className={`h-8 w-8 rounded-lg transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export default function ProjectPage() {
  const { pid: pidParam, wid, view: viewParam } = useParams();
  const pid = Number(pidParam);
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: project, isLoading, error } = useProject(pid);
  const { data: tasks = [], isLoading: tasksLoading } = useProjectTasks(pid);
  const { data: fields = [] } = useQuery({ queryKey: ['fields', pid], queryFn: () => api.get(`/projects/${pid}/fields`), enabled: !!pid });
  const [filters, setFilters] = useLocalState(`potok-filters-${pid}`, { completion: 'open', assignee: 'all', priority: 'all' });
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();

  const view = VIEWS.some((v) => v.value === viewParam) ? viewParam : project?.default_view || 'list';
  const filtered = useMemo(() => applyFilters(tasks, { ...filters, q, meId: me?.user.id }), [tasks, filters, q, me]);

  if (isLoading) return <PageLoader />;
  if (error) return <EmptyState icon={Lock} title="Проект недоступен" text={error.message} action={<button className="btn-primary" onClick={() => navigate(`/w/${wid}`)}>На главную</button>} />;

  const setView = (v) => navigate(`/w/${wid}/projects/${pid}/${v}${window.location.search}`, { replace: true });
  const activeFilters = (filters.completion !== 'open') + (filters.assignee !== 'all') + (filters.priority !== 'all');

  const archive = async () => {
    try {
      await api.patch(`/projects/${pid}`, { archived: !project.archived });
      qc.invalidateQueries({ queryKey: ['project', pid] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast(project.archived ? 'Проект возвращён из архива' : 'Проект в архиве');
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  const remove = async () => {
    if (window.prompt(`Чтобы удалить проект со всеми задачами, введите его название: ${project.name}`) !== project.name) return;
    try {
      await api.del(`/projects/${pid}`);
      qc.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/w/${wid}`);
      toast('Проект удалён');
    } catch (e) { toast(e.message, { type: 'error' }); }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line bg-surface px-3 sm:px-6 pt-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: project.color }}>
            <List className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg sm:text-xl font-semibold truncate">
              {project.name}
              {project.privacy === 'private' && <Lock className="h-4 w-4 text-muted shrink-0" aria-label="Закрытый проект" />}
              {project.archived && <span className="chip bg-subtle text-muted">В архиве</span>}
            </h1>
            {project.description && <p className="text-sm text-muted truncate">{project.description}</p>}
          </div>
          <button onClick={() => setModal('members')} className="hidden sm:flex items-center -space-x-1.5 hover:opacity-80" aria-label="Участники проекта">
            {project.members.slice(0, 4).map((m) => <Avatar key={m.id} user={m} size={28} className="ring-2 ring-surface" />)}
            {project.members.length > 4 && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-subtle text-xs ring-2 ring-surface">+{project.members.length - 4}</span>}
          </button>
          <button className="btn-secondary h-9 hidden sm:inline-flex" onClick={() => setModal('members')}><Users className="h-4 w-4" />Доступ</button>
          <button className="btn-secondary h-9 hidden sm:inline-flex" onClick={() => setModal('customize')}><Settings2 className="h-4 w-4" />Настроить</button>
          <Dropdown width={240} align="end" trigger={({ ref, toggle }) => <button ref={ref} onClick={toggle} className="icon-btn" aria-label="Действия с проектом"><MoreHorizontal className="h-5 w-5" /></button>}>
            {(close) => (
              <>
                <button className="menu-item sm:hidden" onClick={() => { close(); setModal('members'); }}><Users className="h-4 w-4" />Участники и доступ</button>
                <button className="menu-item sm:hidden" onClick={() => { close(); setModal('customize'); }}><Settings2 className="h-4 w-4" />Поля, правила, форма</button>
                {project.canEdit && <button className="menu-item" onClick={() => { close(); setModal('edit'); }}><Pencil className="h-4 w-4" />Изменить проект</button>}
                {project.canManage && <button className="menu-item" onClick={() => { close(); archive(); }}>{project.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{project.archived ? 'Вернуть из архива' : 'В архив'}</button>}
                {project.canManage && <button className="menu-item text-danger" onClick={() => { close(); remove(); }}><Trash2 className="h-4 w-4" />Удалить проект</button>}
              </>
            )}
          </Dropdown>
        </div>

        <nav className="mt-2 -mb-px flex gap-1 overflow-x-auto scrollbar-thin" aria-label="Виды проекта" role="tablist">
          {VIEWS.map((v) => (
            <button key={v.value} role="tab" aria-selected={view === v.value} onClick={() => setView(v.value)}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 h-10 text-sm font-medium transition-colors duration-150
                ${view === v.value ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              <v.icon className="h-4 w-4" />{v.label}
            </button>
          ))}
        </nav>
      </header>

      {TASK_VIEWS.includes(view) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 sm:px-6 py-2">
          {project.canEdit && view !== 'calendar' && view !== 'timeline' && (
            <button className="btn-primary h-9" onClick={async () => {
              const title = window.prompt('Название задачи');
              if (!title?.trim()) return;
              try { await api.post('/tasks', { project_id: pid, title: title.trim() }); qc.invalidateQueries({ queryKey: ['project-tasks', pid] }); } catch (e) { toast(e.message, { type: 'error' }); }
            }}>+ Добавить задачу</button>
          )}
          <div className="flex-1" />
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-9 w-[150px] sm:w-[200px] pl-8" placeholder="Найти в проекте" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск в проекте" />
          </div>
          <Dropdown width={260} align="end" trigger={({ ref, toggle }) => (
            <button ref={ref} onClick={toggle} className={`btn-secondary h-9 ${activeFilters ? 'border-primary text-primary' : ''}`}>
              <SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Фильтры</span>{activeFilters > 0 && <span className="chip bg-primary text-primary-ink">{activeFilters}</span>}
            </button>
          )}>
            <div className="space-y-3 p-2">
              <Field label="Статус">
                <select className="input h-9" value={filters.completion} onChange={(e) => setFilters({ ...filters, completion: e.target.value })}>
                  <option value="open">Невыполненные</option>
                  <option value="done">Выполненные</option>
                  <option value="all">Все задачи</option>
                </select>
              </Field>
              <Field label="Исполнитель">
                <select className="input h-9" value={String(filters.assignee)} onChange={(e) => setFilters({ ...filters, assignee: ['all', 'me', 'none'].includes(e.target.value) ? e.target.value : Number(e.target.value) })}>
                  <option value="all">Все</option>
                  <option value="me">Только мои</option>
                  <option value="none">Без исполнителя</option>
                  {project.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="Приоритет">
                <select className="input h-9" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
                  <option value="all">Любой</option>
                  <option value="high">Высокий</option>
                  <option value="medium">Средний</option>
                  <option value="low">Низкий</option>
                  <option value="none">Без приоритета</option>
                </select>
              </Field>
              {activeFilters > 0 && <button className="btn-ghost w-full" onClick={() => setFilters({ completion: 'open', assignee: 'all', priority: 'all' })}>Сбросить фильтры</button>}
            </div>
          </Dropdown>
        </div>
      )}

      <div className={`flex-1 min-h-0 ${view === 'board' || view === 'timeline' ? 'overflow-hidden' : 'overflow-y-auto scrollbar-thin'}`}>
        {tasksLoading ? <PageLoader /> : (
          <>
            {view === 'overview' && <OverviewView project={project} tasks={tasks} />}
            {view === 'list' && <ListView project={project} tasks={filtered} fields={fields} />}
            {view === 'dashboard' && <DashboardView project={project} />}
            {view === 'messages' && <MessagesView project={project} />}
            {view === 'files' && <FilesView project={project} />}
            {view === 'board' && <BoardView project={project} tasks={filtered} />}
            {view === 'calendar' && <CalendarView project={project} tasks={filtered} />}
            {view === 'timeline' && <TimelineView project={project} tasks={filtered} />}
          </>
        )}
      </div>

      <MembersModal project={project} open={modal === 'members'} onClose={() => setModal(null)} />
      {modal === 'edit' && <EditProjectModal project={project} open onClose={() => setModal(null)} />}
      <CustomizeDrawer project={project} open={modal === 'customize'} onClose={() => setModal(null)} />
    </div>
  );
}
