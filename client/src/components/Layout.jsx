import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home, CheckSquare, Settings, Plus, Menu, Search, ChevronsUpDown, Check, LogOut, Moon, Sun, Lock, X, Archive, UserPlus,
  Bell, CircleCheck, ChevronDown, FolderPlus, CheckCheck,
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
import { t, tn } from '../i18n/index.js';

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
    <Modal open={open} onClose={onClose} title={t("Новый проект")} footer={<><button className="btn-ghost" onClick={onClose}>{t("Отмена")}</button><button className="btn-primary" disabled={!form.name.trim() || busy} onClick={submit}>{t("Создать проект")}</button></>}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label={t("Название")} htmlFor="np-name"><input id="np-name" autoFocus className="input" placeholder={t("Например, Запуск сайта")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={t("Шаблон разделов")}>
          <select className="input" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
            <option value="kanban">{t("Канбан: К выполнению → В работе → На проверке → Готово")}</option>
            <option value="sprint">{t("Разработка: Бэклог → Спринт → В работе → Тестирование → Готово")}</option>
            <option value="marketing">{t("Контент: Идеи → Подготовка → Публикация → Аналитика")}</option>
            <option value="empty">{t("Пустой проект")}</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Вид по умолчанию")}>
            <select className="input" value={form.default_view} onChange={(e) => setForm({ ...form, default_view: e.target.value })}>
              <option value="list">{t("Список")}</option>
              <option value="board">{t("Доска")}</option>
              <option value="calendar">{t("Календарь")}</option>
              <option value="timeline">{t("График")}</option>
            </select>
          </Field>
          <Field label={t("Доступ")}>
            <select className="input" value={form.privacy} onChange={(e) => setForm({ ...form, privacy: e.target.value })}>
              <option value="workspace">{t("Всё пространство")}</option>
              <option value="private">{t("Только приглашённые")}</option>
            </select>
          </Field>
        </div>
        <Field label={t("Цвет")}>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => <button type="button" key={c} aria-label={t("Цвет {0}", c)} onClick={() => setForm({ ...form, color: c })} className={`h-8 w-8 rounded-lg ${form.color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink' : ''}`} style={{ background: c }} />)}
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
    <Modal open={open} onClose={onClose} title={t("Новое пространство")} footer={<><button className="btn-ghost" onClick={onClose}>{t("Отмена")}</button><button className="btn-primary" disabled={!name.trim()} onClick={submit}>{t("Создать")}</button></>}>
      <p className="mb-4 text-sm text-muted">{t("Пространство — это отдельная компания или команда со своими людьми и проектами.")}</p>
      <Field label={t("Название")} htmlFor="nw"><input id="nw" autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()} /></Field>
    </Modal>
  );
}

