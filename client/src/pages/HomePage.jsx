import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus, FolderKanban, CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useMe, useProjects, useWorkspaceId, useTaskPanel } from '../lib/hooks.js';
import { PageLoader, ColorDot, Avatar } from '../components/ui.jsx';
import { DueText } from '../components/TaskBits.jsx';
import { plural, dueState } from '../lib/format.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export default function HomePage({ onNewProject }) {
  const wid = useWorkspaceId();
  const { data: me } = useMe();
  const { data: projects = [] } = useProjects();
  const { open } = useTaskPanel();
  const navigate = useNavigate();
  const [tab, setTab] = useState('upcoming');
  const { data, isLoading } = useQuery({ queryKey: ['home', wid], queryFn: () => api.get(`/workspaces/${wid}/home`) });

  if (isLoading || !data) return <PageLoader />;
  const { stats, upcoming } = data;
  const active = projects.filter((p) => !p.archived);

  const shown = upcoming.filter((t) => (tab === 'overdue' ? dueState(t.due_date, false) === 'overdue' : true));

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-bg">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-8 py-8 sm:py-10">
        <div className="text-center">
          <p className="text-sm font-medium text-muted">{format(new Date(), 'EEEE, d MMMM', { locale: ru }).replace(/^./, (c) => c.toUpperCase())}</p>
          <h1 className="mt-1 text-2xl sm:text-[32px] font-normal tracking-tight">{greeting()}, {me?.user.name.split(' ')[0]}</h1>
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-full bg-subtle px-5 py-2 text-sm text-muted">
            <span><b className="text-ink tabular-nums">{stats.done_week}</b> выполнено за неделю</span>
            <span><b className="text-ink tabular-nums">{stats.open}</b> в работе</span>
            <span className={stats.overdue ? 'text-danger' : ''}><b className={`tabular-nums ${stats.overdue ? '' : 'text-ink'}`}>{stats.overdue}</b> просрочено</span>
          </div>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <section className="card shadow-sm min-h-[360px] flex flex-col">
            <div className="flex items-center gap-3 px-5 pt-5">
              {me && <Avatar user={me.user} size={36} />}
              <h2 className="text-lg font-semibold flex-1">Мои задачи</h2>
              <Link to={`/w/${wid}/my-tasks`} className="text-sm text-muted hover:text-ink">Все</Link>
            </div>
            <div className="mt-3 flex gap-4 border-b border-line px-5 text-sm" role="tablist">
              {[['upcoming', 'Предстоящие'], ['overdue', `Просроченные${stats.overdue ? ` (${stats.overdue})` : ''}`]].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${tab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">{tab === 'overdue' ? 'Просроченных задач нет.' : 'Задач нет — отличное время, чтобы спланировать следующие шаги.'}</p>
            ) : (
              <ul className="flex-1 px-2 py-1">
                {shown.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => open(t.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-subtle/70 transition-colors">
                      <CircleCheck className="h-[18px] w-[18px] text-muted shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm">{t.title}</span>
                      {t.project && <span className="hidden sm:inline-flex max-w-[120px] items-center gap-1.5 rounded-full bg-subtle px-2 py-0.5 text-xs text-muted truncate"><ColorDot color={t.project.color} className="h-2 w-2" />{t.project.name}</span>}
                      <DueText task={t} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card shadow-sm min-h-[360px]">
            <div className="flex items-center px-5 pt-5 pb-3">
              <h2 className="text-lg font-semibold flex-1">Проекты</h2>
              <span className="text-sm text-muted">Недавние</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 px-3 pb-4">
              <button onClick={onNewProject} className="flex items-center gap-3 rounded-lg p-2 text-left hover:bg-subtle/70 transition-colors">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-line text-muted"><Plus className="h-5 w-5" /></span>
                <span className="text-sm font-medium text-muted">Создать проект</span>
              </button>
              {active.slice(0, 7).map((p) => {
                const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
                return (
                  <button key={p.id} onClick={() => navigate(`/w/${wid}/projects/${p.id}`)} className="flex items-center gap-3 rounded-lg p-2 text-left hover:bg-subtle/70 transition-colors">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: p.color }}><FolderKanban className="h-5 w-5 text-white" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-muted">{p.task_count} {plural(p.task_count, 'задача', 'задачи', 'задач')} · {pct}% готово</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
