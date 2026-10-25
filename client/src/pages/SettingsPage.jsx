import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, Trash2, LogOut, Moon, Sun, Monitor } from 'lucide-react';
import { api } from '../lib/api.js';
import { useMe, useWorkspace, useWorkspaceId } from '../lib/hooks.js';
import { useTheme } from '../lib/theme.js';
import { useToast } from '../lib/toast.jsx';
import { Avatar, Field, PageLoader, Segmented, ColorDot } from '../components/ui.jsx';
import { PROJECT_COLORS, ROLE_LABEL, fmtDate } from '../lib/format.js';

function Section({ title, text, children }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {text && <p className="mt-0.5 text-sm text-muted">{text}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Profile() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me.user.name);
  const [color, setColor] = useState(me.user.color);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [theme, setTheme] = useTheme();

  const save = async (body, msg) => {
    try {
      await api.patch('/auth/me', body);
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['workspace'] });
      toast(msg);
      return true;
    } catch (e) { toast(e.message, { type: 'error' }); return false; }
  };

  return (
    <div className="space-y-4">
      <Section title="Профиль">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <Avatar user={{ name: name || '?', color }} size={56} />
          <div className="flex-1"><Field label="Имя" htmlFor="me-name"><input id="me-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
          <button className="btn-primary h-10" disabled={!name.trim()} onClick={() => save({ name, color }, 'Профиль сохранён')}>Сохранить</button>
        </div>
        <div className="mt-4">
          <span className="label">Цвет аватара</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => <button key={c} aria-label={`Цвет ${c}`} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink' : ''}`} style={{ background: c }} />)}
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">Почта: {me.user.email}</p>
      </Section>

      <Section title="Оформление">
        <Segmented value={theme} onChange={setTheme} options={[
          { value: 'light', label: 'Светлая', icon: Sun },
          { value: 'dark', label: 'Тёмная', icon: Moon },
          { value: 'system', label: 'Как в системе', icon: Monitor },
        ]} />
      </Section>

      <Section title="Пароль">
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
          e.preventDefault();
          if (await save(pw, 'Пароль изменён')) setPw({ currentPassword: '', newPassword: '' });
        }}>
          <Field label="Текущий пароль" htmlFor="pw1"><input id="pw1" type="password" autoComplete="current-password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="Новый пароль" htmlFor="pw2"><input id="pw2" type="password" autoComplete="new-password" minLength={8} className="input" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <button className="btn-secondary h-10" disabled={!pw.currentPassword || pw.newPassword.length < 8}>Сменить</button>
        </form>
      </Section>
    </div>
  );
}

