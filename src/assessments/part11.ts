/**
 * 21 CFR Part 11 assessment: which computerized systems are in scope, and
 * whether each meets the controls for electronic records (Subpart B) and
 * electronic signatures (Subpart C).
 *
 * Scope follows FDA's guidance "Part 11, Electronic Records; Electronic
 * Signatures — Scope and Application" (2003): Part 11 applies to records
 * that predicate rules require and that are relied on in electronic form,
 * and to electronic signatures that stand in for handwritten ones. FDA
 * applies enforcement discretion to validation, audit trails, copies and
 * retention (11.10(a), (b), (c), (e), (k)(2)) when they are applied on a
 * documented risk basis. The predicate rules still apply: ISO 13485 4.1.6
 * (software validation) and 4.2.5 (control of records) under the QMSR.
 */
import type { Intake } from '../intake/model';
import { EMPTY_P11_ANSWER, uid, type P11Answer, type P11Impact, type P11Result, type P11System, type Part11Answers } from './model';

export type ControlGroup = 'records' | 'open' | 'signatures' | 'company';

export interface P11Control {
  id: string;
  title: string;
  requirement: string;
  hint: string;
  group: ControlGroup;
  /** FDA enforcement discretion applies when the control is set by documented risk. */
  discretion?: boolean;
  /** Company-wide items that only apply when some system applies electronic signatures. */
  needsSignatures?: boolean;
}

