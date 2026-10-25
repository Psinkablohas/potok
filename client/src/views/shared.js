import { between } from '../lib/format.js';

export function applyFilters(tasks, { completion = 'open', assignee = 'all', q = '', meId, priority = 'all' }) {
  const query = q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (completion === 'open' && t.completed) return false;
    if (completion === 'done' && !t.completed) return false;
    if (assignee === 'me' && t.assignee_id !== meId) return false;
    if (assignee === 'none' && t.assignee_id) return false;
    if (typeof assignee === 'number' && t.assignee_id !== assignee) return false;
    if (priority !== 'all' && t.priority !== priority) return false;
    if (query && !t.title.toLowerCase().includes(query)) return false;
    return true;
  });
}

export function groupBySection(tasks, sections) {
  const first = sections[0]?.id;
  const map = new Map(sections.map((s) => [s.id, []]));
  for (const t of tasks) {
    const sid = map.has(t.section_id) ? t.section_id : first;
    map.get(sid)?.push(t);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);
  return map;
}

export const SECTION_PREFIX = 'sec-';

/**
 * Куда положить перетащенную задачу. over — либо задача, либо пустой раздел (sec-<id>).
 * Возвращает { section_id, position } или null, если ничего не меняется.
 */
export function computeDrop(groups, activeId, overId) {
  if (overId == null || activeId === overId) return null;
  let fromSection = null;
  let fromIndex = -1;
  for (const [sid, list] of groups) {
    const i = list.findIndex((t) => t.id === activeId);
    if (i >= 0) { fromSection = sid; fromIndex = i; break; }
  }
  if (fromSection === null) return null;

  let toSection;
  let list;
  let insertAt;
  if (typeof overId === 'string' && overId.startsWith(SECTION_PREFIX)) {
    toSection = Number(overId.slice(SECTION_PREFIX.length));
    list = (groups.get(toSection) || []).filter((t) => t.id !== activeId);
    insertAt = list.length;
  } else {
    for (const [sid, l] of groups) if (l.some((t) => t.id === overId)) toSection = sid;
    if (toSection === undefined) return null;
    const original = groups.get(toSection);
    const overIndex = original.findIndex((t) => t.id === overId);
    list = original.filter((t) => t.id !== activeId);
    const idx = list.findIndex((t) => t.id === overId);
    insertAt = toSection === fromSection && fromIndex < overIndex ? idx + 1 : idx;
  }
  const prev = list[insertAt - 1]?.position;
  const next = list[insertAt]?.position;
  return { section_id: toSection, position: between(prev, next) };
}
