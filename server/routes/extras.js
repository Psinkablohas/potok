import { Router } from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { one, many, query } from '../db.js';
import { h, fail, str, oneOf, intOrNull } from '../util.js';
import { requireProject } from '../access.js';
import { emitWorkspace, emitUser } from '../realtime.js';
import { runRules, TRIGGERS, ACTIONS } from '../rules.js';

// Маршруты, которым нужен вход
const router = Router();
// Публичные маршруты (формы)
export const publicForms = Router();

const FIELD_TYPES = ['text', 'number', 'select', 'date', 'person'];
const STATUSES = ['on_track', 'at_risk', 'off_track', 'on_hold', 'complete'];

const touch = (project, kind = 'project-tasks') => emitWorkspace(project.workspace_id, kind, { projectId: project.id });

function cleanOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.slice(0, 50).map((o) => ({
    id: typeof o.id === 'string' && o.id ? o.id.slice(0, 20) : crypto.randomBytes(4).toString('hex'),
    name: str(String(o.name ?? ''), { required: true, max: 60, field: 'Вариант' }),
    color: /^#[0-9A-Fa-f]{6}$/.test(o.color || '') ? o.color : '#64748B',
  }));
}

// ---------- Пользовательские поля ----------
router.get('/projects/:pid/fields', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  await requireProject(req.user.id, pid);
  res.json(await many('SELECT * FROM custom_fields WHERE project_id=$1 ORDER BY position, id', [pid]));
}));

router.post('/projects/:pid/fields', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid, { edit: true });
  const name = str(req.body.name, { required: true, max: 60, field: 'Название поля' });
  const type = oneOf(req.body.type, FIELD_TYPES, 'Тип поля');
  const options = type === 'select' ? cleanOptions(req.body.options) : [];
  if (type === 'select' && !options.length) fail(400, 'Добавьте хотя бы один вариант');
  const m = await one('SELECT COALESCE(max(position),0) AS m FROM custom_fields WHERE project_id=$1', [pid]);
  const field = await one(
    'INSERT INTO custom_fields (project_id, name, type, options, position) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [pid, name, type, JSON.stringify(options), m.m + 1],
  );
  touch(project);
  res.status(201).json(field);
}));

router.patch('/fields/:id', h(async (req, res) => {
  const field = await one('SELECT * FROM custom_fields WHERE id=$1', [intOrNull(req.params.id)]);
  if (!field) fail(404, 'Поле не найдено');
  const { project } = await requireProject(req.user.id, field.project_id, { edit: true });
  const name = req.body.name !== undefined ? str(req.body.name, { required: true, max: 60, field: 'Название поля' }) : field.name;
  const options = field.type === 'select' && req.body.options !== undefined ? cleanOptions(req.body.options) : field.options;
  const updated = await one('UPDATE custom_fields SET name=$1, options=$2 WHERE id=$3 RETURNING *', [name, JSON.stringify(options), field.id]);
  touch(project);
  res.json(updated);
}));

router.delete('/fields/:id', h(async (req, res) => {
  const field = await one('SELECT * FROM custom_fields WHERE id=$1', [intOrNull(req.params.id)]);
  if (!field) fail(404, 'Поле не найдено');
  const { project } = await requireProject(req.user.id, field.project_id, { edit: true });
  await query('DELETE FROM custom_fields WHERE id=$1', [field.id]);
  touch(project);
  res.json({ ok: true });
}));

// ---------- Статус проекта ----------
router.get('/projects/:pid/status', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  await requireProject(req.user.id, pid);
  res.json(await many(
    `SELECT s.*, json_build_object('id', u.id, 'name', u.name, 'color', u.color) AS author
       FROM status_updates s LEFT JOIN users u ON u.id=s.user_id
      WHERE s.project_id=$1 ORDER BY s.created_at DESC LIMIT 50`,
    [pid],
  ));
}));