export const CONTROLS: P11Control[] = [
  {
    id: '11.10(a)',
    title: 'Validation',
    group: 'records',
    discretion: true,
    requirement:
      'The system is validated for accuracy, reliability and consistent intended performance, and can show when a record is invalid or has been altered.',
    hint: 'Risk-based assurance of the features you rely on, recorded on FRM-017 under SOP-014. Vendor test evidence can count toward it.',
  },
  {
    id: '11.10(b)',
    title: 'Copies for inspection',
    group: 'records',
    discretion: true,
    requirement: 'Accurate and complete copies of records can be produced in human-readable and electronic form for FDA to inspect and copy.',
    hint: 'Export to PDF or the native format, with metadata such as revision, dates and signatures.',
  },
  {
    id: '11.10(c)',
    title: 'Record protection and retrieval',
    group: 'records',
    discretion: true,
    requirement: 'Records are protected so they can be accurately and readily retrieved for the whole retention period.',
    hint: 'Backups, retention settings that block early deletion, and formats that stay readable.',
  },
  {
    id: '11.10(d)',
    title: 'Limited system access',
    group: 'records',
    requirement: 'Only authorized individuals can access the system.',
    hint: 'Named accounts, access granted on request and removed when people leave or change roles.',
  },
  {
    id: '11.10(e)',
    title: 'Audit trail',
    group: 'records',
    discretion: true,
    requirement:
      'A secure, computer-generated, time-stamped audit trail records who created, changed or deleted a record and when. Changes don’t obscure earlier values, and the trail is kept as long as the record and available to FDA.',
    hint: 'Version history plus an activity log, retained for the record retention period.',
  },
  {
    id: '11.10(f)',
    title: 'Operational checks',
    group: 'records',
    requirement: 'The system enforces the permitted sequence of steps where order matters, such as review before approval.',
    hint: 'Workflow states the system enforces, rather than a procedure people follow.',
  },
  {
    id: '11.10(g)',
    title: 'Authority checks',
    group: 'records',
    requirement: 'Only authorized individuals can sign, change records, or perform the operation at hand.',
    hint: 'Roles and permissions that match who may edit, approve and administer.',
  },
  {
    id: '11.10(h)',
    title: 'Device checks',
    group: 'records',
    requirement: 'Where needed, the system checks that data or instructions come from a valid source, such as an approved terminal or instrument.',
    hint: 'Usually not applicable to browser tools. Applies when only certain instruments or terminals may enter data.',
  },
  {
    id: '11.10(k)(1)',
    title: 'System documentation: access and use',
    group: 'records',
    requirement: 'Distribution of, access to and use of the system’s operation and maintenance documentation are controlled.',
    hint: 'A configuration specification and admin guide under document control.',
  },
  {
    id: '11.10(k)(2)',
    title: 'System documentation: change control',
    group: 'records',
    discretion: true,
    requirement: 'Changes to system documentation go through revision and change control, with an audit trail of the changes.',
    hint: 'Configuration changes raised as change requests (FRM-001); vendor release notes reviewed.',
  },
  {
    id: '11.30',
    title: 'Open system controls',
    group: 'open',
    requirement:
      'Because access isn’t controlled by the people responsible for the records, extra measures such as encryption and digital signature standards protect their authenticity, integrity and confidentiality.',
    hint: 'Encryption in transit and at rest, and signatures that can be verified outside the system.',
  },
  {
    id: '11.50',
    title: 'Signature manifestation',
    group: 'signatures',
    requirement:
      'Signed records show the signer’s printed name, the date and time of signing, and its meaning (such as review, approval, responsibility or authorship), on screen and on printed copies.',
    hint: 'Check the printed or exported copy as well as the screen.',
  },
  {
    id: '11.70',
    title: 'Signature and record linking',
    group: 'signatures',
    requirement: 'Signatures are linked to their records so they can’t be removed, copied or transferred to falsify another record.',
    hint: 'A signature bound to one version of the record, for example by a hash or a sealed PDF.',
  },
  {
    id: '11.100(a)',
    title: 'Unique to one person',
    group: 'signatures',
    requirement: 'Each electronic signature belongs to one person and is never reused by, or reassigned to, anyone else.',
    hint: 'No shared accounts; accounts aren’t renamed for a new person.',
  },
  {
    id: '11.200(a)(1)',
    title: 'Two signing components',
    group: 'signatures',
    requirement:
      'Non-biometric signatures use at least two components, such as an ID and a password. The first signing in a session uses all of them; later signings in the same continuous session use at least the private one.',
    hint: 'Re-entering the password at each signing meets this.',
  },
  {
    id: '11.200(a)(2)',
    title: 'Used only by the owner',
    group: 'signatures',
    requirement:
      'Signatures can be used only by their owner, and anyone else trying to use one would need two or more people to collaborate. Admins can’t sign as a user.',
    hint: 'No impersonation or “sign on behalf of” feature; password resets go to the owner only.',
  },
  {
    id: '11.200(b)',
    title: 'Biometric signatures',
    group: 'signatures',
    requirement: 'Signatures based on biometrics can be used only by their genuine owners.',
    hint: 'Not applicable unless signatures use fingerprints, face or other biometrics.',
  },
  {
    id: '11.300(a)',
    title: 'Unique ID and password',
    group: 'signatures',
    requirement: 'No two people have the same combination of identification code and password.',
    hint: 'Unique user names or email addresses.',
  },
  {
    id: '11.300(b)',
    title: 'Periodic review of credentials',
    group: 'signatures',
    requirement: 'Identification codes and passwords are periodically checked, recalled or revised, for example when people change roles.',
    hint: 'NIST SP 800-63B advises against forced password expiry. A regular access review, with that rationale written down, is a common way to meet this.',
  },
  {
    id: '11.300(c)',
    title: 'Lost or compromised credentials',
    group: 'signatures',
    requirement: 'Lost, stolen or compromised passwords, tokens or cards are deauthorized, and replacements issued under suitable controls.',
    hint: 'Password reset, sign-out of all devices, and removal of access, written into a procedure.',
  },
  {
    id: '11.300(d)',
    title: 'Unauthorized use safeguards',
    group: 'signatures',
    requirement: 'Safeguards prevent unauthorized use of passwords and ID codes, and detect attempts and report them urgently to security or management.',
    hint: 'Lockout or throttling plus an alert or a log someone reviews.',
  },
  {
    id: '11.300(e)',
    title: 'Token and card testing',
    group: 'signatures',
    requirement: 'Devices that carry or generate ID codes or passwords, such as tokens or cards, are tested periodically.',
    hint: 'Not applicable if no hardware tokens or cards are used.',
  },
  {
    id: '11.10(i)',
    title: 'Training and qualification',
    group: 'company',
    requirement: 'People who develop, maintain or use the systems have the education, training and experience for their tasks.',
    hint: 'Training records under SOP-005, including each system’s procedures.',
  },
  {
    id: '11.10(j)',
    title: 'Accountability policy',
    group: 'company',
    needsSignatures: true,
    requirement: 'A written policy holds individuals accountable for actions taken under their electronic signatures, to deter falsification.',
    hint: 'Usually in SOP-001, acknowledged in writing by each person who signs.',
  },
  {
    id: '11.100(b)',
    title: 'Identity verified before issuing',
    group: 'company',
    needsSignatures: true,
    requirement: 'The company verifies a person’s identity before issuing or certifying their electronic signature.',
    hint: 'For example, a manager confirms who the person is before their account can approve.',
  },
  {
    id: '11.100(c)',
    title: 'Certification to FDA',
    group: 'company',
    needsSignatures: true,
    requirement:
      'Before relying on electronic signatures, the company certifies to FDA in a paper letter, signed by hand, that its electronic signatures are the legally binding equivalent of handwritten signatures.',
    hint: 'One letter covers every electronic signature the company uses. Send it as 11.100(c) describes, using FDA’s current address.',
  },
];

