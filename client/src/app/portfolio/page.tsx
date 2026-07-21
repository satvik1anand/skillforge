"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ApiConfigurationError, apiFetch } from "@/lib/api";
import {
  isBuildBrief,
  type BuildBrief,
} from "@/lib/build-brief";
import {
  readBuildSkillOverviewResponse,
  skillEstimateBasisLabel,
  skillLevelLabel,
  skillProofStatusLabel,
  type BuildSkillOverviewItem,
  type SkillEstimateBasis,
  type SkillLevel,
  type SkillProofStatus,
} from "@/lib/build-skill-overview";
import {
  createSupabaseBrowserClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/client";

import styles from "./portfolio.module.css";

type PortfolioState =
  | { kind: "loading" }
  | { kind: "configuration" | "unauthenticated" | "unavailable"; message: string }
  | {
      kind: "ready";
      builds: BuildBrief[];
      skills: PortfolioSkill[];
      unavailableProjectCount: number;
    };

type SkillProjectContribution = {
  buildId: string;
  buildTitle: string;
  level: SkillLevel;
  proofStatus: SkillProofStatus;
  assessmentBasis: SkillEstimateBasis;
};

type PortfolioSkill = {
  capabilitySlug: string;
  capabilityName: string;
  level: SkillLevel;
  contributions: SkillProjectContribution[];
};

type OverviewLoadResult =
  | { kind: "ready"; build: BuildBrief; profiles: BuildSkillOverviewItem[] }
  | { kind: "unauthenticated" }
  | { kind: "unavailable"; buildId: string };

type VerificationSummary = {
  label: string;
  detail: string;
  tone: "unverified" | "linked" | "validated" | "verified" | "mixed";
};

const levelRank: Record<SkillLevel, number> = {
  not_yet_assessed: 0,
  novice: 1,
  beginner: 2,
  intermediate: 3,
  advanced: 4,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBuildsResponse(payload: unknown): BuildBrief[] | undefined {
  let items: unknown;

  if (Array.isArray(payload)) {
    items = payload;
  } else if (isRecord(payload) && Array.isArray(payload.builds)) {
    items = payload.builds;
  } else if (isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.items)) {
    items = payload.data.items;
  }

  return Array.isArray(items) && items.every(isBuildBrief) ? items : undefined;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function aggregateSkills(results: readonly Extract<OverviewLoadResult, { kind: "ready" }>[]): PortfolioSkill[] {
  const skillsBySlug = new Map<string, PortfolioSkill>();

  for (const result of results) {
    for (const profile of result.profiles) {
      const existing = skillsBySlug.get(profile.capabilitySlug);
      const contribution: SkillProjectContribution = {
        buildId: result.build.id,
        buildTitle: result.build.title,
        level: profile.level,
        proofStatus: profile.proofStatus,
        assessmentBasis: profile.assessmentBasis,
      };

      if (!existing) {
        skillsBySlug.set(profile.capabilitySlug, {
          capabilitySlug: profile.capabilitySlug,
          capabilityName: profile.capabilityName,
          level: profile.level,
          contributions: [contribution],
        });
        continue;
      }

      existing.contributions.push(contribution);
      if (levelRank[profile.level] > levelRank[existing.level]) {
        existing.level = profile.level;
      }
    }
  }

  return Array.from(skillsBySlug.values())
    .map((skill) => ({
      ...skill,
      contributions: [...skill.contributions].sort((left, right) => left.buildTitle.localeCompare(right.buildTitle)),
    }))
    .sort((left, right) => (
      levelRank[right.level] - levelRank[left.level]
      || right.contributions.length - left.contributions.length
      || left.capabilityName.localeCompare(right.capabilityName)
    ));
}

function verificationSummary(contributions: readonly SkillProjectContribution[]): VerificationSummary {
  const independentlyVerified = contributions.filter((item) => item.proofStatus === "independently_verified").length;
  const sourceValidated = contributions.filter((item) => item.proofStatus === "source_validated").length;
  const proofLinked = contributions.filter((item) => item.proofStatus === "proof_linked").length;
  const total = contributions.length;

  if (independentlyVerified === total) {
    return {
      label: "Independently verified",
      detail: `Verified in ${pluralize(total, "project")}.`,
      tone: "verified",
    };
  }

  if (independentlyVerified > 0) {
    return {
      label: `${pluralize(independentlyVerified, "project")} verified`,
      detail: `${pluralize(total - independentlyVerified, "contribution")} still need verification.`,
      tone: "mixed",
    };
  }

  if (sourceValidated > 0) {
    return {
      label: "Source validated",
      detail: sourceValidated === total
        ? `Validated sources in ${pluralize(total, "project")}; not independently verified.`
        : `Validated sources in ${pluralize(sourceValidated, "project")}; other contributions remain unverified.`,
      tone: "validated",
    };
  }

  if (proofLinked > 0) {
    return {
      label: "Proof linked",
      detail: `Proof is linked in ${pluralize(proofLinked, "project")}; it has not been independently verified.`,
      tone: "linked",
    };
  }

  return {
    label: "Unverified",
    detail: "This is an inferred working estimate, not a verified credential.",
    tone: "unverified",
  };
}

function inferenceBases(contributions: readonly SkillProjectContribution[]): string {
  return Array.from(new Set(contributions.map((contribution) => skillEstimateBasisLabel(contribution.assessmentBasis)))).join(" · ");
}

async function loadBuildOverview(build: BuildBrief): Promise<OverviewLoadResult> {
  try {
    const response = await apiFetch(`/api/v1/builds/${encodeURIComponent(build.id)}/skill-overview`, {
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      return { kind: "unauthenticated" };
    }

    if (!response.ok) {
      return { kind: "unavailable", buildId: build.id };
    }

    const profiles = readBuildSkillOverviewResponse(await response.json());
    return profiles
      ? { kind: "ready", build, profiles }
      : { kind: "unavailable", buildId: build.id };
  } catch (error) {
    return error instanceof ApiConfigurationError
      ? { kind: "unauthenticated" }
      : { kind: "unavailable", buildId: build.id };
  }
}

export default function PortfolioPage() {
  const [state, setState] = useState<PortfolioState>({ kind: "loading" });

  const loadPortfolio = useCallback(async () => {
    if (!isSupabaseAuthConfigured()) {
      setState({
        kind: "configuration",
        message: "Your portfolio is temporarily unavailable. Please try again shortly.",
      });
      return;
    }

    if (!process.env.NEXT_PUBLIC_API_URL?.trim()) {
      setState({
        kind: "configuration",
        message: "Your portfolio is temporarily unavailable. Please try again shortly.",
      });
      return;
    }

    setState({ kind: "loading" });

    try {
      const {
        data: { session },
        error: sessionError,
      } = await createSupabaseBrowserClient().auth.getSession();

      if (sessionError || !session?.access_token) {
        setState({
          kind: "unauthenticated",
          message: sessionError
            ? "Your session could not be read. Sign in again to continue."
            : "Sign in to view your portfolio.",
        });
        return;
      }

      const buildsResponse = await apiFetch("/api/v1/builds", { cache: "no-store" });
      if (buildsResponse.status === 401 || buildsResponse.status === 403) {
        setState({
          kind: "unauthenticated",
          message: "Sign in again to continue.",
        });
        return;
      }

      if (!buildsResponse.ok) {
        setState({
          kind: "unavailable",
          message: "We could not load your portfolio right now. Please try again.",
        });
        return;
      }

      const builds = readBuildsResponse(await buildsResponse.json());
      if (!builds) {
        setState({
          kind: "unavailable",
          message: "We could not load your portfolio right now. Please try again.",
        });
        return;
      }

      if (builds.length === 0) {
        setState({ kind: "ready", builds, skills: [], unavailableProjectCount: 0 });
        return;
      }

      const overviewResults = await Promise.all(builds.map(loadBuildOverview));
      if (overviewResults.some((result) => result.kind === "unauthenticated")) {
        setState({
          kind: "unauthenticated",
          message: "Your session needs another sign-in before the portfolio can load your project skill data.",
        });
        return;
      }

      const readyResults = overviewResults.filter((result): result is Extract<OverviewLoadResult, { kind: "ready" }> => result.kind === "ready");
      const unavailableProjectCount = overviewResults.filter((result) => result.kind === "unavailable").length;

      if (readyResults.length === 0) {
        setState({
          kind: "unavailable",
          message: "Your projects loaded, but their skill overviews could not be reached. Nothing has been changed; try again shortly.",
        });
        return;
      }

      setState({
        kind: "ready",
        builds,
        skills: aggregateSkills(readyResults),
        unavailableProjectCount,
      });
    } catch (error) {
      setState({
        kind: error instanceof ApiConfigurationError ? "unauthenticated" : "unavailable",
        message: error instanceof ApiConfigurationError
          ? "Sign in to view your portfolio."
          : "We could not load your portfolio right now. Please try again.",
      });
    }
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const projectCount = state.kind === "ready" ? state.builds.length : 0;
  const skillCount = state.kind === "ready" ? state.skills.length : 0;
  const independentlyVerifiedCount = state.kind === "ready"
    ? state.skills.filter((skill) => skill.contributions.every((contribution) => contribution.proofStatus === "independently_verified")).length
    : 0;

  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Skill Portfolio navigation">
        <Link className="brand" href="/" aria-label="SkillForge home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SkillForge</span>
        </Link>
        <div className={styles.navActions}>
          <Link className={styles.navLink} href="/workspace">Your projects</Link>
          <Link className={styles.navLink} href="/login">Account</Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className="eyebrow">Skill Portfolio</p>
          <h1>See the work behind your growth.</h1>
          <p>
            This portfolio brings project-level skill estimates together without treating inference as proof.
          </p>
        </div>
        <div className={styles.metrics} aria-label="Portfolio summary">
          <div><strong>{projectCount}</strong><span>{projectCount === 1 ? "project" : "projects"}</span></div>
          <div><strong>{skillCount}</strong><span>{skillCount === 1 ? "skill estimate" : "skill estimates"}</span></div>
          <div><strong>{independentlyVerifiedCount}</strong><span>{independentlyVerifiedCount === 1 ? "verified skill" : "verified skills"}</span></div>
        </div>
      </header>

      <section className={styles.honestyNote} aria-label="About portfolio estimates">
        <span aria-hidden="true">i</span>
        <p><strong>Working estimates, not credentials.</strong> An inferred level can reflect the work you do in a project, but it remains unverified until relevant proof is linked and validated.</p>
      </section>

      {state.kind === "loading" ? (
        <section className={styles.statusPanel} aria-live="polite">
          <span className={styles.loadingMark} aria-hidden="true" />
          <div><h2>Assembling your portfolio</h2><p>Loading your projects and the skill signals attached to each one.</p></div>
        </section>
      ) : null}

      {state.kind === "configuration" || state.kind === "unauthenticated" || state.kind === "unavailable" ? (
        <section className={styles.statusPanel} aria-live="polite">
          <span className={styles.statusIcon} aria-hidden="true">{state.kind === "unavailable" ? "?" : "i"}</span>
          <div>
            <h2>{state.kind === "unauthenticated" ? "Sign in to view your portfolio" : "Your portfolio is not available"}</h2>
            <p>{state.message}</p>
            <div className={styles.statusActions}>
              {state.kind === "unauthenticated" ? <Link className="button button-primary" href="/login">Sign in</Link> : null}
              {state.kind !== "unauthenticated" ? <button className="button button-quiet" onClick={() => void loadPortfolio()} type="button">Try again</button> : null}
              <Link className="button button-quiet" href="/workspace">Your projects</Link>
            </div>
          </div>
        </section>
      ) : null}

      {state.kind === "ready" && state.builds.length === 0 ? (
        <section className={styles.emptyPanel}>
          <p className="eyebrow">Start with a project</p>
          <h2>There is no portfolio without work to point to.</h2>
          <p>Create a project first. Its brief, decisions, evidence, and AI-assisted work can begin forming your unverified skill picture.</p>
          <Link className="button button-primary" href="/workspace">Create a project</Link>
        </section>
      ) : null}

      {state.kind === "ready" && state.builds.length > 0 ? (
        <>
          {state.unavailableProjectCount > 0 ? (
            <section className={styles.partialNotice} role="status">
              <p>Some project skill overviews could not be loaded. The estimates shown come from {pluralize(state.builds.length - state.unavailableProjectCount, "project")}.</p>
              <button onClick={() => void loadPortfolio()} type="button">Retry all</button>
            </section>
          ) : null}

          {state.skills.length > 0 ? (
            <section className={styles.skillSection} aria-labelledby="portfolio-skills-title">
              <div className={styles.sectionHeading}>
                <div>
                  <p className="eyebrow">Across your projects</p>
                  <h2 id="portfolio-skills-title">Skill estimates</h2>
                </div>
                <span>{pluralize(state.skills.length, "estimate")}</span>
              </div>
              <div className={styles.skillGrid}>
                {state.skills.map((skill) => <PortfolioSkillCard key={skill.capabilitySlug} skill={skill} />)}
              </div>
            </section>
          ) : (
            <section className={styles.emptyPanel}>
              <p className="eyebrow">No signals yet</p>
              <h2>Your projects are here; their skill picture is still forming.</h2>
              <p>Use AI Assist, capture a concrete decision or result, and return here when project-relevant estimates begin to appear.</p>
              <Link className="button button-quiet" href="/workspace">Open your projects</Link>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}

function PortfolioSkillCard({ skill }: { skill: PortfolioSkill }) {
  const verification = verificationSummary(skill.contributions);

  return (
    <article className={styles.skillCard}>
      <div className={styles.cardHeading}>
        <div>
          <span className={styles.cardKicker}>Current estimate</span>
          <h3>{skill.capabilityName}</h3>
        </div>
        <span className={styles.verificationPill} data-tone={verification.tone}>{verification.label}</span>
      </div>
      <div className={styles.levelRow}>
        <strong>{skillLevelLabel(skill.level)}</strong>
        <span>{inferenceBases(skill.contributions)}</span>
      </div>
      <p className={styles.verificationDetail}>{verification.detail}</p>
      <div className={styles.contributionHeading}>
        <span>Contributing projects</span>
        <span>{skill.contributions.length}</span>
      </div>
      <ul className={styles.contributionList}>
        {skill.contributions.map((contribution) => (
          <li key={`${contribution.buildId}-${skill.capabilitySlug}`}>
            <Link href={`/workspace/builds/${contribution.buildId}`}>
              <span>{contribution.buildTitle}</span>
              <small>{skillLevelLabel(contribution.level)} · {skillProofStatusLabel(contribution.proofStatus)}</small>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