router.post('/projects/:pid/status', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid, { edit: true });
  const status = oneOf(req.body.status, STATUSES, 'Статус');
  const title = str(req.body.title, { required: true, max: 200, field: 'Заголовок' });
  const body = str(req.body.body ?? '', { max: 20000, field: 'Текст' });
  const row = await one('INSERT INTO status_updates (project_id, user_id, status, title, body) VALUES ($1,$2,$3,$4,$5) RETURNING *', [pid, req.user.id, status, title, body]);
  // Сообщаем участникам проекта
  const members = await many('SELECT user_id FROM project_members WHERE project_id=$1 AND user_id<>$2', [pid, req.user.id]);
  for (const m of members) {
    await query(
      "INSERT INTO notifications (user_id, workspace_id, actor_id, type, data) VALUES ($1,$2,$3,'status',$4)",
      [m.user_id, project.workspace_id, req.user.id, { title, status, projectId: pid, projectName: project.name }],
    );
  }
  emitWorkspace(project.workspace_id, 'projects', { projectId: pid });
  members.forEach((m) => emitUser(m.user_id, 'notification', { workspaceId: project.workspace_id }));
  res.status(201).json(row);
}));

router.delete('/status/:id', h(async (req, res) => {
  const row = await one('SELECT * FROM status_updates WHERE id=$1', [intOrNull(req.params.id)]);
  if (!row) fail(404, 'Отчёт не найден');
  const { project, canManage } = await requireProject(req.user.id, row.project_id);
  if (row.user_id !== req.user.id && !canManage) fail(403, 'Удалить можно только свой отчёт');
  await query('DELETE FROM status_updates WHERE id=$1', [row.id]);
  emitWorkspace(project.workspace_id, 'projects', { projectId: project.id });
  res.json({ ok: true });
}));

// ---------- Обсуждения проекта ----------
router.get('/projects/:pid/messages', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  await requireProject(req.user.id, pid);
  const rows = await many(
    `SELECT m.*, json_build_object('id', u.id, 'name', u.name, 'color', u.color) AS author
       FROM messages m LEFT JOIN users u ON u.id=m.user_id
      WHERE m.project_id=$1 ORDER BY m.created_at`,
    [pid],
  );
  const threads = rows.filter((m) => !m.parent_id).map((m) => ({ ...m, replies: rows.filter((r) => r.parent_id === m.id) }));
  threads.reverse();
  res.json(threads);
}));

router.post('/projects/:pid/messages', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid);
  const parentId = intOrNull(req.body.parent_id) ?? null;
  if (parentId && !(await one('SELECT 1 FROM messages WHERE id=$1 AND project_id=$2 AND parent_id IS NULL', [parentId, pid]))) fail(400, 'Обсуждение не найдено');
  const title = parentId ? '' : str(req.body.title, { required: true, max: 200, field: 'Тема' });
  const body = str(req.body.body, { required: true, max: 20000, field: 'Сообщение' });
  const row = await one('INSERT INTO messages (project_id, parent_id, user_id, title, body) VALUES ($1,$2,$3,$4,$5) RETURNING *', [pid, parentId, req.user.id, title, body]);
  emitWorkspace(project.workspace_id, 'messages', { projectId: pid });
  res.status(201).json(row);
}));

router.delete('/messages/:id', h(async (req, res) => {
  const row = await one('SELECT * FROM messages WHERE id=$1', [intOrNull(req.params.id)]);
  if (!row) fail(404, 'Сообщение не найдено');
  const { project, canManage } = await requireProject(req.user.id, row.project_id);
  if (row.user_id !== req.user.id && !canManage) fail(403, 'Удалить можно только своё сообщение');
  await query('DELETE FROM messages WHERE id=$1', [row.id]);
  emitWorkspace(project.workspace_id, 'messages', { projectId: project.id });
  res.json({ ok: true });
}));

// ---------- Файлы проекта ----------
router.get('/projects/:pid/files', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  await requireProject(req.user.id, pid);
  res.json(await many(
    `SELECT a.id, a.filename, a.mime, a.size, a.created_at, a.task_id, t.title AS task_title, u.name AS author
       FROM attachments a JOIN tasks t ON t.id=a.task_id LEFT JOIN users u ON u.id=a.user_id
      WHERE t.project_id=$1 ORDER BY a.created_at DESC`,
    [pid],
  ));
}));