export const CONTROL_BY_ID = Object.fromEntries(CONTROLS.map((c) => [c.id, c])) as Record<string, P11Control>;

export const RESULT_LABEL: Record<Exclude<P11Result, ''>, string> = {
  met: 'Met',
  partial: 'Partly met',
  gap: 'Not met',
  na: 'Not applicable',
};

export const IMPACT_LABEL: Record<Exclude<P11Impact, ''>, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const IMPACT_HINT: Record<Exclude<P11Impact, ''>, string> = {
  high: 'Records that decide release, safety or effectiveness: verification results, approvals, complaints, CAPA',
  medium: 'Records that support the quality system: training, suppliers, meeting records',
  low: 'No direct effect on product quality, such as reference copies or scheduling',
};

/** What a risk-based approach expects for a control under enforcement discretion. */
export function discretionNote(impact: P11Impact): string {
  if (impact === 'high')
    return 'High-risk records: implement this fully. FDA’s enforcement discretion doesn’t remove the predicate rule (ISO 13485 4.1.6 and 4.2.5).';
  if (impact === 'medium') return 'Medium risk: apply in proportion. A partial control can be accepted with a documented rationale.';
  if (impact === 'low') return 'Low risk: a documented rationale can justify a lighter control.';
  return 'FDA applies enforcement discretion here when the control is set by documented risk. Rate the system’s risk first.';
}

/* ---------- Known system profiles ---------- */

type Draft = Partial<Pick<P11Answer, 'result' | 'evidence' | 'action'>> & { result: P11Result };

interface Preset {
  name: string;
  use: string;
  scope?: Pick<P11System, 'records' | 'relied' | 'signatures' | 'open' | 'impact'>;
  answers?: Record<string, Draft>;
  /** Why it was suggested, shown next to the suggestion. */
  from: string;
}

const NA_DEVICE: Draft = {
  result: 'na',
  evidence: 'Records are entered by named users through a web browser; no particular terminal or instrument has to be checked.',
};
const NA_BIOMETRIC: Draft = { result: 'na', evidence: 'Signatures don’t use biometrics.' };
const NA_TOKENS: Draft = { result: 'na', evidence: 'No hardware tokens or cards are used.' };

function filesPreset(kind: 'sharepoint' | 'google'): Preset {
  const sp = kind === 'sharepoint';
  return {
    name: sp ? 'Microsoft SharePoint (Microsoft 365)' : 'Google Drive (Google Workspace)',
    use: 'Released procedures, forms and quality records (document control)',
    from: 'your document control system',
    scope: { records: 'yes', relied: 'yes', signatures: 'no', open: 'no', impact: 'high' },
    answers: {
      '11.10(a)': {
        result: 'partial',
        evidence: `${sp ? 'Microsoft 365' : 'Google Workspace'} is off-the-shelf software. The configuration you rely on (versioning, permissions, retention and the audit log) hasn’t been tested and recorded yet.`,
        action: 'Test the configured features before go-live and record the results on FRM-017 under SOP-014.',
      },
      '11.10(b)': {
        result: 'met',
        evidence: 'Files download in their native format or as PDF, and version history shows each earlier version with who saved it and when.',
      },
      '11.10(c)': {
        result: 'partial',
        evidence: sp
          ? 'Version history and the recycle bin protect against accidental loss, but files can still be deleted, and old versions pruned, unless a retention policy applies.'
          : 'Version history and the trash protect against accidental loss, but files can still be deleted unless a retention rule applies.',
        action: sp
          ? 'Apply a Microsoft Purview retention policy or label to the QMS library for the record retention period.'
          : 'Set a Google Vault retention rule for the QMS shared drive covering the record retention period.',
      },
      '11.10(d)': {
        result: 'met',
        evidence: sp
          ? 'Access is through named Microsoft Entra ID accounts, and site permissions decide who can read or edit. External sharing is off for the QMS site.'
          : 'Access is through named Google accounts, and shared drive membership decides who can read or edit. External sharing is off for the QMS drive.',
      },
      '11.10(e)': {
        result: 'partial',
        evidence: sp
          ? 'Version history records who saved each version and when. The Microsoft Purview audit log records views, edits and deletions, but its default retention is shorter than most record retention periods.'
          : 'Version history records who changed a file and when. Drive audit events in the Admin console record views, edits and deletions, but only for a limited period.',
        action: 'Extend audit log retention, or export the log on a schedule, to cover the record retention period.',
      },
      '11.10(f)': {
        result: 'partial',
        evidence: sp
          ? 'SharePoint doesn’t enforce review before approval on its own.'
          : 'Drive’s approvals feature records who approved, but it doesn’t enforce your review sequence and isn’t a Part 11 signature.',
        action: sp
          ? 'Approve in your e-signature tool, or a Power Automate approval flow, so a document can’t reach Effective without review and approval.'
          : 'Approve in your e-signature tool, so a document can’t reach Effective without review and approval.',
      },
      '11.10(g)': {
        result: 'met',
        evidence: 'Only the document control group can edit released documents; everyone else has read access.',
      },
      '11.10(h)': NA_DEVICE,
      '11.10(k)(1)': {
        result: 'partial',
        evidence: `${sp ? 'Microsoft' : 'Google'} publishes the service documentation, but your own site configuration isn’t written down.`,
        action: 'Write a configuration specification for the QMS site and keep it under document control (SOP-001).',
      },
      '11.10(k)(2)': {
        result: 'partial',
        evidence: `${sp ? 'Microsoft' : 'Google'} changes the service on its own release schedule, and changes to your configuration aren’t change-controlled yet.`,
        action: sp
          ? 'Change the site configuration only through change requests (FRM-001), and review Microsoft 365 Message Center notices for changes to the features you rely on.'
          : 'Change the drive configuration only through change requests (FRM-001), and review Google Workspace release notes for changes to the features you rely on.',
      },
    },
  };
}

