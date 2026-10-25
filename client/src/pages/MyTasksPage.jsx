import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { api } from '../lib/api.js';
import { useMe, useWorkspaceId } from '../lib/hooks.js';
import { PageLoader, EmptyState, Avatar } from '../components/ui.jsx';
import { QuickAdd } from '../components/TaskBits.jsx';
import { TaskRow } from '../views/ListView.jsx';
import { t } from '../i18n/index.js';

const BUCKETS = [
  ['overdue', t("Просрочено")],
  ['today', t("Сегодня")],
  ['week', t("Ближайшие 7 дней")],
  ['later', t("Позже")],
  ['nodate', t("Без срока")],
  ['done', t("Недавно выполненные")],
];

function bucketOf(t) {
  if (t.completed) return 'done';
  if (!t.due_date) return 'nodate';
  const diff = differenceInCalendarDays(parseISO(t.due_date), new Date());
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

export default function MyTasksPage() {
  const wid = useWorkspaceId();
  const { data: me } = useMe();
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['my-tasks', wid, showDone],
    queryFn: () => api.get(`/workspaces/${wid}/my-tasks${showDone ? '?completed=1' : ''}`),
  });

  const groups = useMemo(() => {
    const g = Object.fromEntries(BUCKETS.map(([k]) => [k, []]));
    tasks.forEach((t) => g[bucketOf(t)].push(t));
    return g;
  }, [tasks]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <header className="border-b border-line bg-surface px-4 sm:px-6 py-4 flex items-center gap-3">
        {me && <Avatar user={me.user} size={40} />}
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{t("Мои задачи")}</h1>
          <p className="text-sm text-muted">{t("Всё, что назначено вам, из всех проектов")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {t("Показать выполненные")}
        </label>
      </header>

      <div className="px-2 sm:px-6 py-4 max-w-5xl">
        <div className="mb-4 px-2">
          <QuickAdd autoOpen={false} payload={{ workspace_id: wid, assignee_id: me?.user.id }} label={t("Добавить личную задачу")} placeholder={t("Что нужно сделать?")} />
        </div>
        {isLoading ? <PageLoader /> : tasks.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t("Все задачи выполнены")} text={t("Новые задачи, назначенные вам, появятся здесь. Можно добавить личную задачу выше.")} />
        ) : BUCKETS.map(([key, label]) => groups[key].length > 0 && (
          <section key={key} className="mb-5">
            <button onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))} className="flex items-center gap-1.5 px-2 h-9 font-semibold" aria-expanded={!collapsed[key]}>
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsed[key] ? '-rotate-90' : ''}`} />
              <span className={key === 'overdue' ? 'text-danger' : ''}>{label}</span>
              <span className="text-sm font-normal text-muted">{groups[key].length}</span>
            </button>
            {!collapsed[key] && (
              <div className="border-t border-line">
                {groups[key].map((t) => <TaskRow key={t.id} task={t} canEdit showProject />)}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
