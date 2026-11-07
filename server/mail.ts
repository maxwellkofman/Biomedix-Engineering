/**
 * Outgoing email. Every message is logged in the outbox table. Delivery:
 *   - BIOMEDIX_MAIL_WEBHOOK set: POSTs {to, subject, text, html} as JSON (with
 *     BIOMEDIX_MAIL_WEBHOOK_TOKEN as a bearer token if set). Point it at your
 *     email provider's API or a Power Automate / Zapier flow.
 *   - Dev mode: the full message is kept in the outbox and shown at /dev/mail.
 * In production the outbox keeps only who, what and when: links in the message
 * are credentials and are never stored.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from './db.ts';

export type Template = 'verify' | 'reset' | 'invite' | 'email-change' | 'password-changed' | 'email-changed' | 'mfa-changed';

interface Message {
  subject: string;
  lines: string[];
  action?: { label: string; url: string };
}

function compose(t: Template, v: Record<string, string>): Message {
  switch (t) {
    case 'verify':
      return {
        subject: 'Confirm your email for Biomedix',
        lines: [`Hi ${v.name},`, 'Confirm this is your email address to finish setting up your Biomedix account. The link works for 24 hours.'],
        action: { label: 'Confirm email', url: v.url },
      };
    case 'reset':
      return {
        subject: 'Reset your Biomedix password',
        lines: [
          `Hi ${v.name},`,
          'Someone asked to reset the password for your Biomedix account. The link works for one hour and only once.',
          'If it wasn’t you, ignore this email: your password stays the same.',
        ],
        action: { label: 'Choose a new password', url: v.url },
      };
    case 'invite':
      return {
        subject: `${v.inviter} invited you to ${v.org} on Biomedix`,
        lines: [
          `${v.inviter} invited you to join ${v.org} on Biomedix as ${v.role}.`,
          'Biomedix keeps your quality system documentation, runs and sign-offs in one place. The invitation works for 7 days.',
        ],
        action: { label: 'Accept invitation', url: v.url },
      };
    case 'email-change':
      return {
        subject: 'Confirm your new email for Biomedix',
        lines: [`Hi ${v.name},`, `Confirm ${v.email} as the new sign-in email for your Biomedix account. The link works for 24 hours.`],
        action: { label: 'Confirm new email', url: v.url },
      };
    case 'email-changed':
      return {
        subject: 'Your Biomedix sign-in email changed',
        lines: [`Hi ${v.name},`, `Your Biomedix account now signs in with ${v.email}.`, 'If you didn’t make this change, contact Biomedix support straight away.'],
      };
    case 'password-changed':
      return {
        subject: 'Your Biomedix password changed',
        lines: [`Hi ${v.name},`, 'The password for your Biomedix account was just changed and other devices were signed out.', 'If you didn’t do this, reset your password now.'],
        action: { label: 'Reset password', url: v.url },
      };
    case 'mfa-changed':
      return {
        subject: `Two-factor authentication ${v.state} on your Biomedix account`,
        lines: [`Hi ${v.name},`, `Two-factor authentication was ${v.state} for your Biomedix account.`, 'If you didn’t do this, reset your password and contact Biomedix support.'],
      };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function render(m: Message) {
  const text = [...m.lines, ...(m.action ? [`${m.action.label}: ${m.action.url}`] : []), '— Biomedix Engineering'].join('\n\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111a17;max-width:520px">
${m.lines.map((l) => `<p>${esc(l)}</p>`).join('\n')}
${m.action ? `<p><a href="${esc(m.action.url)}" style="display:inline-block;background:#0d6b5a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(m.action.label)}</a></p><p style="font-size:13px;color:#4a5651">Or paste this link into your browser: ${esc(m.action.url)}</p>` : ''}
<p style="font-size:13px;color:#4a5651">— Biomedix Engineering</p></div>`;
  return { text, html };
}

export function mailConfigured() {
  return !!process.env.BIOMEDIX_MAIL_WEBHOOK;
}

/** Queues and sends a message. Never throws: a failed delivery is recorded and the request carries on. */
export function sendMail(to: string, template: Template, vars: Record<string, string>, { dev }: { dev: boolean }) {
  const msg = compose(template, vars);
  const { text, html } = render(msg);
  const id = randomUUID();
  getDb()
    .prepare('INSERT INTO outbox (id, to_email, subject, template, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, to, msg.subject, template, dev ? text : null, new Date().toISOString());

  const hook = process.env.BIOMEDIX_MAIL_WEBHOOK;
  if (!hook) {
    if (dev) console.log(`[mail] ${to} · ${msg.subject}${msg.action ? ` · ${msg.action.url}` : ''}`);
    else console.warn(`[mail] Not delivered (set BIOMEDIX_MAIL_WEBHOOK): ${template} to ${to}`);
    return;
  }
  const token = process.env.BIOMEDIX_MAIL_WEBHOOK_TOKEN;
  void fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ to, subject: msg.subject, text, html }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      getDb().prepare('UPDATE outbox SET sent_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    })
    .catch((err: Error) => {
      console.error('[mail]', err.message);
      getDb().prepare('UPDATE outbox SET error = ? WHERE id = ?').run(err.message.slice(0, 300), id);
    });
}