function signingPreset(kind: 'docusign' | 'adobe'): Preset {
  const ds = kind === 'docusign';
  const tool = ds ? 'DocuSign' : 'Acrobat Sign';
  const module = ds ? 'the Part 11 module' : 'its Part 11 settings';
  return {
    name: ds ? 'DocuSign eSignature (Part 11 module)' : 'Adobe Acrobat Sign',
    use: 'Approval signatures on released documents and records',
    from: 'your electronic signature method',
    scope: { records: 'yes', relied: 'yes', signatures: 'yes', open: 'no', impact: 'high' },
    answers: {
      '11.10(a)': {
        result: 'partial',
        evidence: `${ds ? 'DocuSign' : 'Adobe'} offers validation material for ${module}; your own configuration and signing workflow haven’t been tested yet.`,
        action: 'Test the signing workflow you rely on and record it on FRM-017, using the vendor’s material as supporting evidence.',
      },
      '11.10(b)': { result: 'met', evidence: 'Completed agreements download as PDF with their audit report or certificate of completion.' },
      '11.10(c)': {
        result: 'partial',
        evidence: `Completed agreements stay in the ${tool} account, but a purge policy or a closed account could remove them.`,
        action: 'File each completed agreement and its audit report in the QMS library, and check the account’s retention settings.',
      },
      '11.10(d)': { result: 'met', evidence: `Senders and signers use their own ${tool} accounts; account admins control membership.` },
      '11.10(e)': { result: 'met', evidence: 'Each agreement’s history and audit report record every event with a time stamp.' },
      '11.10(f)': { result: 'met', evidence: 'The routing order sets who signs and in what sequence.' },
      '11.10(g)': {
        result: 'met',
        evidence: 'Only an agreement’s recipients can sign it, and account roles limit who can send and manage templates.',
      },
      '11.10(h)': NA_DEVICE,
      '11.10(k)(1)': {
        result: 'partial',
        evidence: `${tool} documents the service, but your account settings (signing reasons, authentication, retention) aren’t written down.`,
        action: 'Record the account settings you rely on in a configuration specification under document control.',
      },
      '11.10(k)(2)': {
        result: 'partial',
        evidence: 'The vendor changes the service on its own schedule, and changes to your account settings aren’t change-controlled yet.',
        action: 'Change account settings only through change requests (FRM-001), and review vendor release notes.',
      },
      '11.50': {
        result: 'met',
        evidence: `With ${module} on, the signed document shows the signer’s printed name, the date and time, and the reason for signing. Signing reasons such as Reviewed and Approved are set up.`,
      },
      '11.70': {
        result: 'met',
        evidence: 'Completed documents are sealed with a tamper-evident digital certificate, so a signature can’t be lifted onto another document.',
      },
      '11.100(a)': { result: 'met', evidence: 'Signatures are tied to each person’s own account; accounts aren’t shared or reassigned.' },
      '11.200(a)(1)': { result: 'met', evidence: `With ${module} on, signers authenticate again at the moment of signing.` },
      '11.200(a)(2)': {
        result: 'partial',
        evidence: 'Admins can’t sign for a recipient, but senders can change recipients before signing, and recipients may be allowed to pass signing on.',
        action: 'Turn off the option that lets recipients pass signing to someone else, if it’s on.',
      },
      '11.200(b)': NA_BIOMETRIC,
      '11.300(a)': { result: 'met', evidence: 'Each person signs in with their own email address and password, or company single sign-on.' },
      '11.300(b)': {
        result: 'partial',
        evidence: 'Password rules come from the account settings or your single sign-on provider; signer access isn’t reviewed on a schedule.',
        action: 'Set password rules (or single sign-on) and review who can send and sign each quarter.',
      },
      '11.300(c)': {
        result: 'met',
        evidence: 'Users reset lost passwords themselves, and admins can close an account straight away.',
      },
      '11.300(d)': {
        result: 'partial',
        evidence: 'Failed sign-in handling and alerts depend on the account settings; it isn’t confirmed who is told about repeated failures.',
        action: 'Use single sign-on with alerts for repeated failed sign-ins, or confirm the vendor’s lockout and notification settings.',
      },
      '11.300(e)': NA_TOKENS,
    },
  };
}

