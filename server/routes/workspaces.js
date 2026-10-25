import { Router } from 'express';
import crypto from 'node:crypto';
import { one, many, query, tx } from '../db.js';
import { h, fail, str, oneOf, intOrNull } from '../util.js';
import { requireWorkspace, visibleTaskSql } from '../access.js';
import { emitWorkspace, emitUser, joinWorkspaceRoom, leaveWorkspaceRoom } from '../realtime.js';
import { TASK_LIST_SELECT } from './tasks.js';

const router = Router();

export async function acceptInvite(userId, token) {
  const inv = await one('SELECT * FROM invites WHERE token=$1 AND expires_at > now()', [token]);
  if (!inv) fail(404, 'Приглашение не найдено или устарело');
  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,$3)
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [inv.workspace_id, userId, inv.role],
  );
  await query('UPDATE invites SET uses = uses + 1 WHERE token=$1', [token]);
  await joinWorkspaceRoom(userId, inv.workspace_id);
  emitWorkspace(inv.workspace_id, 'members');
  return inv.workspace_id;
}

// --- Приглашения (публичный просмотр — до входа) ---
router.get('/invites/:token', h(async (req, res) => {
  const inv = await one(
    `SELECT i.workspace_id, w.name AS workspace_name, u.name AS inviter
       FROM invites i JOIN workspaces w ON w.id = i.workspace_id
       LEFT JOIN users u ON u.id = i.created_by
      WHERE i.token=$1 AND i.expires_at > now()`,
    [req.params.token],
  );
  if (!inv) fail(404, 'Приглашение не найдено или устарело');
  res.json(inv);
}));

export const publicInvites = router;

// --- Остальное требует входа ---
export const workspaces = Router();

workspaces.post('/invites/:token/accept', h(async (req, res) => {
  res.json({ workspaceId: await acceptInvite(req.user.id, req.params.token) });
}));

workspaces.post('/workspaces', h(async (req, res) => {
  const name = str(req.body.name, { required: true, max: 100, field: 'Название' });
  const ws = await tx(async (c) => {
    const { rows: [w] } = await c.query('INSERT INTO workspaces (name, created_by) VALUES ($1,$2) RETURNING *', [name, req.user.id]);
    await c.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'owner')", [w.id, req.user.id]);
    return w;
  });
  await joinWorkspaceRoom(req.user.id, ws.id);
  res.status(201).json({ ...ws, role: 'owner' });
}));

workspaces.get('/workspaces/:wid', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  const role = await requireWorkspace(req.user.id, wid);
  const ws = await one('SELECT id, name, created_at FROM workspaces WHERE id=$1', [wid]);
  const members = await many(
    `SELECT u.id, u.name, u.email, u.color, wm.role FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id=$1 ORDER BY u.name`,
    [wid],
  );
  const tags = await many('SELECT * FROM tags WHERE workspace_id=$1 ORDER BY name', [wid]);
  res.json({ ...ws, role, members, tags });
}));

workspaces.patch('/workspaces/:wid', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid, { admin: true });
  const name = str(req.body.name, { required: true, max: 100, field: 'Название' });
  const ws = await one('UPDATE workspaces SET name=$1 WHERE id=$2 RETURNING *', [name, wid]);
  emitWorkspace(wid, 'workspace');
  res.json(ws);
}));

workspaces.delete('/workspaces/:wid', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  const role = await requireWorkspace(req.user.id, wid);
  if (role !== 'owner') fail(403, 'Удалить пространство может только владелец');
  emitWorkspace(wid, 'workspace-deleted', { workspaceId: wid });
  await query('DELETE FROM workspaces WHERE id=$1', [wid]);
  res.json({ ok: true });
}));