function Sidebar({ onNavigate, onNewProject, onNewTask }) {
  const wid = useWorkspaceId();
  const { data: me } = useMe();
  const { data: ws } = useWorkspace();
  const { data: projects = [] } = useProjects();
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [newWs, setNewWs] = useState(false);
  const navigate = useNavigate();
  const { data: unread } = useQuery({ queryKey: ['unread', wid], queryFn: () => api.get(`/workspaces/${wid}/notifications/unread`), refetchInterval: 120_000 });

  const nav = ({ isActive }) => `flex items-center gap-3 rounded-md px-3 h-8 text-sm transition-colors duration-150
    ${isActive ? 'bg-primary-soft text-ink font-medium' : 'text-ink/85 hover:bg-subtle hover:text-ink'}`;
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div className="sidebar flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 h-14 shrink-0">
        <Logo className="text-[15px] [&_svg]:h-7 [&_svg]:w-7" />
      </div>

      <div className="px-3 pb-3">
        <Dropdown width={220} trigger={({ ref, toggle }) => (
          <button ref={ref} onClick={toggle} className="inline-flex items-center gap-2 rounded-full border border-line bg-subtle/60 pl-2.5 pr-4 h-9 text-sm font-medium hover:bg-subtle transition-colors">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(79_70_229)] text-white"><Plus className="h-3.5 w-3.5" /></span>
            {t("Создать")}
          </button>
        )}>
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { close(); onNewTask(); }}><CheckSquare className="h-4 w-4" />{t("Задачу")}<span className="ml-auto text-xs text-muted">Tab Q</span></button>
              <button className="menu-item" onClick={() => { close(); onNewProject(); }}><FolderPlus className="h-4 w-4" />{t("Проект")}</button>
              <button className="menu-item" onClick={() => { close(); navigate(`/w/${wid}/settings`); onNavigate?.(); }}><UserPlus className="h-4 w-4" />{t("Пригласить коллег")}</button>
            </>
          )}
        </Dropdown>
      </div>

      <nav className="px-2 space-y-px" aria-label={t("Основное меню")}>
        <NavLink end to={`/w/${wid}`} className={nav} onClick={onNavigate}><Home className="h-[18px] w-[18px]" />{t("Главная")}</NavLink>
        <NavLink to={`/w/${wid}/my-tasks`} className={nav} onClick={onNavigate}><CircleCheck className="h-[18px] w-[18px]" />{t("Мои задачи")}</NavLink>
        <NavLink to={`/w/${wid}/completed`} className={nav} onClick={onNavigate}><CheckCheck className="h-[18px] w-[18px]" />{t("Выполненные")}</NavLink>
        <NavLink to={`/w/${wid}/inbox`} className={nav} onClick={onNavigate}>
          <Bell className="h-[18px] w-[18px]" /><span className="flex-1">{t("Входящие")}</span>
          {unread?.count > 0 && <span className="rounded-full bg-[#E5484D] px-1.5 min-w-[20px] text-center text-[11px] font-semibold leading-5 text-white">{unread.count > 99 ? '99+' : unread.count}</span>}
        </NavLink>
      </nav>

      <div className="mx-4 my-3 border-t border-line" />

      <div className="flex items-center justify-between px-3 pb-1">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1 rounded-md px-2 h-7 text-sm font-medium text-ink/85 hover:bg-subtle" aria-expanded={!collapsed}>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />{t("Проекты")}
        </button>
        <button onClick={onNewProject} className="icon-btn h-7 w-7" aria-label={t("Новый проект")}><Plus className="h-4 w-4" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3 space-y-px" aria-label={t("Проекты")}>
        {!collapsed && active.map((p) => (
          <NavLink key={p.id} to={`/w/${wid}/projects/${p.id}`} className={nav} onClick={onNavigate}>
            <span className="h-3 w-3 rounded-[4px] shrink-0" style={{ background: p.color }} />
            <span className="flex-1 truncate">{p.name}</span>
            {p.privacy === 'private' && <Lock className="h-3.5 w-3.5 text-muted" />}
          </NavLink>
        ))}
        {!collapsed && active.length === 0 && (
          <button onClick={onNewProject} className="w-full rounded-md border border-dashed border-line px-3 py-3 text-sm text-muted hover:text-ink">{t("Создать первый проект")}</button>
        )}
        {!collapsed && archived.length > 0 && (
          <>
            <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-2 px-3 pt-3 text-xs text-muted hover:text-ink">
              <Archive className="h-3.5 w-3.5" />{showArchived ? t("Скрыть архив") : t("Архив ({0})", archived.length)}
            </button>
            {showArchived && archived.map((p) => (
              <NavLink key={p.id} to={`/w/${wid}/projects/${p.id}`} className={nav} onClick={onNavigate}>
                <span className="h-3 w-3 rounded-[4px] shrink-0 opacity-50" style={{ background: p.color }} /><span className="flex-1 truncate text-muted">{p.name}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-line p-2 space-y-px">
        <NavLink to={`/w/${wid}/settings`} className={nav} onClick={onNavigate}><UserPlus className="h-[18px] w-[18px]" />{t("Пригласить и настроить")}</NavLink>
        <Dropdown width={272} trigger={({ ref, toggle }) => (
          <button ref={ref} onClick={toggle} className="flex w-full items-center gap-2.5 rounded-md px-2 h-11 hover:bg-subtle transition-colors text-left">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[rgb(79_70_229)] text-xs font-bold text-white shrink-0">{ws?.name?.[0]?.toUpperCase() || '·'}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-medium">{ws?.name || t("Загрузка…")}</span>
              <span className="block text-xs text-muted">{tn(ws?.members?.length || 0, 'участник')}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-muted" />
          </button>
        )}>
          {(close) => (
            <>
              <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted">{t("Пространства")}</p>
              {me?.workspaces.map((w) => (
                <button key={w.id} className="menu-item" onClick={() => { close(); navigate(`/w/${w.id}`); onNavigate?.(); }}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-subtle text-xs font-bold">{w.name[0]?.toUpperCase()}</span>
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === wid && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              <div className="my-1 border-t border-line" />
              <button className="menu-item" onClick={() => { close(); setNewWs(true); }}><Plus className="h-4 w-4" />{t("Новое пространство")}</button>
            </>
          )}
        </Dropdown>
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
  const [quickProject, setQuickProject] = useState(null);

  // Кнопка «Добавить задачу» в проекте открывает то же окно, что и «Создать»
  useEffect(() => {
    const onNew = (e) => { setQuickProject(e.detail?.projectId ?? null); setQuickTask(true); };
    window.addEventListener('potok:new-task', onNew);
    return () => window.removeEventListener('potok:new-task', onNew);
  }, []);
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

  const sidebar = <Sidebar onNavigate={() => setDrawer(false)} onNewProject={() => { setDrawer(false); setNewProject(true); }} onNewTask={() => { setDrawer(false); setQuickTask(true); }} />;

  return (
    <div className="flex h-full">
      <aside className="hidden lg:block w-[248px] shrink-0">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-modal lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50 animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="sidebar absolute inset-y-0 left-0 w-[min(300px,85vw)] shadow-pop animate-slide-in">
            <button className="icon-btn absolute right-2 top-2.5 z-10" onClick={() => setDrawer(false)} aria-label={t("Закрыть меню")}><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="grid h-12 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-line bg-surface px-2 sm:px-4">
          <div className="flex items-center">
            <button className="icon-btn lg:hidden" onClick={() => setDrawer(true)} aria-label={t("Открыть меню")}><Menu className="h-5 w-5" /></button>
            <Logo className="hidden sm:inline-flex lg:hidden ml-1 text-[15px] [&_svg]:h-7 [&_svg]:w-7" />
          </div>
          <form className="relative w-full max-w-[560px] justify-self-center" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/w/${wid}/search?q=${encodeURIComponent(q.trim())}`); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input id="global-search" className="input h-8 rounded-full pl-9 bg-subtle border-line focus:bg-surface" placeholder={t("Поиск  ( / )")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Поиск")} />
          </form>
          <div className="flex items-center gap-1">
          <Dropdown width={220} align="end" trigger={({ ref, toggle }) => (
            <button ref={ref} onClick={toggle} className="icon-btn lg:hidden" aria-label={t("Создать")}><Plus className="h-5 w-5" /></button>
          )}>
            {(close) => (
              <>
                <button className="menu-item" onClick={() => { close(); setQuickTask(true); }}><CheckSquare className="h-4 w-4" />{t("Задачу")}<span className="ml-auto text-xs text-muted">Tab Q</span></button>
                <button className="menu-item" onClick={() => { close(); setNewProject(true); }}><Plus className="h-4 w-4" />{t("Проект")}</button>
                <button className="menu-item" onClick={() => { close(); navigate(`/w/${wid}/settings`); }}><UserPlus className="h-4 w-4" />{t("Пригласить коллег")}</button>
              </>
            )}
          </Dropdown>
          <button className="icon-btn" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={isDark ? t("Светлая тема") : t("Тёмная тема")}>
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          <Dropdown width={240} align="end" trigger={({ ref, toggle }) => (
            <button ref={ref} onClick={toggle} className="rounded-full p-0.5 hover:ring-2 hover:ring-line transition" aria-label={t("Мой профиль")}>
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
                <button className="menu-item" onClick={() => { close(); navigate(`/w/${wid}/settings`); }}><Settings className="h-4 w-4" />{t("Настройки")}</button>
                <button className="menu-item" onClick={() => { close(); logout(); }}><LogOut className="h-4 w-4" />{t("Выйти")}</button>
              </>
            )}
          </Dropdown>
          </div>
        </header>
        <main className="relative min-h-0 flex-1">
          <Outlet context={{ openNewProject: () => setNewProject(true) }} />
        </main>
      </div>

      <TaskPanel />
      <NewProjectModal open={newProject} onClose={() => setNewProject(false)} />
      <QuickTaskModal
        open={quickTask}
        onClose={() => { setQuickTask(false); setQuickProject(null); }}
        defaultProjectId={quickProject ?? (location.pathname.match(/projects\/(\d+)/) ? Number(location.pathname.match(/projects\/(\d+)/)[1]) : null)}
      />
    </div>
  );
}
