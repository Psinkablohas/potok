import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCheck, Inbox, AtSign, MessageSquare, CheckCircle2, UserPlus, Heart, Activity } from 'lucide-react';
import { api } from '../lib/api.js';
import { useWorkspaceId, useTaskPanel } from '../lib/hooks.js';
import { useNavigate } from 'react-router-dom';
import { Avatar, PageLoader, EmptyState, Segmented } from '../components/ui.jsx';
import { timeAgo } from '../lib/format.js';

const TYPES = {
  assigned: { icon: UserPlus, text: 'назначил(а) вам задачу' },
  mentioned: { icon: AtSign, text: 'упомянул(а) вас' },
  commented: { icon: MessageSquare, text: 'оставил(а) комментарий' },
  completed: { icon: CheckCircle2, text: 'завершил(а) задачу' },
  liked: { icon: Heart, text: 'отметил(а) задачу как понравившуюся' },
  status: { icon: Activity, text: 'опубликовал(а) отчёт о статусе проекта' },
};

export default function InboxPage() {
  const wid = useWorkspaceId();
  const [tab, setTab] = useState('new');
  const { open } = useTaskPanel();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const archived = tab === 'archive';
  const { data = [], isLoading } = useQuery({
    queryKey: ['notifications', wid, archived],
    queryFn: () => api.get(`/workspaces/${wid}/notifications${archived ? '?archived=1' : ''}`),
  });

  const mark = async (body) => {
    await api.post(`/workspaces/${wid}/notifications/mark`, body);
    qc.invalidateQueries({ queryKey: ['notifications', wid] });
    qc.invalidateQueries({ queryKey: ['unread', wid] });
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <header className="border-b border-line bg-surface px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">Входящие</h1>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'new', label: 'Активные' }, { value: 'archive', label: 'Архив' }]} />
        {!archived && data.length > 0 && (
          <>
            <button className="btn-secondary h-9" onClick={() => mark({ read: true })}><CheckCheck className="h-4 w-4" /><span className="hidden sm:inline">Прочитать все</span></button>
            <button className="btn-secondary h-9" onClick={() => mark({ archived: true })}><Archive className="h-4 w-4" /><span className="hidden sm:inline">Архивировать все</span></button>
          </>
        )}
      </header>
      <div className="mx-auto max-w-3xl px-2 sm:px-6 py-4">
        {isLoading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState icon={Inbox} title={archived ? 'Архив пуст' : 'Новых уведомлений нет'} text="Здесь появятся назначения, упоминания и комментарии к задачам, на которые вы подписаны." />
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {data.map((n) => {
              const T = TYPES[n.type] || TYPES.commented;
              return (
                <li key={n.id} className={`group flex gap-3 px-4 py-3 transition-colors hover:bg-subtle/60 ${n.read ? '' : 'bg-primary-soft/60'}`}>
                  <div className="relative">
                    <Avatar user={n.actor} size={36} />
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-surface p-0.5"><T.icon className="h-3.5 w-3.5 text-primary" /></span>
                  </div>
                  <button className="flex-1 min-w-0 text-left" onClick={() => { if (!n.read) mark({ ids: [n.id], read: true }); if (n.task_id) open(n.task_id); else if (n.data.projectId) navigate(`/w/${wid}/projects/${n.data.projectId}/overview`); }}>
                    <p className="text-sm">
                      <span className="font-semibold">{n.actor?.name || 'Кто-то'}</span> <span className="text-muted">{T.text}</span>
                    </p>
                    <p className={`text-sm font-medium truncate ${n.task_completed ? 'line-through text-muted' : ''}`}>{n.task_title || n.data.title}{n.type === 'status' && n.data.projectName ? <span className="font-normal text-muted"> · {n.data.projectName}</span> : null}</p>
                    {n.data.excerpt && <p className="mt-0.5 text-sm text-muted line-clamp-2">{n.data.excerpt.replace(/@\[([^\]]+)\]\(\d+\)/g, '@$1')}</p>}
                    <p className="mt-1 text-xs text-muted">{timeAgo(n.created_at)}</p>
                  </button>
                  {!n.read && <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Не прочитано" />}
                  {!archived && (
                    <button className="icon-btn h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" aria-label="В архив" onClick={() => mark({ ids: [n.id], archived: true })}>
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