// ---------- Панель (статистика) ----------
router.get('/projects/:pid/stats', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  await requireProject(req.user.id, pid);
  const totals = await one(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE completed)::int AS done,
            count(*) FILTER (WHERE NOT completed)::int AS open,
            count(*) FILTER (WHERE NOT completed AND due_date < CURRENT_DATE)::int AS overdue,
            count(*) FILTER (WHERE NOT completed AND assignee_id IS NULL)::int AS unassigned
       FROM tasks WHERE project_id=$1 AND parent_id IS NULL`,
    [pid],
  );
  const bySection = await many(
    `SELECT s.id, s.name,
            count(t.id) FILTER (WHERE NOT t.completed)::int AS open,
            count(t.id) FILTER (WHERE t.completed)::int AS done
       FROM sections s LEFT JOIN tasks t ON t.section_id=s.id AND t.parent_id IS NULL
      WHERE s.project_id=$1 GROUP BY s.id ORDER BY s.position, s.id`,
    [pid],
  );
  const byAssignee = await many(
    `SELECT u.id, u.name, u.color, count(*)::int AS open
       FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id
      WHERE t.project_id=$1 AND t.parent_id IS NULL AND NOT t.completed
      GROUP BY u.id ORDER BY open DESC LIMIT 12`,
    [pid],
  );
  const byPriority = await many(
    `SELECT priority, count(*)::int AS open FROM tasks
      WHERE project_id=$1 AND parent_id IS NULL AND NOT completed GROUP BY priority`,
    [pid],
  );
  const completion = await many(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            (SELECT count(*)::int FROM tasks t WHERE t.project_id=$1 AND t.parent_id IS NULL AND t.completed
               AND t.completed_at::date = d::date) AS done,
            (SELECT count(*)::int FROM tasks t WHERE t.project_id=$1 AND t.parent_id IS NULL
               AND t.created_at::date = d::date) AS created
       FROM generate_series(CURRENT_DATE - 27, CURRENT_DATE, interval '1 day') d`,
    [pid],
  );
  res.json({ totals, bySection, byAssignee, byPriority, completion });
}));

// ---------- Правила ----------
function cleanTrigger(t) {
  if (!t || typeof t !== 'object') fail(400, 'Не задано условие');
  const type = oneOf(t.type, TRIGGERS, 'Условие');
  return type === 'section_changed' ? { type, section_id: intOrNull(t.section_id) ?? null } : { type };
}

function cleanActions(list) {
  if (!Array.isArray(list) || !list.length) fail(400, 'Добавьте хотя бы одно действие');
  return list.slice(0, 10).map((a) => {
    const type = oneOf(a?.type, ACTIONS, 'Действие');
    switch (type) {
      case 'move_section': return { type, section_id: intOrNull(a.section_id, 'Раздел') };
      case 'assign':
      case 'add_follower': return { type, user_id: intOrNull(a.user_id, 'Пользователь') };
      case 'set_priority': return { type, priority: oneOf(a.priority, ['none', 'low', 'medium', 'high'], 'Приоритет') };
      case 'set_due_in': return { type, days: Math.max(0, Math.min(365, Number(a.days) || 0)) };
      case 'set_field': return { type, field_id: intOrNull(a.field_id, 'Поле'), value: a.value ?? null };
      default: return { type };
    }
  });
}

router.get('/projects/:pid/rules', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  await requireProject(req.user.id, pid);
  res.json(await many('SELECT * FROM rules WHERE project_id=$1 ORDER BY id', [pid]));
}));

router.post('/projects/:pid/rules', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid, { edit: true });
  const name = str(req.body.name, { required: true, max: 120, field: 'Название правила' });
  const rule = await one(
    'INSERT INTO rules (project_id, name, trigger, actions, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [pid, name, cleanTrigger(req.body.trigger), JSON.stringify(cleanActions(req.body.actions)), req.user.id],
  );
  touch(project, 'rules');
  res.status(201).json(rule);
}));

router.patch('/rules/:id', h(async (req, res) => {
  const rule = await one('SELECT * FROM rules WHERE id=$1', [intOrNull(req.params.id)]);
  if (!rule) fail(404, 'Правило не найдено');
  const { project } = await requireProject(req.user.id, rule.project_id, { edit: true });
  const name = req.body.name !== undefined ? str(req.body.name, { required: true, max: 120, field: 'Название' }) : rule.name;
  const trigger = req.body.trigger !== undefined ? cleanTrigger(req.body.trigger) : rule.trigger;
  const actions = req.body.actions !== undefined ? cleanActions(req.body.actions) : rule.actions;
  const enabled = req.body.enabled !== undefined ? !!req.body.enabled : rule.enabled;
  const updated = await one(
    'UPDATE rules SET name=$1, trigger=$2, actions=$3, enabled=$4 WHERE id=$5 RETURNING *',
    [name, trigger, JSON.stringify(actions), enabled, rule.id],
  );
  touch(project, 'rules');
  res.json(updated);
}));

