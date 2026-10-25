import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { api } from './lib/api.js';
import { useMe } from './lib/hooks.js';
import { useRealtime } from './lib/realtime.js';
import { useToast } from './lib/toast.jsx';
import { PageLoader, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import AuthPage, { Logo } from './pages/AuthPage.jsx';
import HomePage from './pages/HomePage.jsx';
import MyTasksPage from './pages/MyTasksPage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import FormPage from './pages/FormPage.jsx';

function Home() {
  const { openNewProject } = useOutletContext();
  return <HomePage onNewProject={openNewProject} />;
}

function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, error, isLoading } = useQuery({ queryKey: ['invite', token], queryFn: () => api.get(`/invites/${token}`), retry: false });
  const accept = async () => {
    try {
      const { workspaceId } = await api.post(`/invites/${token}/accept`);
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(`/w/${workspaceId}`, { replace: true });
    } catch (e) { toast(e.message, { type: 'error' }); }
  };
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6 text-center">
        <Logo className="justify-center" />
        {isLoading ? <div className="mt-6 flex justify-center"><Spinner /></div> : error ? (
          <p className="mt-6 text-sm text-danger">{error.message}</p>
        ) : (
          <>
            <div className="mx-auto mt-6 w-fit rounded-2xl bg-primary-soft p-3"><Users className="h-6 w-6 text-primary" /></div>
            <p className="mt-3 text-sm text-muted">{data.inviter ? `${data.inviter} приглашает вас в пространство` : 'Вас приглашают в пространство'}</p>
            <p className="mt-1 text-lg font-semibold">«{data.workspace_name}»</p>
            <button className="btn-primary mt-5 w-full h-11" onClick={accept}>Присоединиться</button>
          </>
        )}
        <button className="btn-ghost mt-2 w-full" onClick={() => navigate('/')}>Не сейчас</button>
      </div>
    </div>
  );
}

function RootRedirect() {
  const { data } = useMe();
  const first = data?.workspaces?.[0];
  return first ? <Navigate to={`/w/${first.id}`} replace /> : <Navigate to="/login" replace />;
}

function WorkspaceGuard() {
  const { wid } = useParams();
  const { data } = useMe();
  if (!data.workspaces.some((w) => w.id === Number(wid))) return <RootRedirect />;
  return <Layout />;
}

export default function App() {
  const { data, isLoading } = useMe();
  const qc = useQueryClient();
  const authed = !!data?.user;
  useRealtime(authed);

  useEffect(() => {
    const onUnauthorized = () => qc.setQueryData(['me'], null);
    window.addEventListener('potok:unauthorized', onUnauthorized);
    return () => window.removeEventListener('potok:unauthorized', onUnauthorized);
  }, [qc]);

  if (window.location.pathname.startsWith('/form/')) return <Routes><Route path="/form/:token" element={<FormPage />} /></Routes>;
  if (isLoading) return <PageLoader />;

  if (!authed) {
    return (
      <Routes>
        <Route path="/form/:token" element={<FormPage />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/invite/:token" element={<AuthPage mode="invite" />} />
        <Route path="*" element={<AuthPage mode="login" />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/form/:token" element={<FormPage />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/w/:wid" element={<WorkspaceGuard />}>
        <Route index element={<Home />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="projects/:pid" element={<ProjectPage />} />
        <Route path="projects/:pid/:view" element={<ProjectPage />} />
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
