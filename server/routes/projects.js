import { Router } from 'express';
import { one, many, query, tx } from '../db.js';
import { h, fail, str, oneOf, intOrNull, PROJECT_COLORS } from '../util.js';
import { requireWorkspace, requireProject, workspaceRole } from '../access.js';
import { emitWorkspace } from '../realtime.js';
import { TASK_LIST_SELECT } from './tasks.js';

const router = Router();

import { SECTION_TEMPLATES, normLocale } from '../i18n.js';

router.get('/workspaces/:wid/projects', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const rows = await many(
    `SELECT p.id, p.name, p.color, p.privacy, p.archived, p.default_view, p.created_at,
            pm.role AS my_role,
            (SELECT count(*)::int FROM tasks t WHERE t.project_id=p.id AND t.parent_id IS NULL) AS task_count,
            (SELECT count(*)::int FROM tasks t WHERE t.project_id=p.id AND t.parent_id IS NULL AND t.completed) AS done_count
       FROM projects p
       JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$2
       LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2
      WHERE p.workspace_id=$1 AND (p.privacy='workspace' OR wm.role IN ('owner','admin') OR pm.user_id IS NOT NULL)
      ORDER BY p.archived, p.created_at`,
    [wid, req.user.id],
  );
  res.json(rows);
}));

router.post('/workspaces/:wid/projects', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const name = str(req.body.name, { required: true, max: 120, field: 'Название' });
  const description = str(req.body.description ?? '', { max: 5000, field: 'Описание' });
  const privacy = oneOf(req.body.privacy ?? 'workspace', ['workspace', 'private'], 'Доступ');
  const view = oneOf(req.body.default_view ?? 'list', ['list', 'board', 'calendar', 'timeline'], 'Вид');
  const color = PROJECT_COLORS.includes(req.body.color) ? req.body.color : PROJECT_COLORS[0];
  const tpl = SECTION_TEMPLATES[req.body.template] || SECTION_TEMPLATES.kanban;
  const sections = tpl[normLocale(req.user.locale)];

  const project = await tx(async (c) => {
    const { rows: [p] } = await c.query(
      `INSERT INTO projects (workspace_id, name, description, color, privacy, default_view, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [wid, name, description, color, privacy, view, req.user.id],
    );
    await c.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'owner')", [p.id, req.user.id]);
    for (let i = 0; i < sections.length; i++) {
      await c.query('INSERT INTO sections (project_id, name, position) VALUES ($1,$2,$3)', [p.id, sections[i], i + 1]);
    }
    return p;
  });
  emitWorkspace(wid, 'projects');
  res.status(201).json(project);
}));

router.get('/projects/:pid', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project, role, canEdit, canManage } = await requireProject(req.user.id, pid);
  const sections = await many('SELECT * FROM sections WHERE project_id=$1 ORDER BY position, id', [pid]);
  const members = await many(
    `SELECT u.id, u.name, u.email, u.color, pm.role FROM project_members pm
       JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 ORDER BY pm.role='owner' DESC, u.name`,
    [pid],
  );
  const last = await one('SELECT status FROM status_updates WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1', [pid]);
  res.json({ ...project, role, canEdit, canManage, sections, members, last_status: last?.status ?? null });
}));

router.patch('/projects/:pid', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid, { edit: true });
  const fields = {};
  if (req.body.name !== undefined) fields.name = str(req.body.name, { required: true, max: 120, field: 'Название' });
  if (req.body.description !== undefined) fields.description = str(req.body.description, { max: 5000, field: 'Описание' });
  if (req.body.color !== undefined) {
    if (!PROJECT_COLORS.includes(req.body.color)) fail(400, 'Недопустимый цвет');
    fields.color = req.body.color;
  }
  if (req.body.default_view !== undefined) fields.default_view = oneOf(req.body.default_view, ['list', 'board', 'calendar', 'timeline'], 'Вид');
  if (req.body.privacy !== undefined || req.body.archived !== undefined) {
    await requireProject(req.user.id, pid, { manage: true });
    if (req.body.privacy !== undefined) fields.privacy = oneOf(req.body.privacy, ['workspace', 'private'], 'Доступ');
    if (req.body.archived !== undefined) fields.archived = !!req.body.archived;
  }
  const keys = Object.keys(fields);
  if (!keys.length) return res.json(project);
  const updated = await one(
    `UPDATE projects SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(', ')} WHERE id=$${keys.length + 1} RETURNING *`,
    [...keys.map((k) => fields[k]), pid],
  );
  emitWorkspace(project.workspace_id, 'projects', { projectId: pid });
  res.json(updated);
}));

router.delete('/projects/:pid', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid, { manage: true });
  await query('DELETE FROM projects WHERE id=$1', [pid]);
  emitWorkspace(project.workspace_id, 'projects', { projectId: pid, deleted: true });
  res.json({ ok: true });
}));

// --- Участники проекта ---
router.post('/projects/:pid/members', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid, { manage: true });
  const uid = intOrNull(req.body.user_id, 'Пользователь');
  const role = oneOf(req.body.role ?? 'editor', ['owner', 'editor', 'viewer'], 'Роль');
  if (!(await workspaceRole(uid, project.workspace_id))) fail(400, 'Этот человек не состоит в пространстве');
  await query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role=EXCLUDED.role`,
    [pid, uid, role],
  );
  emitWorkspace(project.workspace_id, 'projects', { projectId: pid });
  res.json({ ok: true });
}));