const BIOMEDIX: Preset = {
  name: 'Biomedix platform',
  use: 'Document drafts, Biomedix technical reviews and your approvals',
  from: 'where these drafts and approvals are kept',
  scope: { records: 'yes', relied: 'yes', signatures: 'yes', open: 'no', impact: 'high' },
  answers: {
    '11.10(a)': {
      result: 'partial',
      evidence: 'The features you rely on (saved drafts, sign-offs and exports) haven’t been assessed under SOP-014 yet.',
      action: 'Record the features you rely on and how you checked them on FRM-017, with supplier evidence from Biomedix under your quality agreement.',
    },
    '11.10(b)': {
      result: 'met',
      evidence: 'Each draft exports to Word, Markdown and print or PDF, and the revision history shows every draft with its sign-offs and SHA-256.',
    },
    '11.10(c)': {
      result: 'partial',
      evidence: 'Saved drafts and sign-offs are append-only and can’t be edited. How long they are kept after a subscription ends depends on your agreement with Biomedix.',
      action: 'Publish approved documents to your QMS library, and agree retention and export terms with Biomedix.',
    },
    '11.10(d)': {
      result: 'met',
      evidence: 'Only invited members of your company can open its projects. Owners and admins grant and remove access and can require two-factor sign-in.',
    },
    '11.10(e)': {
      result: 'met',
      evidence: 'Every saved draft, submission, technical review and approval is stored with the person and the time, and earlier drafts are never overwritten. Answers edited between runs aren’t records; each saved run keeps a snapshot of them.',
    },
    '11.10(f)': {
      result: 'met',
      evidence: 'A draft can’t be approved before its technical review is signed, and a changed document needs a new saved draft before anyone can sign it.',
    },
    '11.10(g)': {
      result: 'met',
      evidence: 'Viewers are read-only, only members marked as approvers can approve, and only Biomedix reviewers can sign technical reviews. Nobody can review a draft they submitted.',
    },
    '11.10(h)': NA_DEVICE,
    '11.10(k)(1)': {
      result: 'partial',
      evidence: 'System documentation and release notes come from Biomedix and aren’t in your document control yet.',
      action: 'Get them under your quality agreement and keep them under document control.',
    },
    '11.10(k)(2)': {
      result: 'partial',
      evidence: 'Biomedix changes the platform; you aren’t yet notified of changes to the features you rely on.',
      action: 'Agree change notification with Biomedix in the quality agreement and review each notice.',
    },
    '11.50': {
      result: 'partial',
      evidence: 'Each sign-off shows the signer’s name and email, the date and time, and its meaning on screen with the draft. The Word export leaves the signature table blank, so printed copies don’t carry the electronic signatures.',
      action: 'Print signed copies from the revision history, or add the sign-off details to the released copy.',
    },
    '11.70': {
      result: 'met',
      evidence: 'Each sign-off is tied to one draft number and that draft’s SHA-256. A changed document needs a new draft and new signatures.',
    },
    '11.100(a)': {
      result: 'met',
      evidence: 'Each account belongs to one person’s email address, and sign-offs record that account’s name and email. Accounts aren’t renamed for someone else; leavers are removed and newcomers invited.',
    },
    '11.200(a)(1)': {
      result: 'met',
      evidence: 'The signer is signed in with their email and password and enters the password again at every approval, even within the same session.',
    },
    '11.200(a)(2)': {
      result: 'met',
      evidence: 'Nobody, including company owners and Biomedix staff, can sign as another user. Passwords are reset only through a link sent to the account’s own email.',
    },
    '11.200(b)': NA_BIOMETRIC,
    '11.300(a)': { result: 'met', evidence: 'Email addresses are unique across the platform, so no two people share an ID and password.' },
    '11.300(b)': {
      result: 'partial',
      evidence: 'Passwords don’t expire, in line with NIST SP 800-63B. Members and approvers aren’t reviewed on a schedule yet.',
      action: 'Review members and approvers each quarter in Members and roles, and record the rationale for not forcing expiry.',
    },
    '11.300(c)': {
      result: 'met',
      evidence: 'Users reset a lost password by email link, can sign out every device and regenerate two-factor recovery codes. Owners and admins can remove a member at once.',
    },
    '11.300(d)': {
      result: 'partial',
      evidence: 'Failed sign-ins and password re-entries are rate limited and logged, but nobody is alerted.',
      action: 'Require two-factor sign-in for the company (Company settings), so a stolen password alone can’t be used.',
    },
    '11.300(e)': {
      result: 'na',
      evidence: 'No hardware tokens or cards. Two-factor codes come from each person’s authenticator app.',
    },
  },
};

