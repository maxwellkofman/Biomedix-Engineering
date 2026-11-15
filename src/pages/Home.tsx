import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '../account/AccountContext';
import { Button, ButtonLink } from '../components/Button';
import { Logo } from '../components/Logo';
import { useIntake } from '../intake/IntakeContext';
import '../styles/home.css';

const STEPS = [
  {
    who: '01 · YOU',
    title: 'Describe your device',
    body: 'A few sentences is enough. The agent works out which procedures FDA expects for it, then asks only for what it still needs, one question at a time.',
  },
  {
    who: '02 · THE AGENT',
    title: 'Your quality system, drafted',
    body: 'Procedures, a risk assessment and a Part 11 assessment, filled in from your answers. Anything missing is flagged, never guessed.',
  },
  {
    who: '03 · AN ENGINEER, THEN YOU',
    title: 'Reviewed by a person, approved by you',
    body: 'A Biomedix biomedical engineer signs a technical review of every document. Approval stays with your management.',
  },
];

export default function Home() {
  const { status } = useAccount();
  const { intake, started, update, loadExample, readOnly, ready } = useIntake();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const signedIn = status === 'signed-in';
  // Someone with work in progress continues it; a new visitor gets the prompt.
  const resume = ready && (signedIn || started);

  const begin = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || readOnly) return;
    update('device', { description: text.trim() });
    navigate('/app/start');
  };

  return (
    <div id="top" className="home">
      <header className="night">
        <div className="container site-header">
          <Logo />
          <nav aria-label="Primary" className="site-nav">
            <a href="#how" className="site-nav__link">
              How it works
            </a>
            <Link to="/gap-scan" className="site-nav__link">
              Free gap scan
            </Link>
            <Link to={signedIn ? '/app/dashboard' : '/sign-in'} className="site-nav__link">
              {signedIn ? 'Dashboard' : 'Sign in'}
            </Link>
            <ButtonLink to="/demo" variant="bright">
              Book a demo
            </ButtonLink>
          </nav>
        </div>

        <div className="container hero">
          <p className="hero__kicker mono">FDA QMSR · ISO 13485 · ISO 14971 · 21 CFR PART 11</p>
          <h1 className="hero__title">AI agents draft your quality system. Engineers sign off.</h1>
          <p className="hero__lead">
            Tell the agent what you’re building. It drafts the procedures and assessments your device needs, and a Biomedix engineer reviews
            every one before your team approves it.
          </p>

          {resume ? (
            <div className="hero__alt">
              <ButtonLink to="/app/dashboard" variant="bright" size="lg">
                {started ? `Continue with ${intake.device.name || 'your device'}` : 'Go to your dashboard'}
              </ButtonLink>
            </div>
          ) : (
            <form className="hero__ask" onSubmit={begin}>
              <label htmlFor="hero-prompt" className="visually-hidden">
                Describe your device
              </label>
              <textarea
                id="hero-prompt"
                className="hero__prompt"
                value={text}
                maxLength={4000}
                placeholder="Describe your device: what it does, who uses it, and whether it has software, connects to anything or uses AI."
                onChange={(e) => setText(e.target.value)}
              />
              <div className="hero__ask-foot">
                <span className="hero__ask-note">Free to try. No account needed to start.</span>
                <Button type="submit" variant="bright" disabled={!text.trim()}>
                  Start drafting
                </Button>
              </div>
            </form>
          )}

          <div className="hero__alt">
            {!resume && (
              <button
                type="button"
                onClick={() => {
                  loadExample();
                  navigate('/app/dashboard');
                }}
              >
                See it with an example device
              </button>
            )}
            <Link to="/demo">Talk to an engineer first</Link>
          </div>
        </div>
      </header>

      <section id="how" className="container section">
        <h2 className="section-title">Three steps. One of them is yours.</h2>
        <ol className="list-reset steps">
          {STEPS.map((s) => (
            <li key={s.title} className="step">
              <span className="step__who">{s.who}</span>
              <span className="step__title">{s.title}</span>
              <span className="step__body">{s.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="band--mint" aria-labelledby="people-h">
        <div className="container people">
          <div className="stack people__copy">
            <span className="eyebrow">PEOPLE IN THE LOOP</span>
            <h2 id="people-h" className="section-title">
              AI does the drafting. A person is always one click away.
            </h2>
            <p className="lead">
              Nothing an agent writes becomes a released record until an engineer has reviewed it and your approver has signed it.
            </p>
          </div>
          <div className="stack people__cards">
            <Link to="/app/help" className="people__card">
              <strong>Ask an engineer</strong>
              <span>Stuck on a question? Send it from any screen. A Biomedix engineer answers.</span>
              <span className="people__go">Ask a question →</span>
            </Link>
            <Link to="/gap-scan" className="people__card">
              <strong>Free gap scan</strong>
              <span>Already have a trace matrix, risk file or test reports? Send them and get a report, checked by an engineer.</span>
              <span className="people__go">Send your files →</span>
            </Link>
          </div>
        </div>
      </section>

      <section id="start" className="band--white">
        <div className="container cta">
          <h2 className="cta__title">See it on your own device.</h2>
          <div className="cta__actions">
            <ButtonLink to="/demo" variant="primary" size="lg">
              Book a demo
            </ButtonLink>
            <ButtonLink to="/app/dashboard" variant="outline" size="lg">
              Start drafting
            </ButtonLink>
          </div>
        </div>
      </section>

      <footer className="night site-footer">
        <div className="container site-footer__inner">
          <div className="stack site-footer__about">
            <span className="site-footer__brand">Biomedix Engineering</span>
            <p>
              Biomedix provides AI software and engineering review. Your management approves and owns every quality system decision; Biomedix
              engineers sign as technical reviewers, never as approvers. Nothing on this site is regulatory or legal advice.
            </p>
          </div>
          <nav aria-label="Footer" className="site-footer__nav">
            <a href="#how">How it works</a>
            <Link to="/gap-scan">Free gap scan</Link>
            <Link to="/demo">Book a demo</Link>
            <Link to="/sign-in">Sign in</Link>
            <span className="site-footer__copy">© 2026 Biomedix Engineering</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
