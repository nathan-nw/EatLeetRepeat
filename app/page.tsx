import Link from 'next/link';
import './landing.css';

const repeatSolves = [
  { number: '01', label: 'First solve', date: 'Mar 04' },
  { number: '02', label: 'Came back', date: 'Mar 18' },
  { number: '03', label: 'Solved it again', date: 'Apr 02' },
];

const features = [
  { number: '01', title: 'The full timeline', body: 'See your accepted submissions in order. The second solve gets its own entry, right where it belongs.' },
  { number: '02', title: 'Your repeat list', body: 'Find the problems you keep returning to, and see exactly how many times you solved each one.' },
  { number: '03', title: 'The big picture', body: 'A heatmap makes your practice days easy to spot, from busy weeks to quiet stretches.' },
];

// Illustrative data, not a user's activity. Fixed values keep the preview stable.
const previewWeeks = Array.from({ length: 36 }, (_, week) =>
  Array.from({ length: 7 }, (_, day) => {
    if (week === 6 || week === 13) return day === 3 ? 1 : 0;
    const score = (week * 5 + day * 3) % 9;
    return day === 0 || day === 6 ? (score > 6 ? 1 : 0) : Math.min(3, Math.floor(score / 2));
  }),
);

function PreviewHeatmapGrid() {
  return (
    <div className="landing-heatmap-grid">
      {previewWeeks.map((week, weekIndex) => (
        <div className="landing-heatmap-week" key={weekIndex}>
          {week.map((level, dayIndex) => <span className={'landing-heatmap-cell level-' + level} key={dayIndex} />)}
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <div className="landing-shell landing-nav-inner">
          <Link href="/" className="landing-brand" aria-label="Eat Leet Repeat home">
            <span>Eat Leet Repeat</span>
          </Link>
          <nav className="landing-nav-actions" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <Link href="/login" className="landing-nav-signin">Sign in <span aria-hidden="true">↗</span></Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero landing-shell">
        <div className="landing-hero-copy">
          <p className="landing-kicker">Your LeetCode practice, over time</p>
          <h1>You solved it.<br />Then you solved it <em>again.</em></h1>
          <p className="landing-hero-description">
            Add your public LeetCode handle. Recent accepted submissions show up on a timeline,
            including the second and third time you solve the same problem.
          </p>
          <div className="landing-hero-actions">
            <Link href="/login" className="landing-button landing-button-primary">Start tracking <span aria-hidden="true">↗</span></Link>
            <a href="#features-heading" className="landing-text-link">See what you get <span aria-hidden="true">↓</span></a>
          </div>
          <p className="landing-hero-note">Just your public LeetCode handle. No manual logging.</p>
        </div>

        <div className="landing-hero-art" id="preview">
          <div className="landing-preview-card">
            <div className="landing-preview-topline">
              <span className="landing-preview-label">Problem history</span>
            </div>
            <div className="landing-preview-heading">
              <div>
                <p className="landing-preview-overline">PROBLEM 001</p>
                <h2>Two Sum</h2>
              </div>
              <span className="landing-repeat-stamp">3 solves</span>
            </div>
            <ol className="landing-repeat-list">
              {repeatSolves.map((solve) => (
                <li key={solve.number}>
                  <span className="landing-repeat-number">{solve.number}</span>
                  <span className="landing-repeat-name">{solve.label}</span>
                  <span className="landing-repeat-date">{solve.date}</span>
                  <span className="landing-repeat-check" aria-label="Accepted">✓</span>
                </li>
              ))}
            </ol>
            <div className="landing-preview-bottom">
              <span>Three accepted submissions</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features" aria-labelledby="features-heading">
        <div className="landing-shell">
          <div className="landing-section-heading">
            <p className="landing-section-label">What you get</p>
            <h2 id="features-heading">A solved count leaves a lot out.</h2>
            <p>See the work behind the number.</p>
          </div>
          <div className="landing-feature-grid">
            {features.map((feature) => (
              <article className="landing-feature" key={feature.number}>
                <span className="landing-feature-number">{feature.number}<span aria-hidden="true"> /</span></span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
          <div className="landing-heatmap-panel">
            <div className="landing-heatmap-copy">
              <span className="landing-preview-overline">Activity over time</span>
              <h3>See the days you put in.</h3>
              <p>Your activity heatmap shows each day with an accepted solve. Open a day to see what you worked on.</p>
            </div>
            <div className="landing-heatmap-wrap" role="img" aria-label="Animated preview of an activity heatmap">
              <div className="landing-heatmap-track" aria-hidden="true">
                <PreviewHeatmapGrid />
                <PreviewHeatmapGrid />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-setup landing-shell" id="how-it-works" aria-labelledby="setup-heading">
        <div className="landing-section-heading">
          <p className="landing-section-label">Getting started</p>
          <h2 id="setup-heading">Connect once. Keep solving.</h2>
        </div>
        <div className="landing-setup-grid">
          <div className="landing-setup-step"><span>01</span><h3>Add your handle</h3><p>Enter your public LeetCode username. We never need your LeetCode password.</p></div>
          <div className="landing-setup-step"><span>02</span><h3>Go solve something</h3><p>Recent accepted submissions are picked up automatically, including repeat solves.</p></div>
          <div className="landing-setup-step"><span>03</span><h3>Bring your history</h3><p>Want older solves too? Import them when you’re ready. It’s optional.</p></div>
        </div>
        <details className="landing-import-details">
          <summary>How does the optional import work? <span aria-hidden="true">+</span></summary>
          <p>The public LeetCode feed only shows recent submissions. For older ones, the app provides a script you can review and run in your own browser. It downloads a file for you to upload; it does not read your password or send anything automatically.</p>
        </details>
      </section>

      <section className="landing-cta-section">
        <div className="landing-shell landing-cta">
          <div>
            <p className="landing-section-label">Start tracking</p>
            <h2>See what you’ve been working on.</h2>
          </div>
          <Link href="/login" className="landing-button landing-button-dark">Start tracking <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer-inner">
          <span>Eat Leet Repeat</span>
          <span>Made by <a href="https://github.com/nathan-nw" target="_blank" rel="noopener noreferrer">@nathan-nw</a></span>
          <a href="https://x.com/Nathan_nww" target="_blank" rel="noopener noreferrer">Find me on X ↗</a>
        </div>
      </footer>
    </main>
  );
}
