"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { BuildCompanion } from "@/components/workspace/build-companion";
import { ApiConfigurationError, apiFetch } from "@/lib/api";
import {
  evidenceStatusLabel,
  isEvidenceCard,
  type EvidenceCard,
  type EvidenceContribution,
} from "@/lib/evidence-card";
import {
  contextPackLabels,
  isBuildBrief,
  type BuildBrief,
} from "@/lib/build-brief";
import {
  readBuildSkillOverviewResponse,
  skillEstimateBasisLabel,
  skillLevelLabel,
  skillProofStatusLabel,
  type BuildSkillOverviewItem,
} from "@/lib/build-skill-overview";
import { isSupabaseAuthConfigured } from "@/lib/supabase/client";

import styles from "./build-workspace.module.css";

type BuildWorkspaceState =
  | { kind: "loading" }
  | { kind: "configuration" | "unauthenticated" | "unavailable"; message: string }
  | {
      kind: "ready";
      build: BuildBrief;
      evidence: EvidenceCard[];
      skillProfiles: BuildSkillOverviewItem[];
    };

type EvidenceDraft = {
  claimSummary: string;
  contribution: EvidenceContribution;
  roleStatement: string;
  sourceLabel: string;
  sourceExcerpt: string;
};

const initialEvidenceDraft: EvidenceDraft = {
  claimSummary: "",
  contribution: "individual",
  roleStatement: "",
  sourceLabel: "",
  sourceExcerpt: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBuildResponse(payload: unknown): BuildBrief | undefined {
  if (!isRecord(payload) || !isRecord(payload.data) || !isBuildBrief(payload.data.buildBrief)) {
    return undefined;
  }

  return payload.data.buildBrief;
}

function readEvidenceListResponse(payload: unknown): EvidenceCard[] | undefined {
  if (
    !isRecord(payload)
    || !isRecord(payload.data)
    || !Array.isArray(payload.data.items)
    || !payload.data.items.every(isEvidenceCard)
  ) {
    return undefined;
  }

  return payload.data.items;
}

function readEvidenceCardResponse(payload: unknown): EvidenceCard | undefined {
  if (
    !isRecord(payload)
    || !isRecord(payload.data)
    || !isEvidenceCard(payload.data.evidenceCard)
  ) {
    return undefined;
  }

  return payload.data.evidenceCard;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function requestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // The server only uses this key for deduplication. A timestamp-plus-random
  // fallback is sufficient for browsers without randomUUID support.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function BuildWorkspacePage() {
  const params = useParams<{ id?: string | string[] }>();
  const buildId = typeof params.id === "string" ? params.id : "";
  const [state, setState] = useState<BuildWorkspaceState>({ kind: "loading" });
  const [draft, setDraft] = useState<EvidenceDraft>(initialEvidenceDraft);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSavingEvidence, setIsSavingEvidence] = useState(false);
  const [busyEvidenceId, setBusyEvidenceId] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!buildId) {
      setState({
        kind: "unavailable",
        message: "This project address is incomplete. Return to your workspace and choose a project.",
      });
      return;
    }

    if (!isSupabaseAuthConfigured() || !process.env.NEXT_PUBLIC_API_URL?.trim()) {
      setState({
        kind: "configuration",
        message: "This project is temporarily unavailable. Please try again shortly.",
      });
      return;
    }

    setState({ kind: "loading" });

    try {
      const [buildResponse, evidenceResponse, skillOverviewResponse] = await Promise.all([
        apiFetch(`/api/v1/builds/${buildId}`, { cache: "no-store" }),
        apiFetch(`/api/v1/builds/${buildId}/evidence-cards`, { cache: "no-store" }),
        apiFetch(`/api/v1/builds/${buildId}/skill-overview`, { cache: "no-store" }),
      ]);

      if (buildResponse.status === 401 || buildResponse.status === 403 || evidenceResponse.status === 401 || evidenceResponse.status === 403 || skillOverviewResponse.status === 401 || skillOverviewResponse.status === 403) {
        setState({
          kind: "unauthenticated",
          message: "Sign in again to open this project.",
        });
        return;
      }

      if (buildResponse.status === 404 || evidenceResponse.status === 404) {
        setState({
          kind: "unavailable",
          message: "This project is not available in your account.",
        });
        return;
      }

      if (!buildResponse.ok || !evidenceResponse.ok) {
        setState({
          kind: "unavailable",
          message: "The project workspace could not be loaded. Your existing records have not been changed.",
        });
        return;
      }

      const build = readBuildResponse(await buildResponse.json());
      const evidence = readEvidenceListResponse(await evidenceResponse.json());
      if (!build || !evidence) {
        setState({
          kind: "unavailable",
          message: "We could not load this project right now. Please try again.",
        });
        return;
      }

      const skillProfiles = skillOverviewResponse.ok
        ? readBuildSkillOverviewResponse(await skillOverviewResponse.json()) ?? []
        : [];
      setState({ kind: "ready", build, evidence, skillProfiles });
    } catch (error) {
      setState({
        kind: error instanceof ApiConfigurationError ? "unauthenticated" : "unavailable",
        message: error instanceof ApiConfigurationError
          ? "Sign in to open this project."
          : "We could not load this project right now. Please try again.",
      });
    }
  }, [buildId]);

  const refreshSkillOverview = useCallback(async () => {
    if (!buildId) {
      return;
    }

    try {
      const response = await apiFetch(`/api/v1/builds/${buildId}/skill-overview`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }

      const skillProfiles = readBuildSkillOverviewResponse(await response.json());
      if (!skillProfiles) {
        return;
      }

      setState((current) => current.kind === "ready"
        ? { ...current, skillProfiles }
        : current);
    } catch {
      // The persisted overview remains authoritative. A transient refresh must
      // not replace it with a client-side inferred level.
    }
  }, [buildId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const updateDraft = <Key extends keyof EvidenceDraft>(key: Key, value: EvidenceDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const createEvidence = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage(null);

    const claimSummary = draft.claimSummary.trim();
    const sourceLabel = draft.sourceLabel.trim();
    const sourceExcerpt = draft.sourceExcerpt.trim();
    const roleStatement = draft.roleStatement.trim();

    if (!claimSummary || !sourceLabel || !sourceExcerpt) {
      setFormMessage("Add a concise summary and a source label and excerpt before saving evidence.");
      return;
    }

    if (draft.contribution === "team" && !roleStatement) {
      setFormMessage("Add your role for team evidence so the record does not overstate your contribution.");
      return;
    }

    setIsSavingEvidence(true);
    try {
      const response = await apiFetch(`/api/v1/builds/${buildId}/evidence-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimSummary,
          contribution: draft.contribution,
          ...(roleStatement ? { roleStatement } : {}),
          source: { label: sourceLabel, excerpt: sourceExcerpt },
          idempotencyKey: requestId(),
        }),
      });

      if (!response.ok) {
        setFormMessage(
          response.status === 401 || response.status === 403
            ? "Your session needs another sign-in before evidence can be saved."
            : "Evidence was not saved. Check the fields and try again.",
        );
        return;
      }

      const evidenceCard = readEvidenceCardResponse(await response.json());
      if (!evidenceCard) {
        setFormMessage("We could not confirm that evidence was saved. Refresh before trying again.");
        return;
      }

      setState((current) => current.kind === "ready"
        ? {
            ...current,
            evidence: [
              evidenceCard,
              ...current.evidence.filter((existing) => existing.id !== evidenceCard.id),
            ],
          }
        : current);
      setDraft(initialEvidenceDraft);
      setFormMessage("Evidence saved as suggested. Review it deliberately; it has not changed any skill estimate.");
    } catch (error) {
      setFormMessage(
        error instanceof ApiConfigurationError
          ? "Sign in again before saving evidence."
          : "We could not save your evidence right now. Please try again.",
      );
    } finally {
      setIsSavingEvidence(false);
    }
  };

  const transitionEvidence = async (
    evidenceCard: EvidenceCard,
    action: "confirm" | "dismiss" | "revoke",
  ) => {
    if (action === "revoke" && !window.confirm("Revoke this evidence record? It will no longer support a future assessment.")) {
      return;
    }

    setBusyEvidenceId(evidenceCard.id);
    setFormMessage(null);

    try {
      const response = await apiFetch(
        action === "revoke"
          ? `/api/v1/builds/${buildId}/evidence-cards/${evidenceCard.id}/revoke`
          : `/api/v1/builds/${buildId}/evidence-cards/${evidenceCard.id}`,
        {
          method: action === "revoke" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "revoke" ? {} : { action }),
        },
      );

      if (!response.ok) {
        setFormMessage(
          response.status === 409
            ? "This evidence record changed before the action completed. Refresh and review its current state."
            : "The evidence action was not completed. Your records have not been assumed to change.",
        );
        return;
      }

      const updated = readEvidenceCardResponse(await response.json());
      if (!updated) {
        setFormMessage("We could not confirm that evidence was updated. Refresh before making another change.");
        return;
      }

      setState((current) => current.kind === "ready"
        ? {
            ...current,
            evidence: current.evidence.map((existing) => existing.id === updated.id ? updated : existing),
          }
        : current);
    } catch (error) {
      setFormMessage(
        error instanceof ApiConfigurationError
          ? "Sign in again before updating evidence."
          : "We could not update that evidence right now. Please try again.",
      );
    } finally {
      setBusyEvidenceId(null);
    }
  };

  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Project workspace navigation">
        <Link className="brand" href="/" aria-label="SkillForge home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SkillForge</span>
        </Link>
        <Link className={styles.backLink} href="/workspace">Your projects</Link>
      </nav>

      {state.kind === "loading" ? (
        <section className={styles.statusPanel} aria-live="polite">
          <span className={styles.loadingMark} aria-hidden="true" />
          <div><h1>Opening your project</h1><p>Loading your project details.</p></div>
        </section>
      ) : null}

      {state.kind === "configuration" || state.kind === "unauthenticated" || state.kind === "unavailable" ? (
        <section className={styles.statusPanel} aria-live="polite">
          <div className={styles.statusIcon} aria-hidden="true">i</div>
          <div>
            <h1>{state.kind === "unauthenticated" ? "Sign in to open this project" : "This project is not available"}</h1>
            <p>{state.message}</p>
            <div className={styles.statusActions}>
              {state.kind === "unauthenticated" ? <Link className="button button-primary" href="/login">Sign in</Link> : null}
              <Link className="button button-quiet" href="/workspace">Back to your projects</Link>
              {state.kind === "unavailable" ? <button className="button button-quiet" onClick={() => void loadWorkspace()} type="button">Try again</button> : null}
            </div>
          </div>
        </section>
      ) : null}

      {state.kind === "ready" ? (
        <BuildWorkspace
          build={state.build}
          busyEvidenceId={busyEvidenceId}
          draft={draft}
          evidence={state.evidence}
          formMessage={formMessage}
          isSavingEvidence={isSavingEvidence}
          onDraftChange={updateDraft}
          onEvidenceAction={transitionEvidence}
          onEvidenceCreate={createEvidence}
          onSkillProfilesChanged={refreshSkillOverview}
          skillProfiles={state.skillProfiles}
        />
      ) : null}
    </main>
  );
}

type BuildWorkspaceProps = {
  build: BuildBrief;
  evidence: EvidenceCard[];
  skillProfiles: BuildSkillOverviewItem[];
  draft: EvidenceDraft;
  formMessage: string | null;
  isSavingEvidence: boolean;
  busyEvidenceId: string | null;
  onDraftChange: <Key extends keyof EvidenceDraft>(key: Key, value: EvidenceDraft[Key]) => void;
  onEvidenceCreate: (event: React.FormEvent<HTMLFormElement>) => void;
  onEvidenceAction: (evidenceCard: EvidenceCard, action: "confirm" | "dismiss" | "revoke") => void;
  onSkillProfilesChanged: () => void;
};

const workspaceTabs = [
  { key: "overview", label: "Overview" },
  { key: "assist", label: "AI Assist" },
  { key: "evidence", label: "Evidence" },
] as const;

type WorkspaceTab = (typeof workspaceTabs)[number]["key"];

function BuildWorkspace({
  build,
  evidence,
  skillProfiles,
  draft,
  formMessage,
  isSavingEvidence,
  busyEvidenceId,
  onDraftChange,
  onEvidenceCreate,
  onEvidenceAction,
  onSkillProfilesChanged,
}: BuildWorkspaceProps) {
  const formId = useId();
  const tabSetId = useId();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % workspaceTabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + workspaceTabs.length) % workspaceTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = workspaceTabs.length - 1;
    }

    if (nextIndex === undefined) {
      return;
    }

    event.preventDefault();
    setActiveTab(workspaceTabs[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      <header className={styles.hero}>
        <p className="eyebrow">{contextPackLabels[build.primaryContextPack]}</p>
        <h1>{build.title}</h1>
        <p>{build.outcome}</p>
        <span className={styles.updated}>Updated {formatDate(build.updatedAt)}</span>
      </header>

      <div className={styles.workspaceLayout}>
        <section className={styles.contentColumn} aria-label="Project workspace">
          <div className={styles.tabList} aria-label="Project workspace sections" role="tablist">
            {workspaceTabs.map((tab, index) => {
              const isActive = activeTab === tab.key;
              const tabId = `${tabSetId}-${tab.key}-tab`;
              const panelId = `${tabSetId}-${tab.key}-panel`;

              return (
                <button
                  aria-controls={panelId}
                  aria-selected={isActive}
                  className={styles.tabButton}
                  data-active={isActive}
                  id={tabId}
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  type="button"
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "overview" ? (
            <section
              aria-labelledby={`${tabSetId}-overview-tab`}
              className={styles.tabPanel}
              id={`${tabSetId}-overview-panel`}
              role="tabpanel"
              tabIndex={0}
            >
              <div className={styles.tabHeading}>
                <p className="eyebrow">Project overview</p>
                <h2>Keep the outcome and skills in view</h2>
                <p>Use this space to ground each decision in the work this project is meant to achieve.</p>
              </div>
              <section className={styles.briefPanel} aria-labelledby={`${tabSetId}-brief-title`}>
            <div className={styles.panelTopline}><span id={`${tabSetId}-brief-title`}>Project brief</span><span>{build.status}</span></div>
            <p>{build.outcome}</p>
            <small>The brief sets working context. It is useful direction, not proof of proficiency.</small>
          </section>
              <section className={styles.overviewSkills} aria-labelledby={`${tabSetId}-skills-title`}>
                <div className={styles.sectionHeading}>
                  <div>
                    <p className="eyebrow">Skill Portfolio</p>
                    <h2 id={`${tabSetId}-skills-title`}>Skills reflected in this project</h2>
                  </div>
                  <span>{skillProfiles.length} {skillProfiles.length === 1 ? "skill" : "skills"}</span>
                </div>
                <p className={styles.sectionIntro}>These estimates can grow from your work in the project. They remain unverified until supported by relevant proof.</p>
                {skillProfiles.length > 0 ? (
                  <div className={styles.skillCards}>
                    {skillProfiles.map((profile) => (
                      <article className={styles.skillCard} key={profile.capabilityId}>
                        <span>{skillEstimateBasisLabel(profile.assessmentBasis)}</span>
                        <h3>{profile.capabilityName}</h3>
                        <div><strong>{skillLevelLabel(profile.level)}</strong><small>{skillProofStatusLabel(profile.proofStatus)}</small></div>
                      </article>
                    ))}
                  </div>
                ) : <EmptySkillsState />}
              </section>
            </section>
          ) : null}

          {activeTab === "assist" ? (
            <section
              aria-labelledby={`${tabSetId}-assist-tab`}
              className={styles.tabPanel}
              id={`${tabSetId}-assist-panel`}
              role="tabpanel"
              tabIndex={0}
            >
              <div className={styles.assistNote}>
                <p>Ask through the decisions, constraints, and next steps in this project. Any skill inference stays unverified until you later add proof.</p>
              </div>
              <BuildCompanion
                buildId={build.id}
                buildTitle={build.title}
                onSkillProfilesChanged={onSkillProfilesChanged}
              />
            </section>
          ) : null}

          {activeTab === "evidence" ? (
            <section
              aria-labelledby={`${tabSetId}-evidence-tab`}
              className={styles.tabPanel}
              id={`${tabSetId}-evidence-panel`}
              role="tabpanel"
              tabIndex={0}
            >
          <section className={styles.evidenceSection}>
            <div className={styles.sectionHeading}>
              <div><p className="eyebrow">Evidence</p><h2 id={`${tabSetId}-evidence-title`}>Evidence that travels with your work</h2></div>
              <span>{evidence.length} {evidence.length === 1 ? "record" : "records"}</span>
            </div>
            <p className={styles.sectionIntro}>Save a concrete source and your contribution while the work is fresh. New records remain suggested until you confirm them; later, you can attach relevant proof for a shareable claim.</p>

            <form className={styles.evidenceForm} onSubmit={onEvidenceCreate}>
              <div className={styles.formHeading}><h3>Add evidence</h3><span>Suggested first</span></div>
              <label htmlFor={`${formId}-summary`}>
                <span>What did you do or learn?</span>
                <textarea id={`${formId}-summary`} maxLength={4000} onChange={(event) => onDraftChange("claimSummary", event.target.value)} placeholder="e.g. Designed and tested a first onboarding flow for three target users." required rows={3} value={draft.claimSummary} />
              </label>
              <fieldset className={styles.contributionFieldset}>
                <legend>Contribution</legend>
                <label><input checked={draft.contribution === "individual"} name={`${formId}-contribution`} onChange={() => onDraftChange("contribution", "individual")} type="radio" /> Individual</label>
                <label><input checked={draft.contribution === "team"} name={`${formId}-contribution`} onChange={() => onDraftChange("contribution", "team")} type="radio" /> Team</label>
              </fieldset>
              {draft.contribution === "team" ? (
                <label htmlFor={`${formId}-role`}>
                  <span>Your role <em>required for team work</em></span>
                  <input id={`${formId}-role`} maxLength={2000} onChange={(event) => onDraftChange("roleStatement", event.target.value)} placeholder="e.g. I led the research synthesis and presented the decision." required value={draft.roleStatement} />
                </label>
              ) : null}
              <div className={styles.sourceFields}>
                <label htmlFor={`${formId}-source-label`}>
                  <span>Source label</span>
                  <input id={`${formId}-source-label`} maxLength={240} onChange={(event) => onDraftChange("sourceLabel", event.target.value)} placeholder="Research notes, 21 Jul" required value={draft.sourceLabel} />
                </label>
                <label htmlFor={`${formId}-source-excerpt`}>
                  <span>Source excerpt</span>
                  <textarea id={`${formId}-source-excerpt`} maxLength={8000} onChange={(event) => onDraftChange("sourceExcerpt", event.target.value)} placeholder="Record the specific decision, observation, or result this evidence comes from." required rows={3} value={draft.sourceExcerpt} />
                </label>
              </div>
              <div className={styles.formFooter}>
                <p>Use a factual source. You can link a public repository, certificate, rank, or permitted case study later for stronger proof.</p>
                <button className="button button-primary" disabled={isSavingEvidence} type="submit">{isSavingEvidence ? "Saving..." : "Save as suggested"}</button>
              </div>
              {formMessage ? <p className={styles.formMessage} role="status">{formMessage}</p> : null}
            </form>

            <div className={styles.evidenceList} aria-live="polite">
              {evidence.length === 0 ? <EmptyEvidenceState /> : evidence.map((evidenceCard) => (
                <EvidenceItem
                  busy={busyEvidenceId === evidenceCard.id}
                  evidenceCard={evidenceCard}
                  key={evidenceCard.id}
                  onAction={onEvidenceAction}
                />
              ))}
            </div>
            <div className={styles.estimateSummary}>
              {skillProfiles.length === 0
                ? "No project-relevant estimates are available yet."
                : "Chat can raise only unverified levels; proof is required before a claim is verified."}
            </div>
              </section>
            </section>
          ) : null}
        </section>

        <aside className={styles.rightRail} aria-label="Project overview">
          <section className={styles.portfolioPanel}>
            <div className={styles.railHeading}>
              <p>Skill Portfolio</p>
              <span>{skillProfiles.length}</span>
            </div>
            {skillProfiles.length > 0 ? (
              <div className={styles.portfolioList}>
                {skillProfiles.map((profile) => (
                  <div key={profile.capabilityId}>
                    <span>{profile.capabilityName}</span>
                    <strong>{skillLevelLabel(profile.level)}</strong>
                    <small>{skillProofStatusLabel(profile.proofStatus)} · {skillEstimateBasisLabel(profile.assessmentBasis)}</small>
                  </div>
                ))}
              </div>
            ) : <p className={styles.railEmpty}>No skill estimates are available yet.</p>}
            <small className={styles.railNote}>Levels can be inferred from project work. Relevant proof is still needed for verification.</small>
          </section>

          <section className={styles.contextPanel}>
            <p>Project context</p>
            <dl>
              <div><dt>Focus</dt><dd>{contextPackLabels[build.primaryContextPack]}</dd></div>
              <div><dt>Stage</dt><dd>{build.status}</dd></div>
              <div><dt>Evidence</dt><dd>{evidence.length} {evidence.length === 1 ? "record" : "records"}</dd></div>
              <div><dt>Updated</dt><dd>{formatDate(build.updatedAt)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function EmptySkillsState() {
  return (
    <section className={styles.emptySkills}>
      <span aria-hidden="true">◌</span>
      <div>
        <h3>Skills will take shape as you work</h3>
        <p>Use AI Assist or record concrete work to begin collecting project-relevant signals.</p>
      </div>
    </section>
  );
}

function EmptyEvidenceState() {
  return (
    <section className={styles.emptyEvidence}>
      <span aria-hidden="true">+</span>
      <div><h3>No evidence records yet</h3><p>Start with one decision, result, observation, or deliverable you can accurately describe and source.</p></div>
    </section>
  );
}

function EvidenceItem({
  evidenceCard,
  busy,
  onAction,
}: {
  evidenceCard: EvidenceCard;
  busy: boolean;
  onAction: (evidenceCard: EvidenceCard, action: "confirm" | "dismiss" | "revoke") => void;
}) {
  const primarySource = evidenceCard.sources[0];
  const canRevoke = evidenceCard.status === "confirmed" || evidenceCard.status === "linked" || evidenceCard.status === "outcome_supported";

  return (
    <article className={styles.evidenceItem}>
      <div className={styles.itemTopline}><span className={styles.statusPill} data-status={evidenceCard.status}>{evidenceStatusLabel(evidenceCard.status)}</span><time dateTime={evidenceCard.createdAt}>{formatDate(evidenceCard.createdAt)}</time></div>
      <h3>{evidenceCard.claimSummary}</h3>
      <p className={styles.contribution}>{evidenceCard.contribution === "team" ? `Team work · ${evidenceCard.roleStatement}` : "Individual contribution"}</p>
      {primarySource ? <div className={styles.source}><strong>{primarySource.label}</strong>{primarySource.excerpt ? <p>{primarySource.excerpt}</p> : null}</div> : null}
      {evidenceCard.status === "confirmed" ? <p className={styles.trustNote}>Confirmed in your record. This is still unverified and not share-ready.</p> : null}
      {evidenceCard.status === "revoked" && evidenceCard.revocationReason ? <p className={styles.trustNote}>Revoked: {evidenceCard.revocationReason}</p> : null}
      {evidenceCard.status === "suggested" || canRevoke ? (
        <div className={styles.itemActions}>
          {evidenceCard.status === "suggested" ? <><button className="button button-primary" disabled={busy} onClick={() => onAction(evidenceCard, "confirm")} type="button">{busy ? "Saving…" : "Confirm for record"}</button><button className="button button-quiet" disabled={busy} onClick={() => onAction(evidenceCard, "dismiss")} type="button">Dismiss</button></> : null}
          {canRevoke ? <button className="button button-quiet" disabled={busy} onClick={() => onAction(evidenceCard, "revoke")} type="button">{busy ? "Saving…" : "Revoke"}</button> : null}
        </div>
      ) : null}
    </article>
  );
}
