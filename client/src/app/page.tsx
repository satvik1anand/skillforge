const workTracks = [
  "Software product",
  "Business / venture",
  "Growth / marketing",
  "Operations / process",
];

const evidenceSignals = [
  {
    label: "Project artifact",
    detail: "A launch brief and operating process",
    state: "Approved",
  },
  {
    label: "Decision record",
    detail: "Audience, channel, and measurement trade-offs",
    state: "Approved",
  },
  {
    label: "Outcome",
    detail: "Campaign iteration with a measurable result",
    state: "Ready to review",
  },
];

const principles = [
  [
    "Work stays at the centre",
    "Start a product, a go-to-market plan, an operating system, or an exploration. The workspace adapts without turning every goal into a coding exercise.",
  ],
  [
    "Evidence precedes a claim",
    "Skill levels are informed by approved work, decisions, and outcomes. AI can draft an evidence card; you decide whether it belongs in your record.",
  ],
  [
    "Sharing is deliberate",
    "When you share, you choose the items, redact what is sensitive, and can expire or revoke the link at any time.",
  ],
];

export default function HomePage() {
  return (
    <main>
      <section className="hero-shell" aria-labelledby="hero-title">
        <nav className="site-nav" aria-label="Primary navigation">
          <a className="brand" href="#top" aria-label="SkillForge home">
            <span className="brand-mark" aria-hidden="true">
              S
            </span>
            <span>SkillForge</span>
          </a>
          <div className="nav-status">
            <span className="status-dot" aria-hidden="true" />
            OpenAI Build Week · in progress
          </div>
        </nav>

        <div className="hero-grid" id="top">
          <div className="hero-copy">
            <p className="eyebrow">A workspace for work that matters</p>
            <h1 id="hero-title">Turn real work into a Skill Portfolio.</h1>
            <p className="hero-intro">
              SkillForge turns the work you are already doing into a clear,
              evidence-backed record of your growing capabilities.
            </p>

            <div className="track-list" aria-label="Supported ways of working">
              {workTracks.map((track) => (
                <span key={track}>{track}</span>
              ))}
            </div>

            <div className="hero-actions">
              <a className="button button-primary" href="/signup">
                Start a workspace
                <span aria-hidden="true">→</span>
              </a>
              <a className="button button-quiet" href="#sharing">
                How sharing works
              </a>
            </div>

            <p className="hero-note">
              No self-scored profile. No public claim is created without your
              review.
            </p>
          </div>

          <div className="workspace-preview" aria-label="Illustrative SkillForge workspace preview">
            <div className="preview-topline">
              <span>Project brief</span>
              <span className="draft-pill">Draft</span>
            </div>
            <div className="preview-title-row">
              <div>
                <p className="preview-kicker">Growth system</p>
                <h2>Community launch loop</h2>
              </div>
              <span className="more-mark" aria-hidden="true">
                ···
              </span>
            </div>
            <p className="preview-summary">
              Design and test a repeatable acquisition loop for an early-stage
              product.
            </p>

            <div className="preview-divider" />

            <div className="preview-section-heading">
              <span>Evidence in this project</span>
              <span>3 items</span>
            </div>
            <div className="evidence-list">
              {evidenceSignals.map((signal) => (
                <div className="evidence-row" key={signal.label}>
                  <span className="evidence-icon" aria-hidden="true">
                    ↗
                  </span>
                  <div>
                    <strong>{signal.label}</strong>
                    <p>{signal.detail}</p>
                  </div>
                  <span
                    className={
                      signal.state === "Approved"
                        ? "evidence-state approved"
                        : "evidence-state"
                    }
                  >
                    {signal.state}
                  </span>
                </div>
              ))}
            </div>

            <div className="skill-snapshot">
              <div>
                <p>Overview skill</p>
                <strong>Social media marketing</strong>
              </div>
              <div className="skill-state">
                <span>Intermediate</span>
                <small>Unverified estimate</small>
              </div>
            </div>
            <p className="snapshot-caption">
              An overview level is based on approved evidence. Add a relevant
              repository, credential, ranked assessment, or public-safe case
              study to make it proof-linked.
            </p>
          </div>
        </div>
      </section>

      <section className="story-section" id="how-it-works" aria-labelledby="workflow-title">
        <div className="section-intro">
          <p className="eyebrow">A portfolio that starts with the work</p>
          <h2 id="workflow-title">From a live project to a portfolio you control.</h2>
        </div>
        <ol className="workflow">
          <li>
            <span>01</span>
            <h3>Define a project</h3>
            <p>Capture the outcome, constraints, and context that make this work meaningful.</p>
          </li>
          <li>
            <span>02</span>
            <h3>Collect evidence</h3>
            <p>Review the artifacts, decisions, and outcomes worth keeping.</p>
          </li>
          <li>
            <span>03</span>
            <h3>Link proof when ready</h3>
            <p>Connect public or public-safe proof to move from an unverified estimate to a proof-linked record.</p>
          </li>
          <li>
            <span>04</span>
            <h3>Share selectively</h3>
            <p>Publish only the selected snapshot. Keep chats, notes, and sensitive context under your control.</p>
          </li>
        </ol>
      </section>

      <section className="principles-section" id="sharing" aria-labelledby="principles-title">
        <div className="principles-heading">
          <p className="eyebrow">Designed for credible progress</p>
          <h2 id="principles-title">Calm enough for daily work. Rigorous enough to stand behind.</h2>
        </div>
        <div className="principle-grid">
          {principles.map(([title, description], index) => (
            <article className="principle-card" key={title}>
              <span className="principle-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="share-section" id="skill-portfolio" aria-labelledby="record-title">
        <div className="record-copy">
          <p className="eyebrow">A shareable Skill Portfolio</p>
          <h2 id="record-title">A publication snapshot, not an open window into your workspace.</h2>
          <p>
            Choose the evidence that tells the story. Preview it, remove what
            is not for sharing, and retain the right to revoke it later.
          </p>
        </div>
        <div className="record-card">
          <div className="record-header">
            <span className="mini-brand">SkillForge</span>
            <span className="record-visibility">Unlisted · selected evidence</span>
          </div>
          <h3>Community launch loop</h3>
          <p className="record-summary">A concise evidence record for an outcome-focused growth project.</p>
          <div className="record-evidence">
            <span>✓ Launch brief</span>
            <span>✓ Decision log</span>
            <span>✓ Campaign outcome</span>
          </div>
          <div className="record-footer">
            <span>Expires when you choose</span>
            <span aria-hidden="true">↗</span>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand" href="#top">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SkillForge</span>
        </a>
        <p>Your work, shared on your terms.</p>
      </footer>
    </main>
  );
}