workspaces.patch('/workspaces/:wid/members/:uid', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  const uid = intOrNull(req.params.uid);
  const myRole = await requireWorkspace(req.user.id, wid, { admin: true });
  const role = oneOf(req.body.role, ['owner', 'admin', 'member'], 'Роль');
  if (role === 'owner' && myRole !== 'owner') fail(403, 'Назначить владельца может только владелец');
  const target = await one('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [wid, uid]);
  if (!target) fail(404, 'Участник не найден');
  if (target.role === 'owner' && myRole !== 'owner') fail(403, 'Нельзя менять роль владельца');
  if (target.role === 'owner' && role !== 'owner') {
    const owners = await one("SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id=$1 AND role='owner'", [wid]);
    if (owners.n <= 1) fail(400, 'В пространстве должен остаться хотя бы один владелец');
  }
  await query('UPDATE workspace_members SET role=$1 WHERE workspace_id=$2 AND user_id=$3', [role, wid, uid]);
  emitWorkspace(wid, 'members');
  res.json({ ok: true });
}));

workspaces.delete('/workspaces/:wid/members/:uid', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  const uid = intOrNull(req.params.uid);
  const myRole = await requireWorkspace(req.user.id, wid);
  const self = uid === req.user.id;
  if (!self && myRole === 'member') fail(403, 'Нужны права администратора');
  const target = await one('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [wid, uid]);
  if (!target) fail(404, 'Участник не найден');
  if (target.role === 'owner') {
    const owners = await one("SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id=$1 AND role='owner'", [wid]);
    if (owners.n <= 1) fail(400, 'Нельзя удалить единственного владельца. Сначала назначьте другого.');
    if (!self && myRole !== 'owner') fail(403, 'Удалить владельца может только владелец');
  }
  await tx(async (c) => {
    await c.query('DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [wid, uid]);
    await c.query('DELETE FROM project_members pm USING projects p WHERE pm.project_id=p.id AND p.workspace_id=$1 AND pm.user_id=$2', [wid, uid]);
    await c.query('UPDATE tasks SET assignee_id=NULL WHERE workspace_id=$1 AND assignee_id=$2 AND completed=false', [wid, uid]);
  });
  await leaveWorkspaceRoom(uid, wid);
  emitUser(uid, 'workspace-deleted', { workspaceId: wid });
  emitWorkspace(wid, 'members');
  res.json({ ok: true });
}));

workspaces.get('/workspaces/:wid/invites', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid, { admin: true });
  res.json(await many(
    `SELECT i.token, i.role, i.uses, i.expires_at, i.created_at, u.name AS created_by_name
       FROM invites i LEFT JOIN users u ON u.id=i.created_by
      WHERE i.workspace_id=$1 AND i.expires_at > now() ORDER BY i.created_at DESC`,
    [wid],
  ));
}));

workspaces.post('/workspaces/:wid/invites', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid, { admin: true });
  const role = oneOf(req.body.role ?? 'member', ['admin', 'member'], 'Роль');
  const days = Math.min(Math.max(Number(req.body.days) || 7, 1), 30);
  const token = crypto.randomBytes(18).toString('base64url');
  const inv = await one(
    `INSERT INTO invites (token, workspace_id, role, created_by, expires_at)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' days')::interval) RETURNING *`,
    [token, wid, role, req.user.id, String(days)],
  );
  res.status(201).json(inv);
}));

workspaces.delete('/workspaces/:wid/invites/:token', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid, { admin: true });
  await query('DELETE FROM invites WHERE token=$1 AND workspace_id=$2', [req.params.token, wid]);
  res.json({ ok: true });
}));

