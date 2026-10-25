import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { dateLocale as ru } from '../i18n/index.js';
import { api } from '../lib/api.js';
import { PageLoader } from '../components/ui.jsx';
import { PRIORITY } from '../lib/format.js';
import { t } from '../i18n/index.js';

const S1 = 'rgb(var(--series-1))';
const S2 = 'rgb(var(--series-2))';

function Tile({ label, value, tone = '' }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map(([label, color]) => <span key={label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>)}
    </div>
  );
}

// Горизонтальные столбцы: 1 серия или 2 серии с наложением в одну полосу (stacked)
function Bars({ rows, series }) {
  const max = Math.max(1, ...rows.map((r) => series.reduce((s, [key]) => s + r[key], 0)));
  const [hover, setHover] = useState(null);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(80px,140px)_1fr_auto] items-center gap-3 text-sm"
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <span className="truncate text-muted" title={r.label}>{r.label}</span>
          <span className="relative flex h-5 gap-[2px]">
            {series.map(([key, , color]) => r[key] > 0 && (
              <span key={key} className="h-full first:rounded-l-[4px] last:rounded-r-[4px] transition-opacity"
                style={{ width: `${(r[key] / max) * 100}%`, background: color, opacity: hover === null || hover === i ? 1 : 0.45 }} />
            ))}
            {hover === i && (
              <span className="absolute left-0 -top-9 z-10 rounded-md bg-ink px-2 py-1 text-xs text-bg whitespace-nowrap shadow-pop">
                {series.map(([key, label]) => `${label}: ${r[key]}`).join(' · ')}
              </span>
            )}
          </span>
          <span className="tabular-nums text-ink w-8 text-right">{series.reduce((s, [key]) => s + r[key], 0)}</span>
        </li>
      ))}
    </ul>
  );
}

// Линии «создано / выполнено» за 4 недели
function Trend({ data }) {
  // Ширину берём из контейнера, чтобы подписи не масштабировались вместе с графиком
  const box = useRef(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = 200; const P = { l: 28, r: 12, t: 10, b: 24 };
  const max = Math.max(2, ...data.map((d) => Math.max(d.done, d.created)));
  const x = (i) => P.l + (i * (W - P.l - P.r)) / (data.length - 1);
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
  const path = (key) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  const [hover, setHover] = useState(null);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label={t("Создано и выполнено задач по дням за 4 недели")}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (data.length - 1)))));
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth="1" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))">{t}</text>
          </g>
        ))}
        {[0, 7, 14, 21, 27].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 27 ? 'end' : 'middle'} fontSize="11" fill="rgb(var(--muted))">{format(parseISO(data[i].day), 'd MMM', { locale: ru })}</text>
        ))}
        <path d={path('created')} fill="none" stroke={S1} strokeWidth="2" strokeLinejoin="round" />
        <path d={path('done')} fill="none" stroke={S2} strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="rgb(var(--muted))" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(data[hover].created)} r="4" fill={S1} stroke="rgb(var(--surface))" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(data[hover].done)} r="4" fill={S2} stroke="rgb(var(--surface))" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-md bg-ink px-2 py-1 text-xs text-bg shadow-pop whitespace-nowrap"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > data.length / 2 ? '-105%' : '5%'})` }}>
          {t("{0}: создано {1}, выполнено {2}", format(parseISO(data[hover].day), 'd MMMM', { locale: ru }), data[hover].created, data[hover].done)}
        </div>
      )}
    </div>
  );
}

export default function DashboardView({ project }) {
  const { data, isLoading } = useQuery({ queryKey: ['stats', project.id], queryFn: () => api.get(`/projects/${project.id}/stats`) });
  const [table, setTable] = useState(false);
  if (isLoading || !data) return <PageLoader />;
  const { totals } = data;
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile label={t("Всего задач")} value={totals.total} />
        <Tile label={t("Выполнено")} value={`${pct}%`} />
        <Tile label={t("В работе")} value={totals.open} />
        <Tile label={t("Просрочено")} value={totals.overdue} tone={totals.overdue ? 'text-danger' : ''} />
        <Tile label={t("Без исполнителя")} value={totals.unassigned} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="font-semibold">{t("Задачи по разделам")}</h3>
            <Legend items={[[t("Открытые"), S1], [t("Выполненные"), S2]]} />
          </div>
          <Bars rows={data.bySection.map((s) => ({ label: s.name, open: s.open, done: s.done }))} series={[['open', t("Открытые"), S1], ['done', t("Выполненные"), S2]]} />
        </section>
        <section className="card p-4 sm:p-5">
          <h3 className="font-semibold mb-4">{t("Открытые задачи по исполнителям")}</h3>
          {data.byAssignee.length ? (
            <Bars rows={data.byAssignee.map((a) => ({ label: a.name || t("Без исполнителя"), open: a.open }))} series={[['open', t("Открытые"), S1]]} />
          ) : <p className="text-sm text-muted">{t("Открытых задач нет.")}</p>}
        </section>
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="font-semibold">{t("Создано и выполнено за 4 недели")}</h3>
            <div className="flex items-center gap-4">
              <Legend items={[[t("Создано"), S1], [t("Выполнено"), S2]]} />
              <button className="text-xs text-primary hover:underline" onClick={() => setTable(!table)}>{table ? t("График") : t("Таблица")}</button>
            </div>
          </div>
          {table ? (
            <div className="max-h-72 overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="text-muted text-left"><tr><th className="py-1 font-medium">{t("День")}</th><th className="font-medium">{t("Создано")}</th><th className="font-medium">{t("Выполнено")}</th></tr></thead>
                <tbody>{data.completion.map((d) => <tr key={d.day} className="border-t border-line"><td className="py-1">{format(parseISO(d.day), 'd MMMM', { locale: ru })}</td><td className="tabular-nums">{d.created}</td><td className="tabular-nums">{d.done}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <Trend data={data.completion} />}
        </section>
        <section className="card p-4 sm:p-5">
          <h3 className="font-semibold mb-4">{t("Открытые задачи по приоритету")}</h3>
          <Bars rows={['high', 'medium', 'low', 'none'].map((p) => ({ label: PRIORITY[p].label, open: data.byPriority.find((x) => x.priority === p)?.open || 0 }))} series={[['open', t("Открытые"), S1]]} />
        </section>
      </div>
    </div>
  );
}
