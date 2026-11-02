import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ComingSoon from './pages/ComingSoon';
import DocumentView from './pages/DocumentView';
import Publish from './pages/Publish';
import QuestionForm from './pages/QuestionForm';
import Setup from './pages/Setup';
import Suite from './pages/Suite';
import Home from './pages/Home';
import ProcedureLibrary from './pages/ProcedureLibrary';
import ReviewQueue from './pages/ReviewQueue';

const TITLES: Record<string, string> = {
  '/': 'Biomedix Engineering — AI agents run your quality system',
  '/app/review': 'Review queue · Biomedix Engineering',
  '/app/procedures': 'Procedure library · Biomedix Engineering',
  '/app/suite': 'Documentation suite · Biomedix Engineering',
  '/app/form': 'QMS questionnaire · Biomedix Engineering',
  '/app/publish': 'Publish to SharePoint · Biomedix Engineering',
};

function useRouteChrome() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title =
      TITLES[pathname] ?? (pathname.startsWith('/app/setup') ? 'Setup · Biomedix Engineering' : 'Biomedix Engineering');
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);
}

export default function App() {
  useRouteChrome();
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/app" element={<Navigate to="/app/review" replace />} />
      <Route path="/app/review" element={<ReviewQueue />} />
      <Route path="/app/procedures" element={<ProcedureLibrary />} />
      <Route path="/app/setup" element={<Navigate to="/app/setup/company" replace />} />
      <Route path="/app/setup/:step" element={<Setup />} />
      <Route path="/app/form" element={<QuestionForm />} />
      <Route path="/app/publish" element={<Publish />} />
      <Route path="/app/suite" element={<Suite />} />
      <Route path="/app/suite/:docId" element={<DocumentView />} />
      <Route path="/app/agents" element={<ComingSoon title="Agents" />} />
      <Route path="/app/trace" element={<ComingSoon title="Trace graph" />} />
      <Route path="/app/gates" element={<ComingSoon title="Gates" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