function WorkspaceSettings() {
  const wid = useWorkspaceId();
  const { data: ws } = useWorkspace();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const isAdmin = ws?.role !== 'member';
  const [name, setName] = useState(ws?.name || '');
  const [inviteRole, setInviteRole] = useState('member');
  useEffect(() => setName(ws?.name || ''), [ws?.name]);

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', wid],
    queryFn: () => api.get(`/workspaces/${wid}/invites`),
    enabled: isAdmin,
  });

  const run = async (fn, msg) => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['workspace', wid] });
      qc.invalidateQueries({ queryKey: ['invites', wid] });
      qc.invalidateQueries({ queryKey: ['me'] });
      if (msg) toast(msg);
    } catch (e) { toast(e.message, { type: 'error' }); }
  };

  const link = (token) => `${window.location.origin}/invite/${token}`;
  const copy = (token) => navigator.clipboard?.writeText(link(token)).then(() => toast('Ссылка-приглашение скопирована'));

  if (!ws) return <PageLoader />;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Section title="Пространство">
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Название пространства" />
            <button className="btn-primary h-10" disabled={!name.trim() || name === ws.name} onClick={() => run(() => api.patch(`/workspaces/${wid}`, { name }), 'Название сохранено')}>Сохранить</button>
          </div>
        </Section>
      )}

      {isAdmin && (
        <Section title="Пригласить коллег" text="Создайте ссылку и отправьте её в мессенджер или по почте. По ссылке можно зарегистрироваться или войти — человек сразу попадёт в пространство.">
          <div className="flex flex-col sm:flex-row gap-2">
            <select className="input sm:w-56" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} aria-label="Роль приглашённых">
              <option value="member">Как участника</option>
              <option value="admin">Как администратора</option>
            </select>
            <button className="btn-primary h-10" onClick={() => run(async () => {
              const inv = await api.post(`/workspaces/${wid}/invites`, { role: inviteRole, days: 7 });
              copy(inv.token);
            })}><Link2 className="h-4 w-4" />Создать ссылку</button>
          </div>
          {invites.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {invites.map((i) => (
                <li key={i.token} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <code className="flex-1 min-w-0 truncate text-xs text-muted">{link(i.token)}</code>
                  <span className="chip bg-subtle text-muted">{ROLE_LABEL[i.role]}</span>
                  <span className="text-xs text-muted">до {fmtDate(i.expires_at.slice(0, 10), 'd MMM')} · использована {i.uses}</span>
                  <button className="icon-btn h-8 w-8" onClick={() => copy(i.token)} aria-label="Скопировать"><Copy className="h-4 w-4" /></button>
                  <button className="icon-btn h-8 w-8" onClick={() => run(() => api.del(`/workspaces/${wid}/invites/${i.token}`), 'Ссылка отключена')} aria-label="Отключить ссылку"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title={`Участники · ${ws.members.length}`}>
        <ul className="divide-y divide-line">
          {ws.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <Avatar user={m} size={36} />
              <div className="flex-1 min-w-[140px]">
                <p className="text-sm font-medium">{m.name}{m.id === me.user.id && <span className="text-muted font-normal"> (вы)</span>}</p>
                <p className="text-xs text-muted">{m.email}</p>
              </div>
              {isAdmin && m.id !== me.user.id ? (
                <select className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" value={m.role} onChange={(e) => run(() => api.patch(`/workspaces/${wid}/members/${m.id}`, { role: e.target.value }), 'Роль изменена')} aria-label={`Роль ${m.name}`}>
                  {ws.role === 'owner' && <option value="owner">Владелец</option>}
                  {(m.role === 'owner' && ws.role !== 'owner') && <option value="owner">Владелец</option>}
                  <option value="admin">Администратор</option>
                  <option value="member">Участник</option>
                </select>
              ) : <span className="text-sm text-muted">{ROLE_LABEL[m.role]}</span>}
              {isAdmin && m.id !== me.user.id && (
                <button className="icon-btn h-9 w-9" aria-label={`Удалить ${m.name}`} onClick={() => window.confirm(`Удалить ${m.name} из пространства? Его незавершённые задачи останутся без исполнителя.`) && run(() => api.del(`/workspaces/${wid}/members/${m.id}`), 'Участник удалён')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Метки" text="Метки общие для всего пространства. Новые создаются прямо в задаче.">
        {ws.tags.length === 0 ? <p className="text-sm text-muted">Меток пока нет.</p> : (
          <ul className="flex flex-wrap gap-2">
            {ws.tags.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                <ColorDot color={t.color} />{t.name}
                {isAdmin && <button className="opacity-60 hover:opacity-100" aria-label={`Удалить метку ${t.name}`} onClick={() => window.confirm(`Удалить метку «${t.name}» из всех задач?`) && run(() => api.del(`/tags/${t.id}`))}><Trash2 className="h-3.5 w-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Выход из пространства">
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => window.confirm('Покинуть пространство?') && run(async () => {
            await api.del(`/workspaces/${wid}/members/${me.user.id}`);
            navigate('/');
          }, 'Вы покинули пространство')}><LogOut className="h-4 w-4" />Покинуть</button>
          {ws.role === 'owner' && (
            <button className="btn-danger" onClick={() => window.prompt(`Удалить пространство со всеми проектами и задачами? Введите его название: ${ws.name}`) === ws.name && run(async () => {
              await api.del(`/workspaces/${wid}`);
              navigate('/');
            }, 'Пространство удалено')}><Trash2 className="h-4 w-4" />Удалить пространство</button>
          )}
        </div>
      </Section>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('workspace');
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <header className="border-b border-line bg-surface px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">Настройки</h1>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'workspace', label: 'Пространство' }, { value: 'profile', label: 'Мой профиль' }]} />
      </header>
      <div className="mx-auto max-w-3xl px-3 sm:px-6 py-6">{tab === 'workspace' ? <WorkspaceSettings /> : <Profile />}</div>
    </div>
  );
}