router.delete('/rules/:id', h(async (req, res) => {
  const rule = await one('SELECT * FROM rules WHERE id=$1', [intOrNull(req.params.id)]);
  if (!rule) fail(404, 'Правило не найдено');
  const { project } = await requireProject(req.user.id, rule.project_id, { edit: true });
  await query('DELETE FROM rules WHERE id=$1', [rule.id]);
  touch(project, 'rules');
  res.json({ ok: true });
}));

// ---------- Формы ----------
router.get('/projects/:pid/form', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid);
  let form = await one('SELECT * FROM forms WHERE project_id=$1', [pid]);
  if (!form) {
    form = await one(
      'INSERT INTO forms (project_id, token, title) VALUES ($1,$2,$3) ON CONFLICT (project_id) DO UPDATE SET title=forms.title RETURNING *',
      [pid, crypto.randomBytes(12).toString('base64url'), `Заявка в проект «${project.name}»`],
    );
  }
  res.json(form);
}));

router.patch('/forms/:id', h(async (req, res) => {
  const form = await one('SELECT * FROM forms WHERE id=$1', [intOrNull(req.params.id)]);
  if (!form) fail(404, 'Форма не найдена');
  await requireProject(req.user.id, form.project_id, { edit: true });
  const title = req.body.title !== undefined ? str(req.body.title, { required: true, max: 200, field: 'Заголовок' }) : form.title;
  const description = req.body.description !== undefined ? str(req.body.description, { max: 5000, field: 'Описание' }) : form.description;
  const sectionId = req.body.section_id !== undefined ? intOrNull(req.body.section_id) : form.section_id;
  if (sectionId && !(await one('SELECT 1 FROM sections WHERE id=$1 AND project_id=$2', [sectionId, form.project_id]))) fail(400, 'Раздел не из этого проекта');
  const fieldIds = Array.isArray(req.body.field_ids) ? req.body.field_ids.map(Number).filter(Number.isInteger).slice(0, 20) : form.field_ids;
  const enabled = req.body.enabled !== undefined ? !!req.body.enabled : form.enabled;
  res.json(await one(
    'UPDATE forms SET title=$1, description=$2, section_id=$3, field_ids=$4, enabled=$5 WHERE id=$6 RETURNING *',
    [title, description, sectionId, JSON.stringify(fieldIds), enabled, form.id],
  ));
}));

async function loadPublicForm(token) {
  const form = await one(
    `SELECT f.*, p.name AS project_name, p.color AS project_color, p.workspace_id
       FROM forms f JOIN projects p ON p.id=f.project_id WHERE f.token=$1 AND f.enabled AND NOT p.archived`,
    [token],
  );
  if (!form) fail(404, 'Форма не найдена или отключена');
  const fields = form.field_ids.length
    ? await many("SELECT id, name, type, options FROM custom_fields WHERE project_id=$1 AND id = ANY($2) AND type <> 'person'", [form.project_id, form.field_ids])
    : [];
  return { form, fields };
}

publicForms.get('/forms/:token', h(async (req, res) => {
  const { form, fields } = await loadPublicForm(req.params.token);
  res.json({ title: form.title, description: form.description, project_name: form.project_name, project_color: form.project_color, fields });
}));

const formLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, message: { error: 'Слишком много заявок. Попробуйте позже.' } });

