import { one, many, query } from './db.js';
import { workspaceRole } from './access.js';

export const TRIGGERS = ['task_added', 'section_changed', 'completed', 'assignee_changed', 'due_changed'];
export const ACTIONS = ['complete', 'move_section', 'assign', 'set_priority', 'set_due_in', 'add_follower', 'set_field'];

function matches(trigger, event) {
  if (trigger.type !== event.type) return false;
  if (trigger.type === 'section_changed' && trigger.section_id && trigger.section_id !== event.sectionId) return false;
  return true;
}

/**
 * Выполняет правила проекта для события. Действия правил сами правила не запускают —
 * так исключаем бесконечные цепочки. Возвращает true, если задача изменилась.
 */
export async function runRules(task, event, actorId) {
  if (!task.project_id) return false;
  const rules = await many('SELECT * FROM rules WHERE project_id=$1 AND enabled ORDER BY id', [task.project_id]);
  let changed = false;
  for (const rule of rules) {
    if (!matches(rule.trigger, event)) continue;
    for (const a of rule.actions) {
      switch (a.type) {
        case 'complete':
          await query('UPDATE tasks SET completed=true, completed_at=now(), updated_at=now() WHERE id=$1 AND completed=false', [task.id]);
          break;
        case 'move_section': {
          const s = await one('SELECT id FROM sections WHERE id=$1 AND project_id=$2', [a.section_id, task.project_id]);
          if (s) await query('UPDATE tasks SET section_id=$1, updated_at=now() WHERE id=$2', [s.id, task.id]);
          break;
        }
        case 'assign':
          if (a.user_id && (await workspaceRole(a.user_id, task.workspace_id))) {
            await query('UPDATE tasks SET assignee_id=$1, updated_at=now() WHERE id=$2', [a.user_id, task.id]);
            await query('INSERT INTO task_followers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [task.id, a.user_id]);
          }
          break;
        case 'add_follower':
          if (a.user_id && (await workspaceRole(a.user_id, task.workspace_id))) {
            await query('INSERT INTO task_followers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [task.id, a.user_id]);
          }
          break;
        case 'set_priority':
          if (['none', 'low', 'medium', 'high'].includes(a.priority)) {
            await query('UPDATE tasks SET priority=$1, updated_at=now() WHERE id=$2', [a.priority, task.id]);
          }
          break;
        case 'set_due_in': {
          const days = Math.max(0, Math.min(365, Number(a.days) || 0));
          await query("UPDATE tasks SET due_date = CURRENT_DATE + $1::int, updated_at=now() WHERE id=$2", [days, task.id]);
          break;
        }
        case 'set_field': {
          const f = await one('SELECT id FROM custom_fields WHERE id=$1 AND project_id=$2', [a.field_id, task.project_id]);
          if (f) {
            await query(
              `INSERT INTO task_field_values (task_id, field_id, value) VALUES ($1,$2,$3)
               ON CONFLICT (task_id, field_id) DO UPDATE SET value=EXCLUDED.value`,
              [task.id, f.id, JSON.stringify(a.value)],
            );
          }
          break;
        }
        default:
      }
      changed = true;
    }
    await query("INSERT INTO activity (task_id, user_id, type, data) VALUES ($1,$2,'rule',$3)", [task.id, actorId, { name: rule.name }]);
  }
  return changed;
}