const EQMS_RE = /greenlight|qualio|mastercontrol|veeva|arena|ennov|zenqms|matrix req|jama|polarion/i;
const EQMS_USE = 'Quality records and document control (eQMS)';

const TOOL_USE: [RegExp, string][] = [
  [/jira|linear|azure devops|youtrack/i, 'Issue tracking: design inputs, anomalies, CAPA or complaints if they are logged here'],
  [/github actions|gitlab ci|circleci|jenkins|buildkite|ci\b/i, 'Automated builds and test results (verification records)'],
  [/github|gitlab|bitbucket/i, 'Source code, code reviews and release tags (design outputs)'],
  [/confluence|notion/i, 'Wiki pages: plans, meeting notes or procedures if kept here'],
  [/excel|spreadsheet|sheets/i, 'Spreadsheets used for records or calculations'],
  [EQMS_RE, EQMS_USE],
];

/** Systems the setup answers point to, other than ones already listed or dismissed. */
export interface SystemSuggestion {
  key: string;
  name: string;
  use: string;
  from: string;
  profiled: boolean;
}

const splitTools = (s: string) =>
  s
    .split(/[,;\n]|\band\b/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && x.length < 80);

function presetFor(key: string): Preset | null {
  if (key === 'biomedix') return BIOMEDIX;
  if (key === 'sharepoint' || key === 'google') return filesPreset(key);
  if (key === 'docusign' || key === 'adobe') return signingPreset(key);
  return null;
}

export function suggestSystems(ix: Intake, p11: Part11Answers): SystemSuggestion[] {
  const out: SystemSuggestion[] = [];
  const add = (key: string, name: string, use: string, from: string) => {
    if (out.some((x) => x.key === key)) return;
    out.push({ key, name, use, from, profiled: !!presetFor(key) });
  };
  add('biomedix', BIOMEDIX.name, BIOMEDIX.use, BIOMEDIX.from);
  const tools = `${ix.operations.qmsTools}\n${ix.operations.devTools}`;
  if (ix.qms.docSystem === 'sharepoint' || /sharepoint|microsoft 365|office 365|m365|onedrive/i.test(tools))
    add('sharepoint', filesPreset('sharepoint').name, filesPreset('sharepoint').use, 'your document control system');
  if (ix.qms.docSystem === 'google' || /google (drive|workspace)|g suite/i.test(tools))
    add('google', filesPreset('google').name, filesPreset('google').use, 'your document control system');
  if (ix.qms.eSignature === 'docusign' || /docusign/i.test(tools)) add('docusign', signingPreset('docusign').name, signingPreset('docusign').use, 'your electronic signature method');
  if (ix.qms.eSignature === 'adobe' || /adobe sign|acrobat sign/i.test(tools)) add('adobe', signingPreset('adobe').name, signingPreset('adobe').use, 'your electronic signature method');
  if (ix.qms.docSystem === 'eqms' && !EQMS_RE.test(tools)) add('tool:eqms', 'eQMS', EQMS_USE, 'your document control system');

  for (const raw of splitTools(tools)) {
    if (/sharepoint|microsoft 365|office 365|m365|onedrive|google (drive|workspace)|g suite|docusign|adobe sign|acrobat sign/i.test(raw)) continue;
    const name = raw.replace(/\s*\(.*\)\s*$/, '').trim() || raw;
    const use = TOOL_USE.find(([re]) => re.test(raw))?.[1] ?? '';
    add(`tool:${name.toLowerCase()}`, name, use, ix.operations.qmsTools.includes(raw) ? 'your QMS tools' : 'your development tools');
  }
  const taken = new Set([...p11.systems.map((x) => x.preset).filter(Boolean), ...p11.systems.map((x) => `tool:${x.name.toLowerCase()}`), ...p11.dismissed]);
  return out.filter((x) => !taken.has(x.key));
}

