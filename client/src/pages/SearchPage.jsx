import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useWorkspaceId } from '../lib/hooks.js';
import { Avatar, ColorDot, PageLoader, EmptyState } from '../components/ui.jsx';
import { TaskRow } from '../views/ListView.jsx';

export default function SearchPage() {
  const wid = useWorkspaceId();
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const { data, isLoading } = useQuery({
    queryKey: ['search', wid, q],
    queryFn: () => api.get(`/workspaces/${wid}/search?q=${encodeURIComponent(q)}`),
    enabled: !!q.trim(),
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <header className="border-b border-line bg-surface px-4 sm:px-6 py-4">
        <h1 className="text-xl font-semibold">Поиск{q && <span className="text-muted font-normal">: «{q}»</span>}</h1>
      </header>
      <div className="mx-auto max-w-5xl px-2 sm:px-6 py-4 space-y-6">
        {!q.trim() ? <EmptyState icon={Search} title="Что ищем?" text="Введите запрос в строке поиска сверху: название задачи, проекта или имя коллеги." /> :
          isLoading ? <PageLoader /> : (
            <>
              {data.projects.length > 0 && (
                <section>
                  <h2 className="px-2 mb-2 text-sm font-semibold text-muted">Проекты</h2>
                  <div className="flex flex-wrap gap-2 px-2">
                    {data.projects.map((p) => (
                      <Link key={p.id} to={`/w/${wid}/projects/${p.id}`} className="card flex items-center gap-2 px-3 py-2 text-sm hover:border-primary/40">
                        <ColorDot color={p.color} />{p.name}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {data.people.length > 0 && (
                <section>
                  <h2 className="px-2 mb-2 text-sm font-semibold text-muted">Люди</h2>
                  <div className="flex flex-wrap gap-2 px-2">
                    {data.people.map((u) => (
                      <span key={u.id} className="card flex items-center gap-2 px-3 py-2 text-sm"><Avatar user={u} size={24} />{u.name}<span className="text-muted">{u.email}</span></span>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h2 className="px-2 mb-2 text-sm font-semibold text-muted">Задачи · {data.tasks.length}</h2>
                {data.tasks.length ? (
                  <div className="border-t border-line">{data.tasks.map((t) => <TaskRow key={t.id} task={t} canEdit showProject />)}</div>
                ) : <p className="px-2 text-sm text-muted">Задач не найдено. Попробуйте другое слово.</p>}
              </section>
            </>
          )}
      </div>
    </div>
  );
}
