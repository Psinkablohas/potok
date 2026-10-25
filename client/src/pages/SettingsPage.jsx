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
import { t, lang, LANGUAGES, setLanguage } from '../i18n/index.js';

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
      <Section title={t("Профиль")}>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <Avatar user={{ name: name || '?', color }} size={56} />
          <div className="flex-1"><Field label={t("Имя")} htmlFor="me-name"><input id="me-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
          <button className="btn-primary h-10" disabled={!name.trim()} onClick={() => save({ name, color }, t("Профиль сохранён"))}>{t("Сохранить")}</button>
        </div>
        <div className="mt-4">
          <span className="label">{t("Цвет аватара")}</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((c) => <button key={c} aria-label={t("Цвет {0}", c)} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-ink' : ''}`} style={{ background: c }} />)}
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">{t("Почта: {0}", me.user.email)}</p>
      </Section>

      <Section title={t("Оформление")}>
        <Segmented value={theme} onChange={setTheme} options={[
          { value: 'light', label: t("Светлая"), icon: Sun },
          { value: 'dark', label: t("Тёмная"), icon: Moon },
          { value: 'system', label: t("Как в системе"), icon: Monitor },
        ]} />
      </Section>

      <Section title={t("Язык")}>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button key={l.code} onClick={async () => {
              try { await api.patch('/auth/me', { locale: l.code }); } catch { /* язык всё равно переключим */ }
              setLanguage(l.code);
            }}
              className={`btn-secondary rounded-full px-4 ${lang === l.code ? 'border-primary bg-primary-soft text-primary' : ''}`} aria-pressed={lang === l.code}>
              {l.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("Уведомления на почту")} text={t("Письма о назначениях, упоминаниях, комментариях и завершённых задачах.")}>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">{t("Присылать уведомления на {0}", me.user.email)}</span>
          <span className="relative inline-flex items-center">
            <input type="checkbox" className="peer sr-only" checked={me.user.email_notify !== false}
              onChange={(e) => save({ email_notify: e.target.checked }, e.target.checked ? t("Письма включены") : t("Письма выключены"))} />
            <span className="h-5 w-9 rounded-full bg-line peer-checked:bg-primary transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          </span>
        </label>
      </Section>

      <Section title={t("Пароль")}>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
          e.preventDefault();
          if (await save(pw, t("Пароль изменён"))) setPw({ currentPassword: '', newPassword: '' });
        }}>
          <Field label={t("Текущий пароль")} htmlFor="pw1"><input id="pw1" type="password" autoComplete="current-password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label={t("Новый пароль")} htmlFor="pw2"><input id="pw2" type="password" autoComplete="new-password" minLength={8} className="input" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <button className="btn-secondary h-10" disabled={!pw.currentPassword || pw.newPassword.length < 8}>{t("Сменить")}</button>
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
  const copy = (token) => navigator.clipboard?.writeText(link(token)).then(() => toast(t("Ссылка-приглашение скопирована")));

  if (!ws) return <PageLoader />;

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Section title={t("Пространство")}>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label={t("Название пространства")} />
            <button className="btn-primary h-10" disabled={!name.trim() || name === ws.name} onClick={() => run(() => api.patch(`/workspaces/${wid}`, { name }), t("Название сохранено"))}>{t("Сохранить")}</button>
          </div>
        </Section>
      )}

      {isAdmin && (
        <Section title={t("Пригласить коллег")} text={t("Создайте ссылку и отправьте её в мессенджер или по почте. По ссылке можно зарегистрироваться или войти — человек сразу попадёт в пространство.")}>
          <div className="flex flex-col sm:flex-row gap-2">
            <select className="input sm:w-56" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} aria-label={t("Роль приглашённых")}>
              <option value="member">{t("Как участника")}</option>
              <option value="admin">{t("Как администратора")}</option>
            </select>
            <button className="btn-primary h-10" onClick={() => run(async () => {
              const inv = await api.post(`/workspaces/${wid}/invites`, { role: inviteRole, days: 7 });
              copy(inv.token);
            })}><Link2 className="h-4 w-4" />{t("Создать ссылку")}</button>
          </div>
          {invites.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
              {invites.map((i) => (
                <li key={i.token} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                  <code className="flex-1 min-w-0 truncate text-xs text-muted">{link(i.token)}</code>
                  <span className="chip bg-subtle text-muted">{ROLE_LABEL[i.role]}</span>
                  <span className="text-xs text-muted">{t("до {0} · использована {1}", fmtDate(i.expires_at.slice(0, 10), 'd MMM'), i.uses)}</span>
                  <button className="icon-btn h-8 w-8" onClick={() => copy(i.token)} aria-label={t("Скопировать")}><Copy className="h-4 w-4" /></button>
                  <button className="icon-btn h-8 w-8" onClick={() => run(() => api.del(`/workspaces/${wid}/invites/${i.token}`), t("Ссылка отключена"))} aria-label={t("Отключить ссылку")}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title={t("Участники · {0}", ws.members.length)}>
        <ul className="divide-y divide-line">
          {ws.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <Avatar user={m} size={36} />
              <div className="flex-1 min-w-[140px]">
                <p className="text-sm font-medium">{m.name}{m.id === me.user.id && <span className="text-muted font-normal">{' '}{t("(вы)")}</span>}</p>
                <p className="text-xs text-muted">{m.email}</p>
              </div>
              {isAdmin && m.id !== me.user.id ? (
                <select className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" value={m.role} onChange={(e) => run(() => api.patch(`/workspaces/${wid}/members/${m.id}`, { role: e.target.value }), t("Роль изменена"))} aria-label={t("Роль {0}", m.name)}>
                  {ws.role === 'owner' && <option value="owner">{t("Владелец")}</option>}
                  {(m.role === 'owner' && ws.role !== 'owner') && <option value="owner">{t("Владелец")}</option>}
                  <option value="admin">{t("Администратор")}</option>
                  <option value="member">{t("Участник")}</option>
                </select>
              ) : <span className="text-sm text-muted">{ROLE_LABEL[m.role]}</span>}
              {isAdmin && m.id !== me.user.id && (
                <button className="icon-btn h-9 w-9" aria-label={t("Удалить {0}", m.name)} onClick={() => window.confirm(t("Удалить {0} из пространства? Его незавершённые задачи останутся без исполнителя.", m.name)) && run(() => api.del(`/workspaces/${wid}/members/${m.id}`), t("Участник удалён"))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("Метки")} text={t("Метки общие для всего пространства. Новые создаются прямо в задаче.")}>
        {ws.tags.length === 0 ? <p className="text-sm text-muted">{t("Меток пока нет.")}</p> : (
          <ul className="flex flex-wrap gap-2">
            {ws.tags.map((tag) => (
              <li key={tag.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                <ColorDot color={tag.color} />{tag.name}
                {isAdmin && <button className="opacity-60 hover:opacity-100" aria-label={t("Удалить метку {0}", tag.name)} onClick={() => window.confirm(t("Удалить метку «{0}» из всех задач?", tag.name)) && run(() => api.del(`/tags/${tag.id}`))}><Trash2 className="h-3.5 w-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("Выход из пространства")}>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => window.confirm(t("Покинуть пространство?")) && run(async () => {
            await api.del(`/workspaces/${wid}/members/${me.user.id}`);
            navigate('/');
          }, t("Вы покинули пространство"))}><LogOut className="h-4 w-4" />{t("Покинуть")}</button>
          {ws.role === 'owner' && (
            <button className="btn-danger" onClick={() => window.prompt(t("Удалить пространство со всеми проектами и задачами? Введите его название: {0}", ws.name)) === ws.name && run(async () => {
              await api.del(`/workspaces/${wid}`);
              navigate('/');
            }, t("Пространство удалено"))}><Trash2 className="h-4 w-4" />{t("Удалить пространство")}</button>
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
        <h1 className="text-xl font-semibold flex-1">{t("Настройки")}</h1>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'workspace', label: t("Пространство") }, { value: 'profile', label: t("Мой профиль") }]} />
      </header>
      <div className="mx-auto max-w-3xl px-3 sm:px-6 py-6">{tab === 'workspace' ? <WorkspaceSettings /> : <Profile />}</div>
    </div>
  );
}
