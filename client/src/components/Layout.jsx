import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home, CheckSquare, Inbox, Settings, Plus, Menu, Search, ChevronsUpDown, Check, LogOut, Moon, Sun, Lock, X, Archive, UserPlus,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe, useProjects, useWorkspace, useWorkspaceId } from '../lib/hooks.js';
import { useTheme, isDarkTheme } from '../lib/theme.js';
import { useToast } from '../lib/toast.jsx';
import { Avatar, ColorDot, Dropdown, Modal, Field } from './ui.jsx';
import { Logo } from '../pages/AuthPage.jsx';
import { PROJECT_COLORS } from '../lib/format.js';
import TaskPanel from './TaskPanel.jsx';
import QuickTaskModal from './QuickTaskModal.jsx';

export function NewProjectModal({ open, onClose }) {
  const wid = useWorkspaceId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', color: PROJECT_COLORS[0], privacy: 'workspace', template: 'kanban', default_view: 'list' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const p = await api.post(`/workspaces/${wid}/projects`, form);
      qc.invalidateQueries({ queryKey: ['projects', wid] });
      onClose();
      setForm({ ...form, name: '' });
      navigate(`/w/${wid}/projects/${p.id}/${form.default_view}`);
    } catch (err) { toast(err.message, { type: 'error' }); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Новый проект" footer={<><button className="btn-ghost" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={!form.name.trim() || busy} onClick={submit}>Создать проект</button></>}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Название" htmlFor="np-name"><input id="np-name" autoFocus className="input" placeholder="Например, Запуск сайта" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Шаблон разделов">
          <select className="input" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
            <option value="kanban">Канбан: К выполнению → В работе → На проверке → Готово</option>
            <option value="sprint">Разработка: Бэклог → Спринт → В работе → Тестирование → Готово</option>
            <option value="marketing">Контент: Идеи → Подготовка → Публикация → Аналитика</option>
            <option value="empty">Пустой проект</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Вид по умолчанию">
            <select className="input" value={form.default_view} onChange={(e) => setForm({ ...form, default_view: e.target.value })}>
              <option value="list">Список</option>
              <option value="board">Доска</option>
              <option value="calendar">Календарь</option>
              <option value="timeline">График</option>
            </select>
          </Field>
          <Field label="Доступ">
            <select className="input" value={form.privacy} onChange={(e) => setForm({ ...form, privacy: e.target.value })}>
              <option value="workspace">Всё пространство</option>
              <option value="private">Только приглашённые</option>
            </select>
          </Field>
        </div>
        <Field label="Цвет">
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => <button type="button" key={c} aria-label={`Цвет ${c}`} onClick={() => setForm({ ...form, color: c })} className={`h-8 w-8 rounded-lg ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink' : ''}`} style={{ background: c }} />)}
          </div>
        </Field>
      </form>
    </Modal>
  );
}

function NewWorkspaceModal({ open, onClose }) {
  const [name, setName] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const submit = async () => {
    try {
      const ws = await api.post('/workspaces', { name });
      await qc.invalidateQueries({ queryKey: ['me'] });
      onClose();
      setName('');
      navigate(`/w/${ws.id}`);
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Новое пространство" footer={<><button className="btn-ghost" onClick={onClose}>Отмена</button><button className="btn-primary" disabled={!name.trim()} onClick={submit}>Создать</button></>}>
      <p className="mb-4 text-sm text-muted">Пространство — это отдельная компания или команда со своими людьми и проектами.</p>
      <Field label="Название" htmlFor="nw"><input id="nw" autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()} /></Field>
    </Modal>
  );
}

