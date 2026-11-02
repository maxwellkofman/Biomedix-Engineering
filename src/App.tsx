import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ComingSoon from './pages/ComingSoon';
import Home from './pages/Home';
import ProcedureLibrary from './pages/ProcedureLibrary';
import ReviewQueue from './pages/ReviewQueue';

const TITLES: Record<string, string> = {
  '/': 'Biomedix Engineering — AI agents run your quality system',
  '/app/review': 'Review queue · Biomedix Engineering',
  '/app/procedures': 'Procedure library · Biomedix Engineering',
};

function useRouteChrome() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ?? 'Biomedix Engineering';
    if (!hash) window.scrollTo(0, 0);
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
      <Route path="/app/agents" element={<ComingSoon title="Agents" />} />
      <Route path="/app/trace" element={<ComingSoon title="Trace graph" />} />
      <Route path="/app/gates" element={<ComingSoon title="Gates" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
