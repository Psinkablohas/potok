import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Paperclip } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTaskPanel } from '../lib/hooks.js';
import { EmptyState, PageLoader } from '../components/ui.jsx';
import { fileSize, fmtDateTime } from '../lib/format.js';
import { t } from '../i18n/index.js';

export default function FilesView({ project }) {
  const { open } = useTaskPanel();
  const { data = [], isLoading } = useQuery({ queryKey: ['files', project.id], queryFn: () => api.get(`/projects/${project.id}/files`) });
  if (isLoading) return <PageLoader />;
  if (!data.length) return <EmptyState icon={Paperclip} title={t("Файлов пока нет")} text={t("Все файлы, прикреплённые к задачам проекта, будут собраны здесь.")} />;
  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {data.map((f) => (
        <div key={f.id} className="card overflow-hidden flex flex-col">
          <a href={`/api/attachments/${f.id}`} target="_blank" rel="noreferrer" className="block aspect-[16/10] bg-subtle">
            {f.mime.startsWith('image/') ? (
              <img src={`/api/attachments/${f.id}`} alt={f.filename} loading="lazy" className="h-full w-full object-cover" />
            ) : <span className="flex h-full items-center justify-center"><FileText className="h-10 w-10 text-muted" /></span>}
          </a>
          <div className="p-3 flex-1 flex flex-col gap-1">
            <p className="text-sm font-medium truncate" title={f.filename}>{f.filename}</p>
            <p className="text-xs text-muted">{fileSize(f.size)} · {f.author} · {fmtDateTime(f.created_at)}</p>
            <div className="mt-auto flex items-center gap-2 pt-2">
              <button onClick={() => open(f.task_id)} className="flex-1 truncate text-left text-xs text-primary hover:underline">{f.task_title}</button>
              <a href={`/api/attachments/${f.id}`} download className="icon-btn h-8 w-8" aria-label={t("Скачать")}><Download className="h-4 w-4" /></a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
