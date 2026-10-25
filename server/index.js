import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { migrate } from './db.js';
import { requireAuth } from './auth.js';
import { initRealtime } from './realtime.js';
import authRoutes from './routes/auth.js';
import { publicInvites, workspaces } from './routes/workspaces.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
    },
  },
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', publicInvites);
app.use('/api', requireAuth, workspaces, projectRoutes, taskRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));

// Собранный фронтенд
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Ошибка сервера. Попробуйте ещё раз.' : err.message });
});

const port = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
initRealtime(server);

migrate()
  .then(() => server.listen(port, () => console.log(`Поток запущен: http://localhost:${port}`)))
  .catch((err) => {
    console.error('Не удалось подготовить базу данных:', err);
    process.exit(1);
  });