function Sidebar({ onNavigate, onNewProject }) {
  const wid = useWorkspaceId();
  const { data: me } = useMe();
  const { data: ws } = useWorkspace();
  const { data: projects = [] } = useProjects();
  const [showArchived, setShowArchived] = useState(false);
  const [newWs, setNewWs] = useState(false);
  const navigate = useNavigate();
  const { data: unread } = useQuery({ queryKey: ['unread', wid], queryFn: () => api.get(`/workspaces/${wid}/notifications/unread`), refetchInterval: 120_000 });

  const nav = ({ isActive }) => `flex items-center gap-3 rounded-lg px-3 h-10 text-sm font-medium transition-colors duration-150
    ${isActive ? 'bg-primary-soft text-primary' : 'text-ink/80 hover:bg-subtle hover:text-ink'}`;
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2">
        <Dropdown width={272} trigger={({ ref, toggle }) => (
          <button ref={ref} onClick={toggle} className="flex w-full items-center gap-2.5 rounded-lg px-2 h-12 hover:bg-subtle transition-colors text-left">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-ink shrink-0">{ws?.name?.[0]?.toUpperCase() || '·'}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-semibold">{ws?.name || 'Загрузка…'}</span>
              <span className="block text-xs text-muted">{ws?.members?.length || 0} участн.</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-muted" />
          </button>
        )}>
          {(close) => (
            <>
              <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted">Пространства</p>
              {me?.workspaces.map((w) => (
                <button key={w.id} className="menu-item" onClick={() => { close(); navigate(`/w/${w.id}`); onNavigate?.(); }}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-subtle text-xs font-bold">{w.name[0]?.toUpperCase()}</span>
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === wid && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              <div className="my-1 border-t border-line" />
              <button className="menu-item" onClick={() => { close(); setNewWs(true); }}><Plus className="h-4 w-4" />Новое пространство</button>
            </>
          )}
        </Dropdown>
      </div>

      <nav className="px-3 space-y-0.5" aria-label="Основное меню">
        <NavLink end to={`/w/${wid}`} className={nav} onClick={onNavigate}><Home className="h-[18px] w-[18px]" />Главная</NavLink>
        <NavLink to={`/w/${wid}/my-tasks`} className={nav} onClick={onNavigate}><CheckSquare className="h-[18px] w-[18px]" />Мои задачи</NavLink>
        <NavLink to={`/w/${wid}/inbox`} className={nav} onClick={onNavigate}>
          <Inbox className="h-[18px] w-[18px]" /><span className="flex-1">Входящие</span>
          {unread?.count > 0 && <span className="rounded-full bg-danger px-1.5 min-w-[20px] text-center text-xs font-semibold text-white">{unread.count > 99 ? '99+' : unread.count}</span>}
        </NavLink>
      </nav>

      <div className="mt-5 flex items-center justify-between px-6 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Проекты</span>
        <button onClick={onNewProject} className="icon-btn h-7 w-7 -mr-2" aria-label="Новый проект"><Plus className="h-4 w-4" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3 space-y-0.5" aria-label="Проекты">
        {active.map((p) => (
          <NavLink key={p.id} to={`/w/${wid}/projects/${p.id}`} className={nav} onClick={onNavigate}>
            <ColorDot color={p.color} className="h-3 w-3" />
            <span className="flex-1 truncate">{p.name}</span>
            {p.privacy === 'private' && <Lock className="h-3.5 w-3.5 text-muted" />}
          </NavLink>
        ))}
        {active.length === 0 && (
          <button onClick={onNewProject} className="w-full rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted hover:border-primary hover:text-primary">Создать первый проект</button>
        )}
        {archived.length > 0 && (
          <>
            <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-2 px-3 pt-3 text-xs text-muted hover:text-ink">
              <Archive className="h-3.5 w-3.5" />{showArchived ? 'Скрыть архив' : `Архив (${archived.length})`}
            </button>
            {showArchived && archived.map((p) => (
              <NavLink key={p.id} to={`/w/${wid}/projects/${p.id}`} className={nav} onClick={onNavigate}>
                <ColorDot color={p.color} className="h-3 w-3 opacity-50" /><span className="flex-1 truncate text-muted">{p.name}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-line p-3">
        <NavLink to={`/w/${wid}/settings`} className={nav} onClick={onNavigate}><Settings className="h-[18px] w-[18px]" />Настройки и участники</NavLink>
      </div>
      <NewWorkspaceModal open={newWs} onClose={() => setNewWs(false)} />
    </div>
  );
}

export default function Layout() {
  const { data: me } = useMe();
  const wid = useWorkspaceId();
  const [drawer, setDrawer] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [quickTask, setQuickTask] = useState(false);
  const [q, setQ] = useState('');
  const [theme, setTheme] = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const isDark = isDarkTheme(theme);

  useEffect(() => setDrawer(false), [location.pathname]);

  // Горячие клавиши: «/» — поиск, Tab затем Q — новая задача
  useEffect(() => {
    let tabAt = 0;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === '/') { e.preventDefault(); document.getElementById('global-search')?.focus(); }
      if (e.key === 'Tab') tabAt = Date.now();
      if ((e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') && Date.now() - tabAt < 1000) {
        e.preventDefault();
        setQuickTask(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const logout = async () => {
    await api.post('/auth/logout');
    qc.clear();
    navigate('/login');
  };

  const sidebar = <Sidebar onNavigate={() => setDrawer(false)} onNewProject={() => { setDrawer(false); setNewProject(true); }} />;

  return (
    <div className="flex h-full">
      <aside className="hidden lg:block w-[264px] shrink-0 border-r border-line bg-surface">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-modal lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50 animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[min(300px,85vw)] bg-surface shadow-pop animate-slide-in">
            <button className="icon-btn absolute right-2 top-4 z-10" onClick={() => setDrawer(false)} aria-label="Закрыть меню"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-4">
          <button className="icon-btn lg:hidden" onClick={() => setDrawer(true)} aria-label="Открыть меню"><Menu className="h-5 w-5" /></button>
          <Logo className="hidden sm:inline-flex lg:hidden mr-2" />
          <form className="relative flex-1 max-w-xl" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/w/${wid}/search?q=${encodeURIComponent(q.trim())}`); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="global-search" className="input h-9 pl-9 bg-subtle border-transparent focus:bg-surface" placeholder="Поиск задач, проектов, людей  ( / )" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
          </form>
          <div className="flex-1" />
          <Dropdown width={220} align="end" trigger={({ ref, toggle }) => (
            <button ref={ref} onClick={toggle} className="btn-primary h-9 px-3"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Создать</span></button>
          )}>
            {(close) => (
              <>
                <button className="menu-item" onClick={() => { close(); setQuickTask(true); }}><CheckSquare className="h-4 w-4" />Задачу<span className="ml-auto text-xs text-muted">Tab Q</span></button>
                <button className="menu-item" onClick={() => { close(); setNewProject(true); }}><Plus className="h-4 w-4" />Проект</button>
                <button className="menu-item" onClick={() => { close(); navigate(`/w/${wid}/settings`); }}><UserPlus className="h-4 w-4" />Пригласить коллег</button>
              </>
            )}
          </Dropdown>
          <button className="icon-btn" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={isDark ? 'Светлая тема' : 'Тёмная тема'}>
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          <Dropdown width={240} align="end" trigger={({ ref, toggle }) => (
            <button ref={ref} onClick={toggle} className="rounded-full p-0.5 hover:ring-2 hover:ring-line transition" aria-label="Мой профиль">
              {me && <Avatar user={me.user} size={32} />}
            </button>
          )}>
            {(close) => (
              <>
                <div className="px-2.5 py-2">
                  <p className="text-sm font-semibold truncate">{me?.user.name}</p>
                  <p className="text-xs text-muted truncate">{me?.user.email}</p>
                </div>
                <div className="my-1 border-t border-line" />
                <button className="menu-item" onClick={() => { close(); navigate(`/w/${wid}/settings`); }}><Settings className="h-4 w-4" />Настройки</button>
                <button className="menu-item" onClick={() => { close(); logout(); }}><LogOut className="h-4 w-4" />Выйти</button>
              </>
            )}
          </Dropdown>
        </header>
        <main className="relative min-h-0 flex-1">
          <Outlet context={{ openNewProject: () => setNewProject(true) }} />
        </main>
      </div>

      <TaskPanel />
      <NewProjectModal open={newProject} onClose={() => setNewProject(false)} />
      <QuickTaskModal open={quickTask} onClose={() => setQuickTask(false)} defaultProjectId={location.pathname.match(/projects\/(\d+)/)?.[1] ? Number(location.pathname.match(/projects\/(\d+)/)[1]) : null} />
    </div>
  );
}