/** A new system, with its profile's suggested answers marked for confirmation. */
export function makeSystem(sug: Pick<SystemSuggestion, 'key' | 'name' | 'use'> | null): P11System {
  const preset = sug ? presetFor(sug.key) : null;
  const answers: Record<string, P11Answer> = {};
  for (const [id, a] of Object.entries(preset?.answers ?? {}))
    answers[id] = { ...EMPTY_P11_ANSWER, evidence: '', action: '', ...a, suggested: true };
  return {
    id: uid('sys-'),
    preset: sug?.key ?? '',
    name: sug?.name ?? '',
    use: sug?.use ?? '',
    records: preset?.scope?.records ?? '',
    relied: preset?.scope?.relied ?? '',
    signatures: preset?.scope?.signatures ?? '',
    open: preset?.scope?.open ?? '',
    impact: preset?.scope?.impact ?? '',
    suggestedScope: !!preset?.scope,
    answers,
  };
}

/* ---------- Evaluation ---------- */

export type SystemScope = 'unknown' | 'out' | 'records' | 'records-signatures';

export function scopeOf(s: P11System): SystemScope {
  if (s.signatures === 'yes') return 'records-signatures';
  if (s.records === 'yes' && s.relied === 'yes') return 'records';
  if (s.signatures === 'no' && (s.records === 'no' || (s.records === 'yes' && s.relied === 'no'))) return 'out';
  return 'unknown';
}

export const SCOPE_LABEL: Record<SystemScope, string> = {
  unknown: 'Scope not decided',
  out: 'Not in scope',
  records: 'In scope: electronic records',
  'records-signatures': 'In scope: records and signatures',
};

export function outOfScopeReason(s: P11System): string {
  if (s.records === 'no') return 'It holds no records that FDA regulations or ISO 13485 require, and applies no electronic signatures.';
  return 'A signed paper copy (or another system) is the official record, so this system’s copy isn’t relied on, and it applies no electronic signatures.';
}

export function scopeComplete(s: P11System): boolean {
  if (!s.name.trim() || !s.records || !s.signatures) return false;
  if (s.records === 'yes' && !s.relied) return false;
  const sc = scopeOf(s);
  if (sc === 'records' || sc === 'records-signatures') return !!s.open && !!s.impact;
  return sc === 'out';
}

export function controlsFor(s: P11System): P11Control[] {
  const sc = scopeOf(s);
  if (sc !== 'records' && sc !== 'records-signatures') return [];
  return CONTROLS.filter(
    (c) => c.group === 'records' || (c.group === 'open' && s.open === 'yes') || (c.group === 'signatures' && sc === 'records-signatures'),
  );
}

export function companyControls(p11: Part11Answers): P11Control[] {
  const inScope = p11.systems.filter((s) => scopeOf(s) === 'records' || scopeOf(s) === 'records-signatures');
  if (!inScope.length) return [];
  const sigs = inScope.some((s) => scopeOf(s) === 'records-signatures');
  return CONTROLS.filter((c) => c.group === 'company' && (!c.needsSignatures || sigs));
}

/** The answer can be accepted on risk instead of fixed: a partial control under enforcement discretion, on a system that isn't high risk. */
export const canAccept = (c: P11Control, impact: P11Impact | 'company') => !!c.discretion && impact !== 'high' && impact !== '' && impact !== 'company';

export type AnswerState = 'open' | 'done' | 'finding' | 'accepted';

export function answerState(a: P11Answer | undefined, c: P11Control, impact: P11Impact | 'company'): { state: AnswerState; missing?: string } {
  if (!a?.result) return { state: 'open', missing: 'choose a result' };
  if (!a.evidence.trim())
    return { state: 'open', missing: a.result === 'na' ? 'say why it doesn’t apply' : a.result === 'met' ? 'add the evidence' : 'describe what falls short' };
  if (a.result === 'met' || a.result === 'na') return { state: 'done' };
  if (a.accepted && canAccept(c, impact)) return a.result === 'partial' ? { state: 'accepted' } : { state: 'open', missing: 'only a partial control can be accepted on risk' };
  if (!a.action.trim()) return { state: 'open', missing: 'add the corrective action' };
  return { state: 'finding' };
}

