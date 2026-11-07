import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAccount } from './account/AccountContext';
import { AppShell } from './components/AppShell';
import { ButtonLink } from './components/Button';
import { useIntake } from './intake/IntakeContext';
import { AcceptInvite, VerifyEmail } from './pages/auth/EmailLinks';
import { ForgotPassword, ResetPassword } from './pages/auth/PasswordReset';
import SignIn from './pages/auth/SignIn';
import SignUp from './pages/auth/SignUp';
import ComingSoon from './pages/ComingSoon';
import Dashboard, { Welcome } from './pages/Dashboard';
import DevMail from './pages/DevMail';
import DocHistory from './pages/DocHistory';
import DocumentView from './pages/DocumentView';
import History from './pages/History';
import Home from './pages/Home';
import ProcedureLibrary from './pages/ProcedureLibrary';
import Publish from './pages/Publish';
import QuestionForm from './pages/QuestionForm';
import Readiness from './pages/Readiness';
import ReviewQueue from './pages/ReviewQueue';
import Setup from './pages/Setup';
import { Activity, CompanySettings, Members } from './pages/settings/Company';
import { Profile, Security, Sessions } from './pages/settings/Personal';
import { StaffAdmin, StaffReviews } from './pages/staff/Staff';
import Suite from './pages/Suite';

const TITLES: Record<string, string> = {
  '/': 'Biomedix Engineering — AI agents run your quality system',
  '/sign-in': 'Sign in · Biomedix Engineering',
  '/sign-up': 'Create an account · Biomedix Engineering',
  '/forgot-password': 'Reset your password · Biomedix Engineering',
  '/reset-password': 'Choose a new password · Biomedix Engineering',
  '/verify-email': 'Confirm your email · Biomedix Engineering',
  '/confirm-email': 'Confirm your new email · Biomedix Engineering',
  '/app/dashboard': 'Dashboard · Biomedix Engineering',
  '/app/welcome': 'Welcome · Biomedix Engineering',
  '/app/settings/profile': 'Profile · Settings · Biomedix Engineering',
  '/app/settings/security': 'Password and two-factor · Settings · Biomedix Engineering',
  '/app/settings/sessions': 'Signed-in devices · Settings · Biomedix Engineering',
  '/app/settings/company': 'Company · Settings · Biomedix Engineering',
  '/app/settings/members': 'Members and roles · Settings · Biomedix Engineering',
  '/app/settings/activity': 'Activity log · Settings · Biomedix Engineering',
  '/staff/reviews': 'Technical reviews · Biomedix staff',
  '/staff/admin': 'Companies and people · Biomedix staff',
  '/dev/mail': 'Dev mailbox · Biomedix Engineering',
  '/app/review': 'Review queue · Biomedix Engineering',
  '/app/procedures': 'Procedure library · Biomedix Engineering',
  '/app/suite': 'Documentation suite · Biomedix Engineering',
  '/app/form': 'QMS questionnaire · Biomedix Engineering',
  '/app/publish': 'Publish to SharePoint · Biomedix Engineering',
  '/app/readiness': 'Compliance readiness · Biomedix Engineering',
  '/app/history': 'Run history · Biomedix Engineering',
};

function useRouteChrome() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title =
      TITLES[pathname] ??
      (pathname.startsWith('/app/setup')
        ? 'Setup · Biomedix Engineering'
        : pathname.startsWith('/invite/')
          ? 'Invitation · Biomedix Engineering'
          : pathname.endsWith('/history')
            ? 'Revision history · Biomedix Engineering'
            : 'Biomedix Engineering');
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);
}

/** Shown in place of company screens when the company requires two-factor and this account doesn't have it. */
function MfaRequired() {
  const { org } = useAccount();
  return (
    <AppShell>
      <main className="app-main account-main account-main--narrow">
        <span className="eyebrow">SECURITY POLICY</span>
        <h1 className="setup-main__title">{org?.name} requires two-factor authentication.</h1>
        <p className="setup-main__blurb">
          Turn it on for your account to open the company’s projects. It takes a minute with an authenticator app on your phone.
        </p>
        <div className="button-row">
          <ButtonLink to="/app/settings/security">Set up two-factor</ButtonLink>
          <ButtonLink to="/app/settings/company" variant="outline">
            Switch or leave company
          </ButtonLink>
        </div>
      </main>
    </AppShell>
  );
}

/**
 * App screens wait for the account's project to load, so nothing renders (or saves) empty answers.
 * account: signed-in only. open: still shown when the company's two-factor policy blocks its projects.
 */
function AppRoute({ children, account = false, open = false }: { children: ReactNode; account?: boolean; open?: boolean }) {
  const { status, mfaBlocked } = useAccount();
  const { ready } = useIntake();
  const { pathname, search, hash } = useLocation();
  if (account && status !== 'loading' && status !== 'signed-in')
    return <Navigate to={`/sign-in?next=${encodeURIComponent(pathname + search + hash)}`} replace />;
  if (status === 'signed-in' && mfaBlocked && !open) return <MfaRequired />;
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

function AppIndex() {
  const { status } = useAccount();
  if (status === 'loading') return null;
  return <Navigate to={status === 'signed-in' ? '/app/dashboard' : '/app/review'} replace />;
}

export default function App() {
  useRouteChrome();
  const app = (el: ReactNode, account = false) => <AppRoute account={account}>{el}</AppRoute>;
  const settings = (el: ReactNode) => (
    <AppRoute account open>
      {el}
    </AppRoute>
  );
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/confirm-email" element={<VerifyEmail change />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/app" element={<AppIndex />} />
      <Route path="/app/dashboard" element={app(<Dashboard />, true)} />
      <Route path="/app/welcome" element={settings(<Welcome />)} />
      <Route path="/app/settings" element={<Navigate to="/app/settings/profile" replace />} />
      <Route path="/app/settings/profile" element={settings(<Profile />)} />
      <Route path="/app/settings/security" element={settings(<Security />)} />
      <Route path="/app/settings/sessions" element={settings(<Sessions />)} />
      <Route path="/app/settings/company" element={settings(<CompanySettings />)} />
      <Route path="/app/settings/members" element={app(<Members />, true)} />
      <Route path="/app/settings/activity" element={app(<Activity />, true)} />
      <Route path="/staff/reviews" element={settings(<StaffReviews />)} />
      <Route path="/staff/admin" element={settings(<StaffAdmin />)} />
      <Route path="/dev/mail" element={<AppRoute open>{<DevMail />}</AppRoute>} />
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
      <Route path="/app/projects" element={<Navigate to="/app/dashboard#projects" replace />} />
      <Route path="/app/account" element={<Navigate to="/app/settings/profile" replace />} />
      <Route path="/app/agents" element={app(<ComingSoon title="Agents" />)} />
      <Route path="/app/trace" element={app(<ComingSoon title="Trace graph" />)} />
      <Route path="/app/gates" element={app(<ComingSoon title="Gates" />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
