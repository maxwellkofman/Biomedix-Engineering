import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Button, ButtonLink } from '../components/Button';
import { ChoiceField, TextField, YES_NO } from '../components/Field';
import { Segments } from '../components/Segments';
import { useIntake } from '../intake/IntakeContext';
import { detectFromDescription, draftIntendedUse } from '../intake/derive';
import { STEPS, type Intake, type IntakeSection, type StepId } from '../intake/model';
import '../styles/app.css';
import '../styles/flow.css';

/** Which answers belong to each step, for the progress counts. */
const STEP_FIELDS: Record<StepId, [IntakeSection, string][]> = {
  company: [['company', 'name'], ['company', 'address'], ['company', 'stage'], ['company', 'employees']],
  device: [
    ['device', 'name'],
    ['device', 'description'],
    ['device', 'intendedUse'],
    ['device', 'indications'],
    ['device', 'users'],
    ['device', 'environment'],
  ],
  technology: [['tech', 'hardware'], ['tech', 'software'], ['tech', 'connected'], ['tech', 'ai'], ['tech', 'worstHarm'], ['tech', 'platforms']],
  regulatory: [
    ['regulatory', 'deviceClass'],
    ['regulatory', 'productCode'],
    ['regulatory', 'regulation'],
    ['regulatory', 'pathway'],
    ['regulatory', 'targetSubmission'],
  ],
  operations: [['operations', 'manufacturing'], ['operations', 'suppliers'], ['operations', 'qmsTools'], ['operations', 'devTools']],
  team: [['team', 'ceo'], ['team', 'quality'], ['team', 'engineering']],
};

function answered(ix: Intake, step: StepId) {
  const fields = STEP_FIELDS[step];
  const done = fields.filter(([s, k]) => String((ix[s] as Record<string, string>)[k] ?? '').trim()).length;
  return { done, total: fields.length };
}