publicForms.post('/forms/:token', formLimiter, h(async (req, res) => {
  const { form, fields } = await loadPublicForm(req.params.token);
  const title = str(req.body.title, { required: true, max: 300, field: 'Тема' });
  const name = str(req.body.name ?? '', { max: 100, field: 'Имя' });
  const email = str(req.body.email ?? '', { max: 200, field: 'Почта' });
  const details = str(req.body.description ?? '', { max: 10000, field: 'Описание' });
  const description = [details, '', '—', `Отправлено через форму${name ? `: ${name}` : ''}${email ? ` <${email}>` : ''}`].join('\n').trim();

  let sectionId = form.section_id;
  if (!sectionId) sectionId = (await one('SELECT id FROM sections WHERE project_id=$1 ORDER BY position, id LIMIT 1', [form.project_id]))?.id ?? null;
  const pos = await one('SELECT COALESCE(max(position),0)+1 AS p FROM tasks WHERE project_id=$1 AND parent_id IS NULL', [form.project_id]);
  const task = await one(
    `INSERT INTO tasks (workspace_id, project_id, section_id, title, description, position)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [form.workspace_id, form.project_id, sectionId, title, description, pos.p],
  );
  const values = req.body.fields && typeof req.body.fields === 'object' ? req.body.fields : {};
  for (const f of fields) {
    const v = values[f.id];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'select' && !f.options.some((o) => o.id === v)) continue;
    if (f.type === 'number' && !Number.isFinite(Number(v))) continue;
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    const val = f.type === 'number' ? Number(v) : String(v).slice(0, 2000);
    await query('INSERT INTO task_field_values (task_id, field_id, value) VALUES ($1,$2,$3)', [task.id, f.id, JSON.stringify(val)]);
  }
  await query("INSERT INTO activity (task_id, user_id, type, data) VALUES ($1, NULL, 'form', $2)", [task.id, { name, email }]);
  await runRules(task, { type: 'task_added' }, null);
  emitWorkspace(form.workspace_id, 'task', { taskId: task.id, projectId: form.project_id });
  res.status(201).json({ ok: true });
}));

// ---------- Экспорт в CSV ----------
router.get('/projects/:pid/export.csv', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid);
  const fields = await many('SELECT * FROM custom_fields WHERE project_id=$1 ORDER BY position, id', [pid]);
  const rows = await many(
    `SELECT t.id, t.title, t.description, t.completed, t.completed_at, t.start_date, t.due_date, t.priority, t.created_at,
            s.name AS section, a.name AS assignee, p.title AS parent,
            COALESCE((SELECT string_agg(g.name, ', ') FROM task_tags tt JOIN tags g ON g.id=tt.tag_id WHERE tt.task_id=t.id), '') AS tags,
            COALESCE((SELECT json_object_agg(v.field_id, v.value) FROM task_field_values v WHERE v.task_id=t.id), '{}') AS fields
       FROM tasks t LEFT JOIN sections s ON s.id=t.section_id LEFT JOIN users a ON a.id=t.assignee_id
       LEFT JOIN tasks p ON p.id=t.parent_id
      WHERE t.project_id=$1 ORDER BY s.position NULLS LAST, t.parent_id NULLS FIRST, t.position`,
    [pid],
  );
  const users = new Map((await many('SELECT id, name FROM users u JOIN workspace_members wm ON wm.user_id=u.id WHERE wm.workspace_id=$1', [project.workspace_id])).map((u) => [u.id, u.name]));
  const PR = { none: '', low: 'Низкий', medium: 'Средний', high: 'Высокий' };
  const fieldText = (f, v) => {
    if (v === undefined || v === null) return '';
    if (f.type === 'select') return f.options.find((o) => o.id === v)?.name || '';
    if (f.type === 'person') return users.get(v) || '';
    return String(v);
  };
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Защита от формул в Excel
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ['ID', 'Задача', 'Раздел', 'Родительская задача', 'Исполнитель', 'Начало', 'Срок', 'Приоритет', 'Метки', 'Выполнена', 'Дата выполнения', 'Создана', 'Описание', ...fields.map((f) => f.name)];
  const lines = [header.map(esc).join(';')];
  for (const r of rows) {
    lines.push([
      r.id, r.title, r.section, r.parent, r.assignee, r.start_date, r.due_date, PR[r.priority], r.tags,
      r.completed ? 'Да' : 'Нет', r.completed_at ? new Date(r.completed_at).toISOString().slice(0, 10) : '',
      new Date(r.created_at).toISOString().slice(0, 10), r.description,
      ...fields.map((f) => fieldText(f, r.fields[f.id])),
    ].map(esc).join(';'));
  }
  const filename = `${project.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'project'}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  // BOM — чтобы Excel правильно показал кириллицу
  res.send('﻿' + lines.join('\r\n'));
}));

export default router;
