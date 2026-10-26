import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { CheckCircle2, RotateCcw, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe, useTaskPanel, useUpdateTask, useWorkspaceId } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { Avatar, ColorDot, EmptyState, PageLoader, Segmented } from '../components/ui.jsx';
import { fmtDateTime } from '../lib/format.js';
import { t } from '../i18n/index.js';

function groupOf(iso) {
  if (!iso) return 'earlier';
  const diff = differenceInCalendarDays(new Date(), new Date(iso));
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'week';
  if (diff < 30) return 'month';
  return 'earlier';
}

const GROUPS = [
  ['today', t('Сегодня')],
  ['yesterday', t('Вчера')],
  ['week', t('На этой неделе')],
  ['month', t('В этом месяце')],
  ['earlier', t('Раньше')],
];

/**
 * Список выполненных задач с кнопкой «Вернуть в работу».
 * Без projectId — по всему пространству, с projectId — только по проекту.
 */
export default function CompletedView({ projectId = null, showProject = !projectId }) {
  const wid = useWorkspaceId();
  const { data: me } = useMe();
  const { open } = useTaskPanel();
  const update = useUpdateTask();
  const qc = useQueryClient();
  const toast = useToast();
  const [scope, setScope] = useState('all');
  const [q, setQ] = useState('');

  const key = ['completed', wid, scope, projectId];
  const { data = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get(`/workspaces/${wid}/completed?scope=${scope}${projectId ? `&project=${projectId}` : ''}`),
  });

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const g = Object.fromEntries(GROUPS.map(([k]) => [k, []]));
    data.filter((x) => !query || x.title.toLowerCase().includes(query)).forEach((x) => g[groupOf(x.completed_at)].push(x));
    return g;
  }, [data, q]);
  const total = Object.values(groups).reduce((n, list) => n + list.length, 0);

  const reopen = (task) => {
    // Сразу убираем из списка, при ошибке список перезагрузится
    qc.setQueryData(key, (list) => (list || []).filter((x) => x.id !== task.id));
    update.mutate({ id: task.id, completed: false }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['completed'] });
        toast(t('Задача «{0}» снова в работе', task.title), {
          action: { label: t('Открыть'), onClick: () => open(task.id) },
        });
      },
      onError: () => qc.invalidateQueries({ queryKey: ['completed'] }),
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-3 sm:px-6 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: t('Все') }, { value: 'mine', label: t('Мои') }]} />
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-8 rounded-full pl-8" placeholder={t('Найти выполненную задачу')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Найти выполненную задачу')} />
        </div>
        <span className="ml-auto text-sm text-muted">{t('Выполнено: {0}', total)}</span>
      </div>

      <p className="mb-4 rounded-lg bg-primary-soft px-3 py-2 text-sm text-ink">
        {t('Случайно отметили задачу выполненной? Нажмите «Вернуть в работу» — она снова появится в списке у всех.')}
      </p>

      {isLoading ? <PageLoader /> : total === 0 ? (
        <EmptyState icon={CheckCircle2} title={t('Выполненных задач пока нет')} text={t('Когда вы или коллеги завершите задачу, она появится здесь.')} />
      ) : GROUPS.map(([k, label]) => groups[k].length > 0 && (
        <section key={k} className="mb-6">
          <h2 className="mb-1 px-1 text-sm font-semibold text-muted">{label} · {groups[k].length}</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {groups[k].map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-subtle/60 transition-colors">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                <button onClick={() => open(task.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm text-muted line-through decoration-muted/50">{task.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {showProject && task.project && <span className="inline-flex items-center gap-1"><ColorDot color={task.project.color} className="h-2 w-2" />{task.project.name}</span>}
                    {task.completed_at && <span>{fmtDateTime(task.completed_at)}</span>}
                    {task.completed_by && (
                      <span className="inline-flex items-center gap-1">
                        <Avatar user={task.completed_by} size={16} />
                        {task.completed_by.id === me?.user.id ? t('вы') : task.completed_by.name}
                      </span>
                    )}
                  </span>
                </button>
                {task.canEdit !== false && (
                  <button onClick={() => reopen(task)} className="btn-secondary h-8 rounded-full px-3 shrink-0">
                    <RotateCcw className="h-4 w-4" />{t('Вернуть в работу')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
