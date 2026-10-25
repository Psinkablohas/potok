import { one } from './db.js';
import { fail } from './util.js';

// Роль пользователя в рабочем пространстве или null
export async function workspaceRole(userId, workspaceId) {
  const row = await one('SELECT role FROM workspace_members WHERE user_id=$1 AND workspace_id=$2', [userId, workspaceId]);
  return row ? row.role : null;
}

export async function requireWorkspace(userId, workspaceId, { admin = false } = {}) {
  const role = await workspaceRole(userId, workspaceId);
  if (!role) fail(404, 'Рабочее пространство не найдено');
  if (admin && role === 'member') fail(403, 'Нужны права администратора');
  return role;
}

/**
 * Доступ к проекту:
 *  - администраторы пространства видят и редактируют всё;
 *  - участники проекта получают свою роль;
 *  - открытый проект редактирует любой участник пространства.
 */
export async function projectAccess(userId, projectId) {
  const row = await one(
    `SELECT p.*, wm.role AS ws_role, pm.role AS pr_role
       FROM projects p
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $1
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      WHERE p.id = $2`,
    [userId, projectId],
  );
  if (!row) return null;
  let role = null;
  if (row.ws_role === 'owner' || row.ws_role === 'admin') role = row.pr_role === 'owner' ? 'owner' : 'admin';
  else if (row.pr_role) role = row.pr_role;
  else if (row.privacy === 'workspace') role = 'editor';
  if (!role) return null;
  const { ws_role, pr_role, ...project } = row;
  return { project, role, canEdit: role !== 'viewer', canManage: ['owner', 'admin'].includes(role) };
}

export async function requireProject(userId, projectId, { edit = false, manage = false } = {}) {
  const access = await projectAccess(userId, projectId);
  if (!access) fail(404, 'Проект не найден');
  if (edit && !access.canEdit) fail(403, 'У вас доступ только для просмотра');
  if (manage && !access.canManage) fail(403, 'Управлять проектом может только его владелец');
  return access;
}

/**
 * Задача без проекта (личная) видна автору, исполнителю и подписчикам.
 * Задача в проекте наследует доступ проекта.
 */
export async function taskAccess(userId, taskId) {
  const task = await one('SELECT * FROM tasks WHERE id=$1', [taskId]);
  if (!task) return null;
  if (task.project_id) {
    const pa = await projectAccess(userId, task.project_id);
    if (!pa) return null;
    return { task, canEdit: pa.canEdit, project: pa.project };
  }
  const role = await workspaceRole(userId, task.workspace_id);
  if (!role) return null;
  const allowed =
    task.created_by === userId ||
    task.assignee_id === userId ||
    !!(await one('SELECT 1 FROM task_followers WHERE task_id=$1 AND user_id=$2', [taskId, userId]));
  if (!allowed) return null;
  return { task, canEdit: true, project: null };
}

export async function requireTask(userId, taskId, { edit = false } = {}) {
  const access = await taskAccess(userId, taskId);
  if (!access) fail(404, 'Задача не найдена');
  if (edit && !access.canEdit) fail(403, 'У вас доступ только для просмотра');
  return access;
}

// SQL-условие «задача видна пользователю $uid». Алиас таблицы задач — t.
export const VISIBLE_TASK_SQL = `(
  (t.project_id IS NULL AND (t.created_by = $uid OR t.assignee_id = $uid
     OR EXISTS (SELECT 1 FROM task_followers f WHERE f.task_id = t.id AND f.user_id = $uid)))
  OR EXISTS (
    SELECT 1 FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $uid
     WHERE p.id = t.project_id AND (
       p.privacy = 'workspace' OR wm.role IN ('owner','admin')
       OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $uid)
     )
  )
)`;

export const visibleTaskSql = (paramIndex) => VISIBLE_TASK_SQL.replaceAll('$uid', `$${paramIndex}`);