// --- Метки ---
workspaces.post('/workspaces/:wid/tags', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const name = str(req.body.name, { required: true, max: 40, field: 'Метка' });
  const color = /^#[0-9A-Fa-f]{6}$/.test(req.body.color || '') ? req.body.color : '#64748B';
  const tag = await one(
    `INSERT INTO tags (workspace_id, name, color) VALUES ($1,$2,$3)
     ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
    [wid, name, color],
  );
  emitWorkspace(wid, 'tags');
  res.status(201).json(tag);
}));

workspaces.patch('/tags/:id', h(async (req, res) => {
  const tag = await one('SELECT * FROM tags WHERE id=$1', [intOrNull(req.params.id)]);
  if (!tag) fail(404, 'Метка не найдена');
  await requireWorkspace(req.user.id, tag.workspace_id);
  const name = str(req.body.name, { max: 40, field: 'Метка' });
  const color = /^#[0-9A-Fa-f]{6}$/.test(req.body.color || '') ? req.body.color : null;
  const updated = await one('UPDATE tags SET name=COALESCE($1,name), color=COALESCE($2,color) WHERE id=$3 RETURNING *', [name || null, color, tag.id]);
  emitWorkspace(tag.workspace_id, 'tags');
  res.json(updated);
}));

workspaces.delete('/tags/:id', h(async (req, res) => {
  const tag = await one('SELECT * FROM tags WHERE id=$1', [intOrNull(req.params.id)]);
  if (!tag) fail(404, 'Метка не найдена');
  await requireWorkspace(req.user.id, tag.workspace_id, { admin: true });
  await query('DELETE FROM tags WHERE id=$1', [tag.id]);
  emitWorkspace(tag.workspace_id, 'tags');
  res.json({ ok: true });
}));

// --- Мои задачи ---
workspaces.get('/workspaces/:wid/my-tasks', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const showCompleted = req.query.completed === '1';
  const rows = await many(
    `${TASK_LIST_SELECT}
      WHERE t.workspace_id=$1 AND t.assignee_id=$2 AND ${visibleTaskSql(2)}
        ${showCompleted ? "AND (t.completed=false OR t.completed_at > now() - interval '14 days')" : 'AND t.completed=false'}
      ORDER BY t.completed, t.due_date NULLS LAST, t.position`,
    [wid, req.user.id],
  );
  res.json(rows);
}));

// --- Поиск ---
workspaces.get('/workspaces/:wid/search', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const q = str(req.query.q ?? '', { max: 200 });
  if (!q) return res.json({ tasks: [], projects: [], people: [] });
  const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
  const tasks = await many(
    `${TASK_LIST_SELECT}
      WHERE t.workspace_id=$1 AND ${visibleTaskSql(2)} AND (t.title ILIKE $3 OR t.description ILIKE $3)
      ORDER BY t.completed, t.updated_at DESC LIMIT 30`,
    [wid, req.user.id, like],
  );
  const projects = await many(
    `SELECT p.id, p.name, p.color FROM projects p
       JOIN workspace_members wm ON wm.workspace_id=p.workspace_id AND wm.user_id=$2
      WHERE p.workspace_id=$1 AND p.name ILIKE $3 AND (p.privacy='workspace' OR wm.role IN ('owner','admin')
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2))
      LIMIT 10`,
    [wid, req.user.id, like],
  );
  const people = await many(
    `SELECT u.id, u.name, u.email, u.color FROM workspace_members wm JOIN users u ON u.id=wm.user_id
      WHERE wm.workspace_id=$1 AND (u.name ILIKE $2 OR u.email ILIKE $2) LIMIT 10`,
    [wid, like],
  );
  res.json({ tasks, projects, people });
}));

// --- Главная: сводка ---
workspaces.get('/workspaces/:wid/home', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const stats = await one(
    `SELECT
       count(*) FILTER (WHERE completed=false)::int AS open,
       count(*) FILTER (WHERE completed=false AND due_date < CURRENT_DATE)::int AS overdue,
       count(*) FILTER (WHERE completed=false AND due_date = CURRENT_DATE)::int AS today,
       count(*) FILTER (WHERE completed=true AND completed_at > now() - interval '7 days')::int AS done_week
     FROM tasks t WHERE t.workspace_id=$1 AND t.assignee_id=$2`,
    [wid, req.user.id],
  );
  const upcoming = await many(
    `${TASK_LIST_SELECT}
      WHERE t.workspace_id=$1 AND t.assignee_id=$2 AND t.completed=false AND ${visibleTaskSql(2)}
      ORDER BY t.due_date NULLS LAST, t.position LIMIT 8`,
    [wid, req.user.id],
  );
  res.json({ stats, upcoming });
}));

export default router;
