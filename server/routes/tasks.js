import { Router } from 'express';
import multer from 'multer';
import { one, many, query, tx } from '../db.js';
import { h, fail, str, oneOf, dateOrNull, intOrNull } from '../util.js';
import { requireTask, requireProject, requireWorkspace, workspaceRole, taskAccess } from '../access.js';
import { emitWorkspace, emitUser } from '../realtime.js';

const router = Router();

const PRIORITIES = ['none', 'low', 'medium', 'high'];
const RECURRENCES = [null, 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'];

// Общий SELECT для списков задач: исполнитель, метки, счётчики, проект и блокировки
export const TASK_LIST_SELECT = `
  SELECT t.*,
    CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('id', a.id, 'name', a.name, 'color', a.color) END AS assignee,
    CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id', p.id, 'name', p.name, 'color', p.color) END AS project,
    COALESCE((SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'color', g.color) ORDER BY g.name)
                FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.task_id = t.id), '[]') AS tags,
    (SELECT count(*)::int FROM tasks s WHERE s.parent_id = t.id) AS subtask_count,
    (SELECT count(*)::int FROM tasks s WHERE s.parent_id = t.id AND s.completed) AS subtask_done,
    (SELECT count(*)::int FROM comments c WHERE c.task_id = t.id) AS comment_count,
    (SELECT count(*)::int FROM attachments at WHERE at.task_id = t.id) AS attachment_count,
    EXISTS (SELECT 1 FROM task_dependencies d JOIN tasks b ON b.id = d.depends_on_id
             WHERE d.task_id = t.id AND b.completed = false) AS blocked
  FROM tasks t
  LEFT JOIN users a ON a.id = t.assignee_id
  LEFT JOIN projects p ON p.id = t.project_id`;

async function logActivity(client, taskId, userId, type, data = {}) {
  await (client || { query }).query('INSERT INTO activity (task_id, user_id, type, data) VALUES ($1,$2,$3,$4)', [taskId, userId, type, data]);
}

async function follow(taskId, userId) {
  if (!userId) return;
  await query('INSERT INTO task_followers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [taskId, userId]);
}

async function notify(userIds, { workspaceId, actorId, taskId, type, data = {} }) {
  const unique = [...new Set(userIds.filter((id) => id && id !== actorId))];
  for (const uid of unique) {
    // Уведомляем только тех, кто по-прежнему состоит в пространстве и видит задачу
    if (!(await workspaceRole(uid, workspaceId))) continue;
    if (taskId && !(await taskAccess(uid, taskId))) continue;
    await query(
      'INSERT INTO notifications (user_id, workspace_id, actor_id, task_id, type, data) VALUES ($1,$2,$3,$4,$5,$6)',
      [uid, workspaceId, actorId, taskId, type, data],
    );
    emitUser(uid, 'notification', { workspaceId });
  }
}

async function followers(taskId) {
  return (await many('SELECT user_id FROM task_followers WHERE task_id=$1', [taskId])).map((r) => r.user_id);
}

function broadcast(task, extra = {}) {
  emitWorkspace(task.workspace_id, 'task', {
    taskId: task.id,
    projectId: task.project_id,
    parentId: task.parent_id,
    ...extra,
  });
}

function nextDate(dateStr, rule) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  switch (rule) {
    case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'weekdays':
      do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay()));
      break;
    case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'biweekly': d.setUTCDate(d.getUTCDate() + 14); break;
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    default: return null;
  }
  return d.toISOString().slice(0, 10);
}

const today = () => new Date().toISOString().slice(0, 10);

async function loadListTask(id) {
  return one(`${TASK_LIST_SELECT} WHERE t.id=$1`, [id]);
}