export interface P11Item {
  key: string;
  label: string;
  /** Element id on the assessment page. */
  anchor: string;
}

export interface P11Finding {
  system: string;
  /** System id, or 'company'. */
  owner: string;
  control: P11Control;
  answer: P11Answer;
}

export interface SystemSummary {
  system: P11System;
  scope: SystemScope;
  controls: P11Control[];
  done: number;
  total: number;
  findings: number;
  accepted: number;
  suggested: number;
  status: 'incomplete' | 'out' | 'compliant' | 'findings';
}

export interface Part11Summary {
  systems: SystemSummary[];
  inScope: number;
  company: P11Control[];
  companyDone: number;
  /** Items finished / required, for progress and readiness. */
  done: number;
  total: number;
  /** Suggested answers not yet confirmed. */
  suggested: number;
  suggestedTotal: number;
  findings: P11Finding[];
  accepted: P11Finding[];
  todo: P11Item[];
  /** Systems from the setup answers not added yet. */
  pendingSystems: SystemSuggestion[];
  complete: boolean;
}

export function summarizePart11(ix: Intake): Part11Summary {
  const p11 = ix.part11;
  const todo: P11Item[] = [];
  const findings: P11Finding[] = [];
  const accepted: P11Finding[] = [];
  let suggested = 0;
  let suggestedTotal = 0;
  let done = 0;
  let total = 0;

  if (!p11.systems.length) {
    total++;
    todo.push({ key: 'add-system', label: 'Add the systems that hold your quality records', anchor: 'p11-systems' });
  }

  const systems = p11.systems.map((s): SystemSummary => {
    const name = s.name.trim() || 'Unnamed system';
    const scope = scopeOf(s);
    total++;
    if (scopeComplete(s)) done++;
    else todo.push({ key: `${s.id}-scope`, label: `${name}: answer the scope questions`, anchor: `sys-${s.id}` });
    const preset = s.preset ? presetFor(s.preset) : null;
    if (preset?.scope) suggestedTotal++;
    if (s.suggestedScope) suggested++;

    const controls = controlsFor(s);
    let sDone = 0;
    let sFind = 0;
    let sAcc = 0;
    let sSug = 0;
    for (const c of controls) {
      const a = s.answers[c.id];
      total++;
      if (a?.suggested) sSug++;
      if (preset?.answers?.[c.id]) suggestedTotal++;
      const st = answerState(a, c, s.impact);
      if (st.state === 'open') todo.push({ key: `${s.id}-${c.id}`, label: `${name} ${c.id}: ${st.missing}`, anchor: `ctl-${s.id}-${c.id}` });
      else {
        done++;
        sDone++;
        if (st.state === 'finding') {
          sFind++;
          findings.push({ system: name, owner: s.id, control: c, answer: a! });
        }
        if (st.state === 'accepted') {
          sAcc++;
          accepted.push({ system: name, owner: s.id, control: c, answer: a! });
        }
      }
    }
    suggested += sSug;
    const complete = scopeComplete(s) && sDone === controls.length;
    return {
      system: s,
      scope,
      controls,
      done: sDone + (scopeComplete(s) ? 1 : 0),
      total: controls.length + 1,
      findings: sFind,
      accepted: sAcc,
      suggested: sSug + (s.suggestedScope ? 1 : 0),
      status: !complete ? 'incomplete' : scope === 'out' ? 'out' : sFind ? 'findings' : 'compliant',
    };
  });

  const company = companyControls(p11);
  let companyDone = 0;
  for (const c of company) {
    total++;
    const a = p11.company[c.id];
    const st = answerState(a, c, 'company');
    if (st.state === 'open') todo.push({ key: `company-${c.id}`, label: `Company ${c.id}: ${st.missing}`, anchor: `ctl-company-${c.id}` });
    else {
      done++;
      companyDone++;
      if (st.state === 'finding') findings.push({ system: 'Company-wide', owner: 'company', control: c, answer: a! });
    }
  }

  // Systems the setup answers point to count as proposals until added or dismissed.
  const pendingSystems = suggestSystems(ix, p11);
  suggested += pendingSystems.length;
  suggestedTotal += pendingSystems.length;

  return {
    systems,
    inScope: systems.filter((s) => s.scope === 'records' || s.scope === 'records-signatures').length,
    company,
    companyDone,
    done,
    total,
    suggested,
    suggestedTotal: Math.max(suggestedTotal, suggested),
    findings,
    accepted,
    todo,
    pendingSystems,
    complete: done === total && suggested === 0,
  };
}
