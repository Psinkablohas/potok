import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AlertTriangle, CalendarCheck, CircleDot, TrendingUp, Plus, FolderKanban } from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe, useProjects, useWorkspaceId, useTaskPanel } from '../lib/hooks.js';
import { PageLoader, ColorDot } from '../components/ui.jsx';
import { DueText } from '../components/TaskBits.jsx';
import { plural } from '../lib/format.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-sm text-muted"><Icon className={`h-4 w-4 ${tone}`} />{label}</div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function HomePage({ onNewProject }) {
  const wid = useWorkspaceId();
  const { data: me } = useMe();
  const { data: projects = [] } = useProjects();
  const { open } = useTaskPanel();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['home', wid], queryFn: () => api.get(`/workspaces/${wid}/home`) });

  if (isLoading || !data) return <PageLoader />;
  const { stats, upcoming } = data;
  const active = projects.filter((p) => !p.archived);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
        <p className="text-sm text-muted">{format(new Date(), 'EEEE, d MMMM', { locale: ru }).replace(/^./, (c) => c.toUpperCase())}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold">{greeting()}, {me?.user.name.split(' ')[0]}</h1>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={CircleDot} label="В работе" value={stats.open} tone="text-primary" />
          <Stat icon={CalendarCheck} label="На сегодня" value={stats.today} tone="text-success" />
          <Stat icon={AlertTriangle} label="Просрочено" value={stats.overdue} tone="text-danger" />
          <Stat icon={TrendingUp} label="Сделано за неделю" value={stats.done_week} tone="text-warn" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="card">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="font-semibold">Ближайшие задачи</h2>
              <Link to={`/w/${wid}/my-tasks`} className="text-sm text-primary hover:underline">Все мои задачи</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-4 pb-5 text-sm text-muted">Задач нет — отличное время, чтобы спланировать следующие шаги.</p>
            ) : (
              <ul className="pb-2">
                {upcoming.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => open(t.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-subtle/70 transition-colors">
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm">{t.title}</span>
                        {t.project && <span className="flex items-center gap-1.5 text-xs text-muted"><ColorDot color={t.project.color} className="h-2 w-2" />{t.project.name}</span>}
                      </span>
                      <DueText task={t} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="font-semibold">Проекты</h2>
              <button onClick={onNewProject} className="btn-ghost h-8 -mr-2"><Plus className="h-4 w-4" />Новый</button>
            </div>
            {active.length === 0 ? (
              <div className="px-4 pb-5">
                <p className="text-sm text-muted">Создайте первый проект, чтобы вести задачи вместе с командой.</p>
                <button onClick={onNewProject} className="btn-primary mt-3"><FolderKanban className="h-4 w-4" />Создать проект</button>
              </div>
            ) : (
              <ul className="pb-2">
                {active.slice(0, 8).map((p) => {
                  const pct = p.task_count ? Math.round((p.done_count / p.task_count) * 100) : 0;
                  return (
                    <li key={p.id}>
                      <button onClick={() => navigate(`/w/${wid}/projects/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-subtle/70 transition-colors">
                        <ColorDot color={p.color} className="h-3 w-3" />
                        <span className="flex-1 min-w-0 truncate text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted whitespace-nowrap">{p.task_count} {plural(p.task_count, 'задача', 'задачи', 'задач')}</span>
                        <span className="h-1.5 w-16 rounded-full bg-subtle overflow-hidden" aria-label={`Выполнено ${pct}%`}>
                          <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