// --- Создание ---
router.post('/tasks', h(async (req, res) => {
  const b = req.body;
  const title = str(b.title, { required: true, max: 500, field: 'Название' });
  let workspaceId = intOrNull(b.workspace_id, 'Пространство');
  let projectId = intOrNull(b.project_id, 'Проект') ?? null;
  let sectionId = intOrNull(b.section_id, 'Раздел') ?? null;
  const parentId = intOrNull(b.parent_id, 'Родительская задача') ?? null;

  if (parentId) {
    const { task: parent } = await requireTask(req.user.id, parentId, { edit: true });
    workspaceId = parent.workspace_id;
    projectId = parent.project_id;
    sectionId = null;
  } else if (projectId) {
    const { project } = await requireProject(req.user.id, projectId, { edit: true });
    workspaceId = project.workspace_id;
    if (sectionId) {
      const s = await one('SELECT id FROM sections WHERE id=$1 AND project_id=$2', [sectionId, projectId]);
      if (!s) fail(400, 'Раздел не относится к проекту');
    } else {
      const s = await one('SELECT id FROM sections WHERE project_id=$1 ORDER BY position, id LIMIT 1', [projectId]);
      sectionId = s?.id ?? null;
    }
  } else {
    if (!workspaceId) fail(400, 'Не указано пространство');
    await requireWorkspace(req.user.id, workspaceId);
    sectionId = null;
  }

  const assigneeId = intOrNull(b.assignee_id, 'Исполнитель') ?? null;
  if (assigneeId && !(await workspaceRole(assigneeId, workspaceId))) fail(400, 'Исполнитель не состоит в пространстве');

  const priority = oneOf(b.priority ?? 'none', PRIORITIES, 'Приоритет');
  const recurrence = oneOf(b.recurrence ?? null, RECURRENCES, 'Повтор');
  const startDate = dateOrNull(b.start_date, 'Дата начала') ?? null;
  const dueDate = dateOrNull(b.due_date, 'Срок') ?? null;
  const description = str(b.description ?? '', { max: 20000, field: 'Описание' });

  let position = typeof b.position === 'number' && Number.isFinite(b.position) ? b.position : null;
  if (position === null) {
    const scope = parentId ? ['parent_id=$1', parentId] : projectId ? ['project_id=$1 AND parent_id IS NULL', projectId] : ['workspace_id=$1 AND project_id IS NULL', workspaceId];
    const m = await one(`SELECT COALESCE(max(position),0) AS m FROM tasks WHERE ${scope[0]}`, [scope[1]]);
    position = m.m + 1;
  }

  const task = await tx(async (c) => {
    const { rows: [t] } = await c.query(
      `INSERT INTO tasks (workspace_id, project_id, section_id, parent_id, title, description, assignee_id, created_by,
                          start_date, due_date, priority, recurrence, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [workspaceId, projectId, sectionId, parentId, title, description, assigneeId, req.user.id,
        startDate, dueDate, priority, recurrence, position],
    );
    if (Array.isArray(b.tag_ids)) {
      for (const tagId of b.tag_ids.map(Number).filter(Number.isInteger)) {
        await c.query(
          'INSERT INTO task_tags (task_id, tag_id) SELECT $1, id FROM tags WHERE id=$2 AND workspace_id=$3 ON CONFLICT DO NOTHING',
          [t.id, tagId, workspaceId],
        );
      }
    }
    await logActivity(c, t.id, req.user.id, 'created');
    return t;
  });

  await follow(task.id, req.user.id);
  if (assigneeId) {
    await follow(task.id, assigneeId);
    await notify([assigneeId], { workspaceId, actorId: req.user.id, taskId: task.id, type: 'assigned', data: { title } });
  }
  broadcast(task);
  res.status(201).json(await loadListTask(task.id));
}));

// --- Карточка задачи ---
router.get('/tasks/:id', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { canEdit } = await requireTask(req.user.id, id);
  const task = await loadListTask(id);
  const [subtasks, comments, attachments, activityRows, followerRows, blockedBy, blocking, parent, sections, creator] = await Promise.all([
    many(`${TASK_LIST_SELECT} WHERE t.parent_id=$1 ORDER BY t.position, t.id`, [id]),
    many(
      `SELECT c.*, json_build_object('id', u.id, 'name', u.name, 'color', u.color) AS author
         FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.task_id=$1 ORDER BY c.created_at`,
      [id],
    ),
    many(
      `SELECT a.id, a.filename, a.mime, a.size, a.created_at, u.name AS author
         FROM attachments a LEFT JOIN users u ON u.id=a.user_id WHERE a.task_id=$1 ORDER BY a.created_at`,
      [id],
    ),
    many(
      `SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id=a.user_id
        WHERE a.task_id=$1 ORDER BY a.created_at DESC LIMIT 50`,
      [id],
    ),
    many('SELECT u.id, u.name, u.color FROM task_followers f JOIN users u ON u.id=f.user_id WHERE f.task_id=$1', [id]),
    many('SELECT t.id, t.title, t.completed FROM task_dependencies d JOIN tasks t ON t.id=d.depends_on_id WHERE d.task_id=$1', [id]),
    many('SELECT t.id, t.title, t.completed FROM task_dependencies d JOIN tasks t ON t.id=d.task_id WHERE d.depends_on_id=$1', [id]),
    task.parent_id ? one('SELECT id, title FROM tasks WHERE id=$1', [task.parent_id]) : null,
    task.project_id ? many('SELECT id, name FROM sections WHERE project_id=$1 ORDER BY position, id', [task.project_id]) : [],
    one('SELECT id, name FROM users WHERE id=$1', [task.created_by]),
  ]);
  res.json({
    ...task, canEdit, subtasks, comments, attachments, activity: activityRows,
    followers: followerRows, blocked_by: blockedBy, blocking, parent, sections, creator,
  });
}));

// --- Изменение ---
router.patch('/tasks/:id', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  const b = req.body;
  const fields = {};
  const events = [];

  if (b.title !== undefined) {
    fields.title = str(b.title, { required: true, max: 500, field: 'Название' });
    if (fields.title !== task.title) events.push(['renamed', { from: task.title, to: fields.title }]);
  }
  if (b.description !== undefined) fields.description = str(b.description, { max: 20000, field: 'Описание' });
  if (b.priority !== undefined) {
    fields.priority = oneOf(b.priority, PRIORITIES, 'Приоритет');
    if (fields.priority !== task.priority) events.push(['priority', { to: fields.priority }]);
  }
  if (b.recurrence !== undefined) fields.recurrence = oneOf(b.recurrence, RECURRENCES, 'Повтор');
  if (b.start_date !== undefined) fields.start_date = dateOrNull(b.start_date, 'Дата начала');
  if (b.due_date !== undefined) {
    fields.due_date = dateOrNull(b.due_date, 'Срок');
    if (fields.due_date !== task.due_date) events.push(['due', { to: fields.due_date }]);
  }
  const start = fields.start_date !== undefined ? fields.start_date : task.start_date;
  const due = fields.due_date !== undefined ? fields.due_date : task.due_date;
  if (start && due && start > due) fail(400, 'Дата начала не может быть позже срока');

  if (b.assignee_id !== undefined) {
    fields.assignee_id = intOrNull(b.assignee_id, 'Исполнитель');
    if (fields.assignee_id && !(await workspaceRole(fields.assignee_id, task.workspace_id))) fail(400, 'Исполнитель не состоит в пространстве');
    if (fields.assignee_id !== task.assignee_id) events.push(['assigned', { to: fields.assignee_id }]);
  }
  if (typeof b.position === 'number' && Number.isFinite(b.position)) fields.position = b.position;

  if (b.project_id !== undefined && !task.parent_id) {
    const pid = intOrNull(b.project_id, 'Проект');
    if (pid !== task.project_id) {
      if (pid) {
        const { project } = await requireProject(req.user.id, pid, { edit: true });
        if (project.workspace_id !== task.workspace_id) fail(400, 'Проект из другого пространства');
        const s = await one('SELECT id FROM sections WHERE project_id=$1 ORDER BY position, id LIMIT 1', [pid]);
        fields.section_id = s?.id ?? null;
      } else {
        fields.section_id = null;
      }
      fields.project_id = pid;
      events.push(['moved_project', { to: pid }]);
    }
  }
  if (b.section_id !== undefined && fields.project_id === undefined) {
    const sid = intOrNull(b.section_id, 'Раздел');
    if (sid) {
      const s = await one('SELECT id, name FROM sections WHERE id=$1 AND project_id=$2', [sid, task.project_id]);
      if (!s) fail(400, 'Раздел не относится к проекту');
      if (sid !== task.section_id) events.push(['moved_section', { to: s.name }]);
    }
    fields.section_id = sid;
  }

  let spawned = null;
  if (b.completed !== undefined && !!b.completed !== task.completed) {
    fields.completed = !!b.completed;
    fields.completed_at = fields.completed ? new Date() : null;
    if (fields.completed && !b.force) {
      const blockers = await many(
        'SELECT t.title FROM task_dependencies d JOIN tasks t ON t.id=d.depends_on_id WHERE d.task_id=$1 AND t.completed=false',
        [id],
      );
      if (blockers.length) {
        return res.status(409).json({
          error: `Задача ждёт завершения: ${blockers.map((x) => `«${x.title}»`).join(', ')}`,
          code: 'blocked',
        });
      }
    }
    events.push([fields.completed ? 'completed' : 'reopened', {}]);
  }

  const keys = Object.keys(fields);
  if (!keys.length) return res.json(await loadListTask(id));

  const updated = await tx(async (c) => {
    const { rows: [t] } = await c.query(
      `UPDATE tasks SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(', ')}, updated_at=now() WHERE id=$${keys.length + 1} RETURNING *`,
      [...keys.map((k) => fields[k]), id],
    );
    for (const [type, data] of events) await logActivity(c, id, req.user.id, type, data);

    // Повторяющаяся задача: при завершении создаём следующую
    if (fields.completed && t.recurrence) {
      const nextDue = nextDate(t.due_date || today(), t.recurrence);
      const shift = t.start_date && t.due_date ? (new Date(t.due_date) - new Date(t.start_date)) / 86400000 : null;
      let nextStart = null;
      if (shift !== null) {
        const d = new Date(`${nextDue}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - shift);
        nextStart = d.toISOString().slice(0, 10);
      }
      const { rows: [n] } = await c.query(
        `INSERT INTO tasks (workspace_id, project_id, section_id, parent_id, title, description, assignee_id, created_by,
                            start_date, due_date, priority, recurrence, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [t.workspace_id, t.project_id, t.section_id, t.parent_id, t.title, t.description, t.assignee_id, req.user.id,
          nextStart, nextDue, t.priority, t.recurrence, t.position + 0.001],
      );
      await c.query('INSERT INTO task_tags (task_id, tag_id) SELECT $1, tag_id FROM task_tags WHERE task_id=$2', [n.id, t.id]);
      await c.query('INSERT INTO task_followers (task_id, user_id) SELECT $1, user_id FROM task_followers WHERE task_id=$2', [n.id, t.id]);
      await c.query('UPDATE tasks SET recurrence=NULL WHERE id=$1', [t.id]);
      await logActivity(c, n.id, req.user.id, 'recurred', { from: t.id });
      spawned = n;
    }
    return t;
  });

  if (fields.assignee_id) {
    await follow(id, fields.assignee_id);
    if (fields.assignee_id !== task.assignee_id) {
      await notify([fields.assignee_id], { workspaceId: task.workspace_id, actorId: req.user.id, taskId: id, type: 'assigned', data: { title: updated.title } });
    }
  }
  if (fields.completed) {
    await notify(await followers(id), { workspaceId: task.workspace_id, actorId: req.user.id, taskId: id, type: 'completed', data: { title: updated.title } });
  }

  broadcast(updated, { previousProjectId: task.project_id });
  if (spawned) broadcast(spawned);
  res.json({ ...(await loadListTask(id)), spawned_id: spawned?.id ?? null });
}));

router.delete('/tasks/:id', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  await query('DELETE FROM tasks WHERE id=$1', [id]);
  broadcast(task, { deleted: true });
  res.json({ ok: true });
}));

// --- Дублирование ---
router.post('/tasks/:id/duplicate', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  const copy = await tx(async (c) => {
    const { rows: [n] } = await c.query(
      `INSERT INTO tasks (workspace_id, project_id, section_id, parent_id, title, description, assignee_id, created_by,
                          start_date, due_date, priority, recurrence, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [task.workspace_id, task.project_id, task.section_id, task.parent_id, `${task.title} (копия)`, task.description,
        task.assignee_id, req.user.id, task.start_date, task.due_date, task.priority, task.recurrence, task.position + 0.001],
    );
    await c.query('INSERT INTO task_tags (task_id, tag_id) SELECT $1, tag_id FROM task_tags WHERE task_id=$2', [n.id, id]);
    const { rows: subs } = await c.query('SELECT * FROM tasks WHERE parent_id=$1 ORDER BY position', [id]);
    for (const s of subs) {
      await c.query(
        `INSERT INTO tasks (workspace_id, project_id, parent_id, title, description, assignee_id, created_by, due_date, priority, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.workspace_id, s.project_id, n.id, s.title, s.description, s.assignee_id, req.user.id, s.due_date, s.priority, s.position],
      );
    }
    await logActivity(c, n.id, req.user.id, 'created');
    return n;
  });
  await follow(copy.id, req.user.id);
  broadcast(copy);
  res.status(201).json(await loadListTask(copy.id));
}));

// --- Метки задачи ---
router.post('/tasks/:id/tags', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  const tagId = intOrNull(req.body.tag_id, 'Метка');
  const tag = await one('SELECT id FROM tags WHERE id=$1 AND workspace_id=$2', [tagId, task.workspace_id]);
  if (!tag) fail(404, 'Метка не найдена');
  await query('INSERT INTO task_tags (task_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, tagId]);
  broadcast(task);
  res.json({ ok: true });
}));

router.delete('/tasks/:id/tags/:tagId', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  await query('DELETE FROM task_tags WHERE task_id=$1 AND tag_id=$2', [id, intOrNull(req.params.tagId)]);
  broadcast(task);
  res.json({ ok: true });
}));

// --- Зависимости ---
async function createsCycle(taskId, dependsOnId) {
  // Есть ли путь от dependsOnId к taskId по цепочке «зависит от»
  const row = await one(
    `WITH RECURSIVE chain(id) AS (
       SELECT depends_on_id FROM task_dependencies WHERE task_id=$1
       UNION SELECT d.depends_on_id FROM task_dependencies d JOIN chain ON d.task_id = chain.id
     ) SELECT 1 FROM chain WHERE id=$2 LIMIT 1`,
    [dependsOnId, taskId],
  );
  return !!row;
}

router.post('/tasks/:id/dependencies', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  const depId = intOrNull(req.body.depends_on_id, 'Задача');
  if (depId === id) fail(400, 'Задача не может зависеть от самой себя');
  const { task: dep } = await requireTask(req.user.id, depId);
  if (dep.workspace_id !== task.workspace_id) fail(400, 'Задача из другого пространства');
  if (await createsCycle(id, depId)) fail(400, 'Получится замкнутый круг зависимостей');
  await query('INSERT INTO task_dependencies (task_id, depends_on_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, depId]);
  await logActivity(null, id, req.user.id, 'dependency', { title: dep.title });
  broadcast(task);
  broadcast(dep);
  res.json({ ok: true });
}));

router.delete('/tasks/:id/dependencies/:depId', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  await query('DELETE FROM task_dependencies WHERE task_id=$1 AND depends_on_id=$2', [id, intOrNull(req.params.depId)]);
  broadcast(task);
  res.json({ ok: true });
}));

// --- Подписка ---
router.post('/tasks/:id/follow', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id);
  await follow(id, req.user.id);
  broadcast(task);
  res.json({ ok: true });
}));

router.delete('/tasks/:id/follow', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id);
  await query('DELETE FROM task_followers WHERE task_id=$1 AND user_id=$2', [id, req.user.id]);
  broadcast(task);
  res.json({ ok: true });
}));

// --- Комментарии ---
const MENTION_RE = /@\[[^\]]{1,100}\]\((\d+)\)/g;

router.post('/tasks/:id/comments', h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id);
  const body = str(req.body.body, { required: true, max: 10000, field: 'Комментарий' });
  const comment = await one('INSERT INTO comments (task_id, user_id, body) VALUES ($1,$2,$3) RETURNING *', [id, req.user.id, body]);

  const mentioned = [...body.matchAll(MENTION_RE)].map((m) => Number(m[1]));
  for (const uid of mentioned) if (await workspaceRole(uid, task.workspace_id)) await follow(id, uid);
  await notify(mentioned, { workspaceId: task.workspace_id, actorId: req.user.id, taskId: id, type: 'mentioned', data: { title: task.title, excerpt: body.slice(0, 140) } });
  const others = (await followers(id)).filter((uid) => !mentioned.includes(uid));
  await notify(others, { workspaceId: task.workspace_id, actorId: req.user.id, taskId: id, type: 'commented', data: { title: task.title, excerpt: body.slice(0, 140) } });
  await follow(id, req.user.id);

  broadcast(task);
  res.status(201).json(comment);
}));

router.patch('/comments/:id', h(async (req, res) => {
  const comment = await one('SELECT * FROM comments WHERE id=$1', [intOrNull(req.params.id)]);
  if (!comment) fail(404, 'Комментарий не найден');
  if (comment.user_id !== req.user.id) fail(403, 'Можно править только свои комментарии');
  const { task } = await requireTask(req.user.id, comment.task_id);
  const body = str(req.body.body, { required: true, max: 10000, field: 'Комментарий' });
  const updated = await one('UPDATE comments SET body=$1, edited_at=now() WHERE id=$2 RETURNING *', [body, comment.id]);
  broadcast(task);
  res.json(updated);
}));

router.delete('/comments/:id', h(async (req, res) => {
  const comment = await one('SELECT * FROM comments WHERE id=$1', [intOrNull(req.params.id)]);
  if (!comment) fail(404, 'Комментарий не найден');
  const { task } = await requireTask(req.user.id, comment.task_id);
  const role = await workspaceRole(req.user.id, task.workspace_id);
  if (comment.user_id !== req.user.id && role === 'member') fail(403, 'Можно удалять только свои комментарии');
  await query('DELETE FROM comments WHERE id=$1', [comment.id]);
  broadcast(task);
  res.json({ ok: true });
}));

// --- Вложения ---
const MAX_FILE = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 5 } });

router.post('/tasks/:id/attachments', (req, res, next) => {
  upload.array('files', 5)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 10 МБ' : 'Не удалось загрузить файл' });
    next();
  });
}, h(async (req, res) => {
  const id = intOrNull(req.params.id);
  const { task } = await requireTask(req.user.id, id, { edit: true });
  if (!req.files?.length) fail(400, 'Нет файлов');
  for (const f of req.files) {
    // multer отдаёт имя в latin1 — перекодируем, чтобы кириллица не ломалась
    const filename = Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 255);
    await query(
      'INSERT INTO attachments (task_id, user_id, filename, mime, size, data) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, req.user.id, filename, f.mimetype || 'application/octet-stream', f.size, f.buffer],
    );
  }
  broadcast(task);
  res.status(201).json({ ok: true });
}));

router.get('/attachments/:id', h(async (req, res) => {
  const att = await one('SELECT * FROM attachments WHERE id=$1', [intOrNull(req.params.id)]);
  if (!att) fail(404, 'Файл не найден');
  await requireTask(req.user.id, att.task_id);
  const inline = /^image\/(png|jpe?g|gif|webp)$/.test(att.mime) || att.mime === 'application/pdf';
  res.setHeader('Content-Type', att.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
  res.send(att.data);
}));

router.delete('/attachments/:id', h(async (req, res) => {
  const att = await one('SELECT id, task_id FROM attachments WHERE id=$1', [intOrNull(req.params.id)]);
  if (!att) fail(404, 'Файл не найден');
  const { task } = await requireTask(req.user.id, att.task_id, { edit: true });
  await query('DELETE FROM attachments WHERE id=$1', [att.id]);
  broadcast(task);
  res.json({ ok: true });
}));

// --- Уведомления ---
router.get('/workspaces/:wid/notifications', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const archived = req.query.archived === '1';
  res.json(await many(
    `SELECT n.*, json_build_object('id', u.id, 'name', u.name, 'color', u.color) AS actor,
            t.title AS task_title, t.completed AS task_completed
       FROM notifications n LEFT JOIN users u ON u.id=n.actor_id LEFT JOIN tasks t ON t.id=n.task_id
      WHERE n.user_id=$1 AND n.workspace_id=$2 AND n.archived=$3
      ORDER BY n.created_at DESC LIMIT 100`,
    [req.user.id, wid, archived],
  ));
}));

router.get('/workspaces/:wid/notifications/unread', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const row = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND workspace_id=$2 AND read=false AND archived=false', [req.user.id, wid]);
  res.json({ count: row.n });
}));

router.post('/workspaces/:wid/notifications/mark', h(async (req, res) => {
  const wid = intOrNull(req.params.wid);
  await requireWorkspace(req.user.id, wid);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  const sets = [];
  if (req.body.read !== undefined) sets.push(`read=${req.body.read ? 'true' : 'false'}`);
  if (req.body.archived !== undefined) sets.push(`archived=${req.body.archived ? 'true' : 'false'}, read=true`);
  if (!sets.length) fail(400, 'Нечего менять');
  if (ids) {
    await query(`UPDATE notifications SET ${sets.join(', ')} WHERE user_id=$1 AND workspace_id=$2 AND id = ANY($3)`, [req.user.id, wid, ids]);
  } else {
    await query(`UPDATE notifications SET ${sets.join(', ')} WHERE user_id=$1 AND workspace_id=$2 AND archived=false`, [req.user.id, wid]);
  }
  emitUser(req.user.id, 'notification', { workspaceId: wid });
  res.json({ ok: true });
}));

export default router;
