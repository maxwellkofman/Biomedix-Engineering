import { AppShell } from '../components/AppShell';
import '../styles/app.css';

/** Stand-in for app sections the design names in the nav but does not draw yet. */
export default function ComingSoon({ title }: { title: string }) {
  return (
    <AppShell project="[Company] · ECG patch SaMD" user={{ initials: 'BE', label: 'Signed in as a Biomedix reviewer' }}>
      <main className="app-placeholder">
        <h1>{title}</h1>
        <p>This view is not designed yet.</p>
      </main>
    </AppShell>
  );
}
