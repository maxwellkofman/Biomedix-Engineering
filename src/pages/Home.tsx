import { Link } from 'react-router-dom';
import { ButtonLink } from '../components/Button';
import { CheckIcon, Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { useAccount } from '../account/AccountContext';
import '../styles/home.css';

const SITE_NAV = [
  { label: 'Agents', href: '#agents' },
  { label: 'Human oversight', href: '#oversight' },
  { label: 'Engineer on call', href: '#oncall' },
  { label: 'Built for FDA', href: '#trust' },
  { label: 'SaMD and AI', href: '#samd' },
  { label: 'How it works', href: '#how' },
];

type RunMarker = 'ai' | 'gap' | 'engineer' | 'you';
const AGENT_RUN: { marker: RunMarker; title: string; detail: string }[] = [
  { marker: 'ai', title: 'Drafted 4 hazards from the device description', detail: 'Cites SOP-003 §3 and ISO 14971 5.4 · model [version] logged' },
  { marker: 'ai', title: 'Linked HAZ-014 to RC-007 and SRS-031', detail: 'Delayed alert leads to delayed treatment' },
  { marker: 'gap', title: 'Gap: RC-007 has no verification of effectiveness', detail: 'Verification gate held closed' },
  { marker: 'engineer', title: 'Technical review · Biomedix engineer', detail: 'In review' },
  { marker: 'you', title: 'Approval · your management representative', detail: 'Waiting on review' },
];
const MARKER_TEXT: Record<RunMarker, string> = { ai: 'AI', gap: '!', engineer: 'BE', you: 'YOU' };

const AUDIENCE = [
  'Seed to Series A teams of 5–30',
  'ML and software founders new to design controls',
  'Class II and software-driven devices',
  'Before formal design verification',
];

const AGENTS = [
  {
    name: 'Design controls agent',
    body: "Turns user needs into testable design inputs, flags anything that can't be verified, and proposes acceptance criteria.",
    checkpoint: 'engineer review, then your design lead approves.',
  },
  {
    name: 'Risk agent',
    body: 'Drafts the hazard analysis top-down, from hazard to harm, links FMEA rows and security threats, and checks that every control has evidence.',
    checkpoint: 'severity and acceptability are always human calls.',
  },
  {
    name: 'Trace agent',
    body: 'Keeps the graph from user needs to verification and risk controls current, and holds a gate closed while evidence is missing or stale.',
    checkpoint: 'only your gate approver can open a gate.',
  },
  {
    name: 'Change agent',
    body: "Shows every downstream item a change touches and drafts the 510(k) change assessment using FDA's decision flowcharts.",
    checkpoint: 'the regulatory call is made and signed by people.',
  },
  {
    name: 'CAPA agent',
    body: 'Watches nonconformances and complaints for trend triggers, drafts problem statements, and tracks effectiveness checks to closure.',
    checkpoint: 'root cause and closure are signed by Quality.',
  },
  {
    name: 'Submission agent',
    body: 'Assembles trace tables, software documentation and the cybersecurity package in the structure FDA reviewers expect.',
    checkpoint: 'your regulatory lead owns the submission.',
  },
];

const OVERSIGHT_STEPS = [
  { label: '01 · AGENT', title: 'Drafts and shows its work', body: 'Every output is labeled as AI-generated, with model version, sources and the procedure it followed.' },
  { label: '02 · BIOMEDIX ENGINEER', title: 'Technical review', body: 'A biomedical engineer checks it against the regulation and your device, then signs or returns it with comments.', highlight: true },
  { label: '03 · YOUR TEAM', title: 'Approval', body: 'Your process owner and management representative approve the release. The decision stays with your company.' },
];

const EXPERT_SERVICES = [
  { name: 'Reviewer of record', body: 'Technical review of every agent output. Per document or monthly retainer.' },
  { name: 'Independent design reviewer', body: 'The independent seat at each design review, with written findings. Per gate.' },
  { name: 'Outsourced internal audit', body: 'Run by an auditor who did not build your system. Per audit cycle.' },
];

const SIGNATURE: { k: string; v: string; mono?: boolean; strong?: boolean }[] = [
  { k: 'Meaning', v: 'Technical review', strong: true },
  { k: 'Reviewer', v: '[Reviewer name], [credential] · Biomedix Engineering' },
  { k: 'Signed', v: '[YYYY-MM-DD hh:mm, time zone]', mono: true },
  { k: 'Reviewed', v: 'Risk agent run 0412, model [version]; 4 hazards, 3 accepted, 1 returned' },
  { k: 'Approval', v: "Remains with [Company]'s process owner and management representative" },
];

const ON_CALL: { icon: IconName; title: string; body: string; sla: string }[] = [
  { icon: 'chat', title: 'Ask an engineer', body: 'Message from any record in the app. The agent attaches the context; an engineer replies in writing.', sla: 'Reply within [1 business day]' },
  { icon: 'video', title: 'Live consult', body: 'A 30-minute video session for a design review prep, a risk decision or an FDA question. Notes and actions land in your system.', sla: 'Book within [2 business days]' },
  { icon: 'doc-check', title: 'Signed review', body: 'A technical review of an agent output with a Part 11 signature, so it is ready for your approvers.', sla: 'Signed within [2 business days]' },
];

const PLANS = [
  { name: 'Pay per visit', body: '[YOUR PRICE] per consult or signed review' },
  { name: 'Membership', body: '[YOUR PRICE]/month with platform, [N] engineer hours and priority replies', featured: true },
  { name: 'Gate coverage', body: 'Independent reviewer at every design review, [YOUR PRICE] per gate' },
];

const TRUST: { icon: IconName; title: string; body: string }[] = [
  { icon: 'doc-lines', title: 'Full audit trail', body: 'Every suggestion, edit, acceptance and rejection is recorded with who, when, which model and why.' },
  { icon: 'shield', title: 'Validation package included', body: "Intended use, risk ratings and our assurance records under FDA's Computer Software Assurance guidance, so your validation takes hours." },
  { icon: 'signature', title: 'Part 11 signatures', body: 'Each signature records a name, time and meaning: authored by agent, technical review, or approval.' },
  { icon: 'lock', title: 'Your data stays yours', body: 'Isolated per customer. Never used to train models shared with other customers. Full export at any time.' },
];

const SAMD_POINTS = [
  "Predetermined change control plans aligned to FDA's final PCCP guidance for AI-enabled device software functions (August 2025)",
  "IEC 62304 lifecycle scaled by safety class and mapped to FDA's Basic and Enhanced documentation levels",
  'Section 524B cybersecurity: threat model, SBOM and vulnerability management',
  'Model cards, patient-level data partitioning, subgroup performance and field monitoring after clearance',
];

const GATE_ZERO = [
  "Is it a device software function, or decision support outside FDA's definition?",
  'Classification, product code and pathway',
  'Do design controls apply? Software-automated Class I devices count.',
  'Is it a cyber device under section 524B?',
  'Is it AI-enabled, and will you file a PCCP?',
  'FDA documentation level and IEC 62304 safety class',
];

const ONBOARDING = [
  { label: '01 · FREE', title: 'Gap scan', body: 'Agents read your current requirements, risk file or test reports; an engineer walks you through the gaps they found.', current: true },
  { label: '02 · WEEK 1', title: 'Gate zero', body: 'Device status, classification, pathway, cyber and AI questions answered and signed before agents start.' },
  { label: '03 · WEEKS 2–6', title: 'Agents onboard', body: 'Agents tailor the procedure set and build your trace graph from the work you already have; engineers review every output.' },
  { label: '04 · ONGOING', title: 'Always on', body: 'Agents keep the system current as your design changes. Your team approves; engineers review on retainer.' },
];

export default function Home() {
  const { status } = useAccount();
  return (
    <div id="top" className="home">
      <header className="night">
        <div className="container site-header">
          <Logo />
          <nav aria-label="Primary" className="site-nav">
            {SITE_NAV.map((item) => (
              <a key={item.href} href={item.href} className="site-nav__link">
                {item.label}
              </a>
            ))}
            <Link to={status === 'signed-in' ? '/app/projects' : '/sign-in'} className="site-nav__link">
              {status === 'signed-in' ? 'Your projects' : 'Sign in'}
            </Link>
            <ButtonLink to="#start" variant="bright">
              Book a demo
            </ButtonLink>
          </nav>
        </div>

        <div className="container hero">
          <div className="hero__copy">
            <p className="hero__kicker mono">AI-native QMS · 21 CFR 820 QMSR · ISO 13485 · ISO 14971</p>
            <h1 className="hero__title">AI agents run your quality system. Engineers sign off.</h1>
            <p className="hero__lead">
              Biomedix agents draft design controls, risk files and CAPAs, trace every requirement to its evidence, and
              hold a gate closed when something is missing. A Biomedix biomedical engineer reviews every output before
              your team approves it.
            </p>
            <div className="hero__actions">
              <ButtonLink to="#start" variant="bright" size="lg">
                Book a demo
              </ButtonLink>
              <ButtonLink to="/app/review" variant="outline-night" size="lg">
                See the review queue
              </ButtonLink>
            </div>
            <p className="hero__note">For seed to Series A device, SaMD and diagnostics teams without a full-time quality hire.</p>
          </div>

          <div className="run-card">
            <div className="run-card__head">
              <span className="mono run-card__meta">Risk agent · run 0412 · wearable ECG SaMD</span>
              <span className="run-card__status">Awaiting engineer review</span>
            </div>
            <ol className="list-reset run-card__list">
              {AGENT_RUN.map((row) => (
                <li key={row.title} className="run-card__row">
                  <span className={`run-marker run-marker--${row.marker}`}>{MARKER_TEXT[row.marker]}</span>
                  <span className="stack run-card__text">
                    <span className="run-card__title">{row.title}</span>
                    <span className={`run-card__detail${row.marker === 'gap' ? ' run-card__detail--warn' : ''}`}>
                      {row.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="run-card__foot">Nothing an agent writes enters a released record until two people have signed it.</p>
          </div>
        </div>
      </header>

      <section aria-label="Who it is for" className="audience">
        <div className="container audience__inner">
          <span className="eyebrow eyebrow--muted">BUILT FOR</span>
          {AUDIENCE.map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
      </section>

      <section id="agents" className="container section">
        <div className="section-head">
          <span className="eyebrow">AGENTS</span>
          <h2 className="section-title">Six agents do the quality work your team doesn't have hours for.</h2>
          <p className="lead">
            Each agent works inside a QMSR-native procedure set and cites the procedure and clause behind every output.
            Each one stops at a named human checkpoint.
          </p>
        </div>
        <div className="auto-grid" style={{ ['--min' as string]: '330px' }}>
          {AGENTS.map((agent) => (
            <article key={agent.name} className="card">
              <h3 className="card__title">{agent.name}</h3>
              <p className="card__body">{agent.body}</p>
              <p className="card__foot">
                <strong>Human checkpoint:</strong> {agent.checkpoint}
              </p>
            </article>
          ))}
        </div>
        <div className="card library-callout">
          <p>
            <strong>Underneath the agents:</strong> 33 QMSR-native procedures and records, from the quality manual to
            the PCCP, tailored to your device and released in your system.
          </p>
          <Link to="/app/procedures" className="library-callout__link">
            Explore the procedure library →
          </Link>
        </div>
      </section>

      <section id="oversight" className="night">
        <div className="container section section--wide-gap">
          <div className="section-head">
            <span className="eyebrow eyebrow--on-night">HUMAN OVERSIGHT</span>
            <h2 className="section-title">AI does the drafting. People own every decision.</h2>
            <p className="lead lead--on-night">
              Under FDA's quality system regulation, your company is accountable for every record, however it was
              written. So every agent output passes two people before it counts.
            </p>
          </div>

          <ol className="list-reset auto-grid">
            {OVERSIGHT_STEPS.map((step) => (
              <li key={step.label} className={`card card--night-raised${step.highlight ? ' card--highlight' : ''}`}>
                <span className={`mono oversight__label${step.highlight ? ' oversight__label--bright' : ''}`}>{step.label}</span>
                <h3 className="card__title">{step.title}</h3>
                <p className="on-night-2">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="services">
            <div className="stack services__col">
              <h3 className="services__title">Expert services</h3>
              <ul className="list-reset stack services__list">
                {EXPERT_SERVICES.map((s) => (
                  <li key={s.name} className="stack">
                    <span className="services__name">{s.name}</span>
                    <span className="on-night-2 services__body">{s.body}</span>
                  </li>
                ))}
              </ul>
              <p className="services__price">
                From <strong>[YOUR PRICE]</strong> per review, or on a monthly retainer.
              </p>
            </div>
            <div className="stack signature">
              <span className="signature__caption">What our signature means, as it appears on your record</span>
              <dl className="signature__record">
                {SIGNATURE.map((row) => (
                  <div key={row.k} className="signature__row">
                    <dt>{row.k}</dt>
                    <dd className={[row.mono && 'mono signature__mono', row.strong && 'signature__strong'].filter(Boolean).join(' ')}>
                      {row.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section id="oncall" className="container section">
        <div className="oncall__head">
          <div className="section-head">
            <span className="eyebrow">ENGINEER ON CALL</span>
            <h2 className="section-title">Telehealth for your quality system.</h2>
          </div>
          <p className="lead">
            The agents handle intake and triage. When a question needs judgment, a Biomedix biomedical engineer picks it
            up already knowing your device, your trace graph and your history.
          </p>
        </div>

        <div className="auto-grid">
          {ON_CALL.map((item) => (
            <article key={item.title} className="card">
              <Icon name={item.icon} className="accent-icon" />
              <h3 className="card__title">{item.title}</h3>
              <p className="card__body">{item.body}</p>
              <p className="card__foot">
                <strong>{item.sla}</strong>
              </p>
            </article>
          ))}
        </div>

        <div className="auto-grid plans" style={{ ['--min' as string]: '260px' }}>
          {PLANS.map((plan) => (
            <div key={plan.name} className={`plan${plan.featured ? ' plan--featured' : ''}`}>
              <span className="plan__name">{plan.name}</span>
              <span className="plan__body">{plan.body}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="trust" className="band band--white">
        <div className="container section section--wide-gap">
          <div className="section-head">
            <span className="eyebrow">BUILT FOR FDA'S EXPECTATIONS</span>
            <h2 className="section-title">AI an investigator can follow.</h2>
            <p className="lead">
              FDA expects every tool in your quality system to be validated for its intended use, and every record to
              have an accountable author. We built the agents around both.
            </p>
          </div>
          <div className="auto-grid trust" style={{ ['--min' as string]: '250px' }}>
            {TRUST.map((item) => (
              <div key={item.title} className="stack trust__item">
                <Icon name={item.icon} size={32} className="accent-icon" />
                <h3 className="trust__title">{item.title}</h3>
                <p className="card__body">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="samd" className="band band--mint">
        <div className="container section samd">
          <div className="stack samd__copy">
            <h2 className="section-title">Building an AI-enabled device?</h2>
            <p className="lead lead--ink">
              FDA's expectations for AI devices are still moving. Our agents and engineers track them, so your ML team
              can build.
            </p>
            <ul className="list-reset stack samd__list">
              {SAMD_POINTS.map((point) => (
                <li key={point} className="samd__point">
                  <CheckIcon />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card gate-zero">
            <span className="eyebrow gate-zero__label">GATE ZERO · ANSWERED BEFORE ANY AGENT RUNS</span>
            <ol className="gate-zero__list">
              {GATE_ZERO.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
            <p className="gate-zero__note">
              The agent drafts the answers; a Biomedix engineer and your team sign the determination.
            </p>
          </div>
        </div>
      </section>

      <section id="how" className="container section section--wide-gap">
        <div className="how__head">
          <h2 className="section-title how__title">Live in weeks, then running on its own.</h2>
          <p className="how__price">
            Onboarding from <strong>[YOUR PRICE]</strong> · platform from <strong>[YOUR PRICE]</strong>/month
          </p>
        </div>
        <ol className="list-reset auto-grid" style={{ ['--min' as string]: '250px' }}>
          {ONBOARDING.map((step) => (
            <li key={step.label} className={`how__step${step.current ? ' how__step--current' : ''}`}>
              <span className="mono how__label">{step.label}</span>
              <h3 className="how__step-title">{step.title}</h3>
              <p className="card__body">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="start" className="band band--white band--top-line">
        <div className="container cta">
          <h2 className="cta__title">See what the agents find in your design file.</h2>
          <p className="lead cta__lead">
            Share your trace matrix, risk file or test reports. You get a free gap scan, reviewed by an engineer, within
            48 hours.
          </p>
          <ButtonLink to="#start" variant="primary" size="xl">
            Book a demo and gap scan
          </ButtonLink>
          <Link to="/app/setup/company" className="cta__alt">
            Or start drafting your documentation suite now →
          </Link>
        </div>
      </section>

      <footer className="night site-footer">
        <div className="container site-footer__inner">
          <div className="stack site-footer__about">
            <span className="site-footer__brand">Biomedix Engineering</span>
            <p>
              Biomedix Engineering provides AI software and engineering review. Your management approves and owns every
              quality system decision; Biomedix engineers sign as technical reviewers, never as approvers. Nothing on
              this site is regulatory or legal advice.
            </p>
          </div>
          <nav aria-label="Footer" className="site-footer__nav">
            <a href="#agents">Agents</a>
            <a href="#oversight">Human oversight</a>
            <a href="#oncall">Engineer on call</a>
            <Link to="/app/procedures">Procedure library</Link>
            <Link to="/app/review">Review queue</Link>
            <a href="#start">Contact</a>
            <span className="site-footer__copy">© 2026 Biomedix Engineering</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
