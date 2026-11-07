/**
 * Admin tasks from the command line (run where the database lives):
 *   npm run staff -- list
 *   npm run staff -- grant someone@biomedix.example reviewer|admin
 *   npm run staff -- revoke someone@biomedix.example
 */
import { getDb } from './db.ts';

const [cmd, email, role] = process.argv.slice(2);
const db = getDb();

if (cmd === 'list') {
  const rows = db.prepare(`SELECT name, email, staff_role FROM users WHERE staff_role != '' ORDER BY staff_role, email`).all();
  if (!rows.length) console.log('No Biomedix staff yet.');
  for (const r of rows as { name: string; email: string; staff_role: string }[]) console.log(`${r.staff_role.padEnd(9)} ${r.email}  (${r.name})`);
} else if ((cmd === 'grant' && (role === 'reviewer' || role === 'admin')) || cmd === 'revoke') {
  const next = cmd === 'revoke' ? '' : role;
  const r = db.prepare('UPDATE users SET staff_role = ? WHERE email = ?').run(next, email ?? '');
  if (!Number(r.changes)) {
    console.error(`No account with the email ${email}. They need to sign up first.`);
    process.exit(1);
  }
  console.log(next ? `${email} is now a Biomedix ${next}.` : `${email} is no longer Biomedix staff.`);
} else {
  console.log('Usage: npm run staff -- list | grant <email> reviewer|admin | revoke <email>');
  process.exit(cmd ? 1 : 0);
}