router.delete('/projects/:pid/members/:uid', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const uid = intOrNull(req.params.uid);
  const self = uid === req.user.id;
  const { project } = await requireProject(req.user.id, pid, { manage: !self });
  const owners = await one("SELECT count(*)::int AS n FROM project_members WHERE project_id=$1 AND role='owner' AND user_id<>$2", [pid, uid]);
  const target = await one('SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2', [pid, uid]);
  if (target?.role === 'owner' && owners.n === 0) fail(400, 'У проекта должен остаться владелец');
  await query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [pid, uid]);
  emitWorkspace(project.workspace_id, 'projects', { projectId: pid });
  res.json({ ok: true });
}));

// --- Разделы ---
router.post('/projects/:pid/sections', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  const { project } = await requireProject(req.user.id, pid, { edit: true });
  const name = str(req.body.name, { required: true, max: 100, field: 'Раздел' });
  const max = await one('SELECT COALESCE(max(position),0) AS m FROM sections WHERE project_id=$1', [pid]);
  const section = await one('INSERT INTO sections (project_id, name, position) VALUES ($1,$2,$3) RETURNING *', [pid, name, max.m + 1]);
  emitWorkspace(project.workspace_id, 'project-tasks', { projectId: pid });
  res.status(201).json(section);
}));

router.patch('/sections/:id', h(async (req, res) => {
  const section = await one('SELECT * FROM sections WHERE id=$1', [intOrNull(req.params.id)]);
  if (!section) fail(404, 'Раздел не найден');
  const { project } = await requireProject(req.user.id, section.project_id, { edit: true });
  const name = str(req.body.name, { max: 100, field: 'Раздел' });
  const position = typeof req.body.position === 'number' && Number.isFinite(req.body.position) ? req.body.position : null;
  const updated = await one(
    'UPDATE sections SET name=COALESCE($1,name), position=COALESCE($2,position) WHERE id=$3 RETURNING *',
    [name || null, position, section.id],
  );
  emitWorkspace(project.workspace_id, 'project-tasks', { projectId: project.id });
  res.json(updated);
}));

router.delete('/sections/:id', h(async (req, res) => {
  const section = await one('SELECT * FROM sections WHERE id=$1', [intOrNull(req.params.id)]);
  if (!section) fail(404, 'Раздел не найден');
  const { project } = await requireProject(req.user.id, section.project_id, { edit: true });
  const count = await one('SELECT count(*)::int AS n FROM sections WHERE project_id=$1', [project.id]);
  if (count.n <= 1) fail(400, 'Нельзя удалить последний раздел');
  // Задачи не теряем: переносим в первый оставшийся раздел
  await tx(async (c) => {
    const { rows: [target] } = await c.query(
      'SELECT id FROM sections WHERE project_id=$1 AND id<>$2 ORDER BY position, id LIMIT 1',
      [project.id, section.id],
    );
    await c.query('UPDATE tasks SET section_id=$1 WHERE section_id=$2', [target.id, section.id]);
    await c.query('DELETE FROM sections WHERE id=$1', [section.id]);
  });
  emitWorkspace(project.workspace_id, 'project-tasks', { projectId: project.id });
  res.json({ ok: true });
}));

// --- Задачи проекта ---
router.get('/projects/:pid/tasks', h(async (req, res) => {
  const pid = intOrNull(req.params.pid);
  await requireProject(req.user.id, pid);
  const rows = await many(
    `${TASK_LIST_SELECT} WHERE t.project_id=$1 AND t.parent_id IS NULL ORDER BY t.position, t.id`,
    [pid],
  );
  res.json(rows);
}));

export default router;
