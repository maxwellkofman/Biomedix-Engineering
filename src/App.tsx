import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAccount } from './account/AccountContext';
import { AppShell } from './components/AppShell';
import { useIntake } from './intake/IntakeContext';
import Account from './pages/Account';
import AuthPage from './pages/AuthPage';
import ComingSoon from './pages/ComingSoon';
import DocHistory from './pages/DocHistory';
import DocumentView from './pages/DocumentView';
import History from './pages/History';
import Home from './pages/Home';
import ProcedureLibrary from './pages/ProcedureLibrary';
import Projects from './pages/Projects';
import Publish from './pages/Publish';
import QuestionForm from './pages/QuestionForm';
import Readiness from './pages/Readiness';
import ReviewQueue from './pages/ReviewQueue';
import Setup from './pages/Setup';
import Suite from './pages/Suite';

const TITLES: Record<string, string> = {
  '/': 'Biomedix Engineering — AI agents run your quality system',
  '/sign-in': 'Sign in · Biomedix Engineering',
  '/sign-up': 'Create an account · Biomedix Engineering',
  '/app/review': 'Review queue · Biomedix Engineering',
  '/app/procedures': 'Procedure library · Biomedix Engineering',
  '/app/suite': 'Documentation suite · Biomedix Engineering',
  '/app/form': 'QMS questionnaire · Biomedix Engineering',
  '/app/publish': 'Publish to SharePoint · Biomedix Engineering',
  '/app/readiness': 'Compliance readiness · Biomedix Engineering',
  '/app/projects': 'Projects · Biomedix Engineering',
  '/app/history': 'Run history · Biomedix Engineering',
  '/app/account': 'Account · Biomedix Engineering',
};

function useRouteChrome() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title =
      TITLES[pathname] ??
      (pathname.startsWith('/app/setup')
        ? 'Setup · Biomedix Engineering'
        : pathname.endsWith('/history')
          ? 'Revision history · Biomedix Engineering'
          : 'Biomedix Engineering');
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);
}

/** App screens wait for the account's project to load, so nothing renders (or saves) empty answers. */
function AppRoute({ children, account = false }: { children: ReactNode; account?: boolean }) {
  const { status } = useAccount();
  const { ready } = useIntake();
  const { pathname, search } = useLocation();
  if (account && status !== 'loading' && status !== 'signed-in')
    return <Navigate to={`/sign-in?next=${encodeURIComponent(pathname + search)}`} replace />;
  if (!ready)
    return (
      <AppShell>
        <main className="app-main app-loading" aria-busy="true">
          <span className="app-loading__dot" aria-hidden="true" />
          Loading your project…
        </main>
      </AppShell>
    );
  return <>{children}</>;
}

export default function App() {
  useRouteChrome();
  const app = (el: ReactNode, account = false) => <AppRoute account={account}>{el}</AppRoute>;
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
      <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
      <Route path="/app" element={<Navigate to="/app/review" replace />} />
      <Route path="/app/review" element={app(<ReviewQueue />)} />
      <Route path="/app/procedures" element={app(<ProcedureLibrary />)} />
      <Route path="/app/setup" element={<Navigate to="/app/setup/company" replace />} />
      <Route path="/app/setup/:step" element={app(<Setup />)} />
      <Route path="/app/form" element={app(<QuestionForm />)} />
      <Route path="/app/publish" element={app(<Publish />)} />
      <Route path="/app/suite" element={app(<Suite />)} />
      <Route path="/app/suite/:docId" element={app(<DocumentView />)} />
      <Route path="/app/suite/:docId/history" element={app(<DocHistory />, true)} />
      <Route path="/app/readiness" element={app(<Readiness />)} />
      <Route path="/app/history" element={app(<History />, true)} />
      <Route path="/app/projects" element={app(<Projects />, true)} />
      <Route path="/app/account" element={app(<Account />, true)} />
      <Route path="/app/agents" element={app(<ComingSoon title="Agents" />)} />
      <Route path="/app/trace" element={app(<ComingSoon title="Trace graph" />)} />
      <Route path="/app/gates" element={app(<ComingSoon title="Gates" />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
