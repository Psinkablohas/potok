import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useMe, useProjects, useTaskPanel, useWorkspaceId } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { Modal } from './ui.jsx';
import { AssigneePicker, DueDatePicker, ProjectPicker } from './pickers.jsx';

// Быстрое создание задачи откуда угодно: кнопка «Создать» или клавиши Tab + Q
export default function QuickTaskModal({ open, onClose, defaultProjectId = null }) {
  const wid = useWorkspaceId();
  const { data: me } = useMe();
  const { data: projects = [] } = useProjects();
  const { open: openTask } = useTaskPanel();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', project_id: defaultProjectId, assignee_id: null, due_date: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm({ title: '', description: '', project_id: defaultProjectId, assignee_id: me?.user.id ?? null, due_date: null });
  }, [open, defaultProjectId, me?.user.id]);

  const submit = async (andOpen) => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    try {
      const task = await api.post('/tasks', { ...form, title: form.title.trim(), workspace_id: wid });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
      if (form.project_id) qc.invalidateQueries({ queryKey: ['project-tasks', form.project_id] });
      onClose();
      if (andOpen) openTask(task.id);
      else toast('Задача создана', { action: { label: 'Открыть', onClick: () => openTask(task.id) } });
    } catch (e) { toast(e.message, { type: 'error' }); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Новая задача" width={560}
      footer={<>
        <button className="btn-ghost" onClick={() => submit(true)} disabled={!form.title.trim() || busy}>Создать и открыть</button>
        <button className="btn-primary" onClick={() => submit(false)} disabled={!form.title.trim() || busy}>Создать</button>
      </>}>
      <div className="space-y-3">
        <input autoFocus className="input h-11 text-base font-medium" placeholder="Что нужно сделать?" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(false); }} aria-label="Название задачи" />
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-sm text-muted mr-1">Для</span>
          <AssigneePicker value={form.assignee_id} onChange={(v) => setForm({ ...form, assignee_id: v })} />
          <span className="text-sm text-muted mx-1">в</span>
          <ProjectPicker projects={projects} value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} />
          <DueDatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
        </div>
        <textarea rows={4} className="input h-auto py-2" placeholder="Описание (необязательно)" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} aria-label="Описание" />
        <p className="text-xs text-muted">Ctrl + Enter — создать. Открыть это окно с любой страницы: Tab, затем Q.</p>
      </div>
    </Modal>
  );
}