export default function Setup() {
  const { step } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { intake, loadExample, reset } = useIntake();

  const index = STEPS.findIndex((s) => s.id === step);

  // Focus the field a "needs input" link pointed at.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
    }
  }, [step, hash]);

  if (index === -1) return <Navigate to="/app/setup/company" replace />;
  const current = STEPS[index];
  const next = STEPS[index + 1];
  const prev = STEPS[index - 1];

  return (
    <AppShell user={{ initials: 'YOU', label: 'Signed in as the customer', tone: 'muted' }}>
      <aside aria-label="Setup steps" className="app-sidebar app-sidebar--sticky">
        <div className="stack app-sidebar__head">
          <h1 className="app-sidebar__title">Set up your QMS</h1>
          <span className="app-sidebar__sub">Answer once. Agents fill in every procedure.</span>
        </div>
        <ol className="list-reset stack steps">
          {STEPS.map((s, i) => {
            const { done, total } = answered(intake, s.id);
            const on = s.id === current.id;
            return (
              <li key={s.id}>
                <Link
                  to={`/app/setup/${s.id}`}
                  aria-current={on ? 'step' : undefined}
                  className={`steps__item${on ? ' steps__item--on' : ''}`}
                >
                  <span className={`steps__num${done === total ? ' steps__num--done' : ''}`}>{i + 1}</span>
                  <span className="stack">
                    <span className="steps__label">{s.label}</span>
                    <span className="steps__count">
                      {done} of {total} answered
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="steps__tools">
          <Button variant="outline" size="sm" onClick={loadExample}>
            Fill with example
          </Button>
          <Button
            variant="text"
            size="sm"
            onClick={() => {
              if (window.confirm('Clear all answers?')) {
                reset();
                navigate('/app/setup/company');
              }
            }}
          >
            Clear answers
          </Button>
        </div>
      </aside>

      <main className="app-main setup-main">
        <div className="stack setup-main__head">
          <span className="eyebrow">
            STEP {index + 1} OF {STEPS.length}
          </span>
          <h2 className="setup-main__title">{current.label}</h2>
          <p className="setup-main__blurb">{current.blurb}</p>
        </div>

        <form className="stack setup-form" onSubmit={(e) => e.preventDefault()}>
          <StepFields step={current.id} />
        </form>

        <div className="setup-nav">
          {prev ? (
            <ButtonLink to={`/app/setup/${prev.id}`} variant="outline">
              ← {prev.label}
            </ButtonLink>
          ) : (
            <span />
          )}
          {next ? (
            <ButtonLink to={`/app/setup/${next.id}`} variant="primary">
              Next: {next.label} →
            </ButtonLink>
          ) : (
            <ButtonLink to="/app/suite" variant="primary">
              Build documentation suite →
            </ButtonLink>
          )}
        </div>
      </main>

      <SuitePreview />
    </AppShell>
  );
}

/* ---------- Live preview column ---------- */

function SuitePreview() {
  const { suite, started } = useIntake();
  return (
    <aside aria-label="Documentation preview" className="setup-preview">
      <section className="card card--compact preview-card">
        <div className="outline__head">
          <h2 className="card__title card__title--sm">Your documentation suite</h2>
          <span className="text-muted-sm">Live</span>
        </div>
        <div className="meter" aria-hidden="true">
          <span className="meter__fill" style={{ width: `${started ? suite.filledPct : 0}%` }} />
        </div>
        <dl className="preview-stats">
          <div>
            <dt>Required</dt>
            <dd>{suite.applicable.length}</dd>
          </div>
          <div>
            <dt>Auto-filled</dt>
            <dd>{started ? suite.filledPct : 0}%</dd>
          </div>
          <div>
            <dt>Ready</dt>
            <dd>{suite.ready}</dd>
          </div>
        </dl>
        <ButtonLink to="/app/suite" variant="outline" size="sm">
          Open documentation suite
        </ButtonLink>
      </section>

      <section className="card card--night card--compact gate-card">
        <h2 className="card__title card__title--sm">Gate zero · drafted by the agent</h2>
        <dl className="gate-card__list">
          {suite.gateZero.map((g) => (
            <div key={g.q}>
              <dt>{g.q}</dt>
              <dd>
                <Segments segs={g.segs} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="gate-card__note">A Biomedix engineer and your team sign the determination.</p>
      </section>
    </aside>
  );
}

/* ---------- Step bodies ---------- */

function useBind() {
  const { intake, update } = useIntake();
  return function bind<S extends IntakeSection>(section: S, key: keyof Intake[S] & string) {
    return {
      id: `${section}.${key}`,
      value: intake[section][key] as unknown as string,
      onChange: (v: string) => update(section, { [key]: v } as Partial<Intake[S]>),
    };
  };
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card card--compact form-group">
      <h3 className="form-group__title">{title}</h3>
      {children}
    </section>
  );
}

function StepFields({ step }: { step: StepId }) {
  switch (step) {
    case 'company':
      return <CompanyStep />;
    case 'device':
      return <DeviceStep />;
    case 'technology':
      return <TechnologyStep />;
    case 'regulatory':
      return <RegulatoryStep />;
    case 'operations':
      return <OperationsStep />;
    case 'team':
      return <TeamStep />;
  }
}

function CompanyStep() {
  const bind = useBind();
  return (
    <Group title="Legal manufacturer">
      <TextField label="Company name" placeholder="As registered with FDA" {...bind('company', 'name')} />
      <TextField label="Address" placeholder="Street, city, state, ZIP" {...bind('company', 'address')} />
      <div className="field-row">
        <TextField label="Funding stage" placeholder="Seed, Series A…" {...bind('company', 'stage')} />
        <TextField label="Employees" placeholder="12" {...bind('company', 'employees')} />
      </div>
    </Group>
  );
}

function Detections() {
  const { intake, update } = useIntake();
  const found = detectFromDescription(intake.device.description).filter((d) => !intake.tech[d.field]);
  if (!found.length) return null;
  return (
    <div className="detect" role="status">
      <div className="stack detect__text">
        <span className="detect__title">The agent read your description</span>
        <span className="detect__list">
          {found.map((d) => (
            <span key={d.field} className="pill pill--mint">
              {d.label} · “{d.evidence}”
            </span>
          ))}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => update('tech', Object.fromEntries(found.map((d) => [d.field, 'yes'])))}
      >
        Apply to technology answers
      </Button>
    </div>
  );
}

function DeviceStep() {
  const bind = useBind();
  const { intake, update } = useIntake();
  return (
    <>
      <Group title="What it is">
        <TextField label="Device name" placeholder="Trade name or working name" {...bind('device', 'name')} />
        <TextField
          label="Plain-language description"
          rows={4}
          placeholder="What the device is, how it works, and what it connects to. The agent reads this to pre-fill later steps."
          {...bind('device', 'description')}
        />
        <Detections />
      </Group>
      <Group title="Intended use">
        <TextField
          label="Intended use statement"
          rows={3}
          hint="Bracketed text stays flagged as needing input until you replace it."
          action={
            <Button
              variant="text"
              size="sm"
              className="field__action"
              onClick={() => update('device', { intendedUse: draftIntendedUse(intake) })}
            >
              Draft from my answers
            </Button>
          }
          {...bind('device', 'intendedUse')}
        />
        <TextField label="Indications for use" rows={2} placeholder="Patient population, condition, duration" {...bind('device', 'indications')} />
        <div className="field-row">
          <TextField label="Intended users" placeholder="Clinicians, patients, caregivers…" {...bind('device', 'users')} />
          <TextField label="Use environment" placeholder="Hospital, clinic, home…" {...bind('device', 'environment')} />
        </div>
      </Group>
    </>
  );
}

function TechnologyStep() {
  const bind = useBind();
  const { intake } = useIntake();
  return (
    <>
      <Detections />
      <Group title="What the device is made of">
        <div className="field-row">
          <ChoiceField label="Includes hardware?" options={YES_NO} {...bind('tech', 'hardware')} />
          <ChoiceField label="Includes software?" options={YES_NO} {...bind('tech', 'software')} />
        </div>
        {intake.tech.software !== 'no' && (
          <>
            <TextField
              label="Software platforms"
              placeholder="Firmware, mobile apps, cloud service, web portal…"
              {...bind('tech', 'platforms')}
            />
            <ChoiceField
              label="Worst credible harm if the software fails, before external risk controls"
              hint="Sets the IEC 62304 safety class and FDA documentation level."
              options={[
                { value: 'none', label: 'No injury', hint: 'Class A · Basic' },
                { value: 'non-serious', label: 'Non-serious injury', hint: 'Class B · Basic' },
                { value: 'serious', label: 'Serious injury', hint: 'Class C · Enhanced' },
                { value: 'death', label: 'Death', hint: 'Class C · Enhanced' },
              ]}
              {...bind('tech', 'worstHarm')}
            />
          </>
        )}
      </Group>
      {intake.tech.software !== 'no' && (
        <Group title="Connectivity and AI">
          <ChoiceField
            label="Connects to the internet, a phone, or other devices?"
            hint="Software that can connect is a cyber device under section 524B."
            options={YES_NO}
            {...bind('tech', 'connected')}
          />
          <ChoiceField label="Uses AI or machine learning?" options={YES_NO} {...bind('tech', 'ai')} />
          {intake.tech.ai === 'yes' && (
            <>
              <ChoiceField
                label="How will the model change after clearance?"
                options={[
                  { value: 'locked', label: 'Locked', hint: 'Changes only with a new release' },
                  { value: 'retrained', label: 'Retrained', hint: 'Updated on new data over time' },
                ]}
                {...bind('tech', 'modelUpdates')}
              />
              <ChoiceField
                label="Will you file a predetermined change control plan (PCCP)?"
                options={YES_NO}
                {...bind('tech', 'pccp')}
              />
              <TextField
                label="Third-party or foundation models"
                placeholder="Name and version, or None"
                {...bind('tech', 'thirdPartyModel')}
              />
            </>
          )}
        </Group>
      )}
    </>
  );
}

function RegulatoryStep() {
  const bind = useBind();
  return (
    <Group title="Classification and pathway">
      <p className="form-group__note">
        Find your product code and regulation in{' '}
        <a href="https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPCD/classification.cfm" target="_blank" rel="noreferrer">
          FDA's product classification database
        </a>
        . Not sure yet? Leave them blank and an engineer will help at gate zero.
      </p>
      <ChoiceField
        label="Device class"
        options={[
          { value: 'I', label: 'Class I' },
          { value: 'II', label: 'Class II' },
          { value: 'III', label: 'Class III' },
        ]}
        {...bind('regulatory', 'deviceClass')}
      />
      <div className="field-row">
        <TextField label="Product code" placeholder="Three letters" {...bind('regulatory', 'productCode')} />
        <TextField label="Regulation number" placeholder="21 CFR 8xx.xxxx" {...bind('regulatory', 'regulation')} />
      </div>
      <ChoiceField
        label="Pathway"
        options={[
          { value: '510k', label: '510(k)' },
          { value: 'de-novo', label: 'De Novo' },
          { value: 'pma', label: 'PMA' },
          { value: 'exempt', label: 'Exempt' },
        ]}
        {...bind('regulatory', 'pathway')}
      />
      <div className="field-row">
        <TextField label="Predicate device" placeholder="Name and 510(k) number" {...bind('regulatory', 'predicate')} />
        <TextField label="Target submission date" type="date" {...bind('regulatory', 'targetSubmission')} />
      </div>
    </Group>
  );
}

function OperationsStep() {
  const bind = useBind();
  const { intake } = useIntake();
  return (
    <>
      <Group title="Manufacturing">
        <ChoiceField
          label="Who builds the device?"
          options={[
            { value: 'in-house', label: 'We do', hint: 'In-house production' },
            { value: 'contract', label: 'Contract manufacturer' },
            { value: 'none', label: 'Nothing physical', hint: 'Software only' },
          ]}
          {...bind('operations', 'manufacturing')}
        />
        {intake.operations.manufacturing === 'contract' && (
          <TextField label="Contract manufacturer" {...bind('operations', 'contractManufacturer')} />
        )}
        <TextField
          label="Critical suppliers"
          rows={2}
          placeholder="Components, cloud hosting, test labs, data vendors — comma separated"
          {...bind('operations', 'suppliers')}
        />
      </Group>
      <Group title="Tools">
        <TextField label="Where quality records live today" placeholder="Google Drive, Notion, an eQMS…" {...bind('operations', 'qmsTools')} />
        <TextField label="Development tools" placeholder="GitHub, Jira, CI…" {...bind('operations', 'devTools')} />
      </Group>
    </>
  );
}

function TeamStep() {
  const bind = useBind();
  const { tokens, derived } = useIntake();
  const fallback = (k: 'mgmtRep' | 'qualityLead' | 'opsLead' | 'regLead' | 'secLead') =>
    tokens[k]?.auto ? `Left blank, so the agent uses ${tokens[k]!.value}. Confirm or name someone else.` : undefined;
  return (
    <>
      <Group title="Accountable people">
        <p className="form-group__note">Name and title, e.g. “Jordan Lee, Head of Quality”. One person can hold several roles.</p>
        <div className="field-row">
          <TextField label="CEO / top management" {...bind('team', 'ceo')} />
          <TextField label="Management representative" hint={fallback('mgmtRep')} {...bind('team', 'managementRep')} />
        </div>
        <div className="field-row">
          <TextField label="Quality lead" hint={fallback('qualityLead')} {...bind('team', 'quality')} />
          <TextField label="Engineering lead" {...bind('team', 'engineering')} />
        </div>
        <div className="field-row">
          <TextField label="Operations lead" hint={fallback('opsLead')} {...bind('team', 'operations')} />
          <TextField label="Regulatory lead" hint={fallback('regLead')} {...bind('team', 'regulatory')} />
        </div>
        <div className="field-row">
          {derived.ai !== false && <TextField label="ML lead" {...bind('team', 'ml')} />}
          {derived.connected !== false && (
            <TextField label="Security lead" hint={fallback('secLead')} {...bind('team', 'security')} />
          )}
        </div>
      </Group>
    </>
  );
}
