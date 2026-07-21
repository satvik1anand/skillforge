"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BuildBriefForm } from "@/components/workspace/build-brief-form";
import { ApiConfigurationError, apiFetch } from "@/lib/api";
import {
  briefSkillEstimatesForBuild,
  contextPackLabels,
  isBuildBrief,
  type BuildBrief,
} from "@/lib/build-brief";
import {
  createSupabaseBrowserClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/client";

import styles from "./workspace.module.css";

type WorkspaceState =
  | { kind: "loading" }
  | { kind: "configuration"; message: string }
  | { kind: "unauthenticated"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; builds: BuildBrief[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readBuildsResponse(payload: unknown): BuildBrief[] | undefined {
  let items: unknown;

  if (Array.isArray(payload)) {
    items = payload;
  } else if (isObject(payload) && Array.isArray(payload.builds)) {
    items = payload.builds;
  } else if (
    isObject(payload) &&
    isObject(payload.data) &&
    Array.isArray(payload.data.items)
  ) {
    items = payload.data.items;
  }

  if (!Array.isArray(items) || !items.every(isBuildBrief)) {
    return undefined;
  }

  return items;
}

function formatDate(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatContextPack(value: BuildBrief["primaryContextPack"]): string {
  return contextPackLabels[value];
}

function stateTitle(state: WorkspaceState): string {
  switch (state.kind) {
    case "configuration":
      return "Your workspace is not available";
    case "unauthenticated":
      return "Sign in to see your workspace";
    case "unavailable":
      return "Your project list is not available";
    default:
      return "Your projects";
  }
}

function portfolioSkillsForProjects(builds: readonly BuildBrief[]): string[] {
  return Array.from(
    new Set(
      builds.flatMap((build) =>
        briefSkillEstimatesForBuild(build).map((estimate) => estimate.skill),
      ),
    ),
  ).slice(0, 6);
}

export default function WorkspacePage() {
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [creationMessage, setCreationMessage] = useState<string | null>(null);
  const [isCreateBriefOpen, setIsCreateBriefOpen] = useState(false);

  const portfolioSkills =
    state.kind === "ready" ? portfolioSkillsForProjects(state.builds) : [];
  const projectCount = state.kind === "ready" ? state.builds.length : 0;

  const loadBuilds = useCallback(async (options: { background?: boolean } = {}) => {
    const isBackgroundRefresh = options.background === true;
    const showProblem = (
      kind: "configuration" | "unauthenticated" | "unavailable",
      message: string,
    ) => {
      if (isBackgroundRefresh) {
        setRefreshMessage(message);
        return;
      }

      setState({ kind, message });
    };

    if (!isSupabaseAuthConfigured()) {
      showProblem(
        "configuration",
        "Your workspace is temporarily unavailable. Please try again shortly.",
      );
      return;
    }

    if (!process.env.NEXT_PUBLIC_API_URL?.trim()) {
      showProblem(
        "configuration",
        "Your workspace is temporarily unavailable. Please try again shortly.",
      );
      return;
    }

    if (isBackgroundRefresh) {
      setRefreshMessage(null);
    } else {
      setState({ kind: "loading" });
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await createSupabaseBrowserClient().auth.getSession();

      if (sessionError || !session?.access_token) {
        showProblem(
          "unauthenticated",
          sessionError
            ? "Your session could not be read. Sign in again to continue."
            : "Sign in to view your projects.",
        );
        return;
      }

      const response = await apiFetch("/api/v1/builds", {
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        showProblem(
          "unauthenticated",
          "Sign in again to continue.",
        );
        return;
      }

      if (!response.ok) {
        showProblem(
          "unavailable",
          "We could not load your projects right now. Please try again.",
        );
        return;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        showProblem(
          "unavailable",
          "We could not load your projects right now. Please try again.",
        );
        return;
      }

      const builds = readBuildsResponse(payload);

      if (!builds) {
        showProblem(
          "unavailable",
          "We could not load your projects right now. Please try again.",
        );
        return;
      }

      setState({ kind: "ready", builds });
      setRefreshMessage(null);
    } catch (error) {
      if (error instanceof ApiConfigurationError) {
        showProblem("unauthenticated", "Sign in to view your projects.");
        return;
      }

      showProblem(
        "unavailable",
        "We could not load your projects right now. Please try again.",
      );
    }
  }, []);

  const handleBuildCreated = useCallback(
    (buildBrief: BuildBrief) => {
      // The record is only added after a validated 201 response. A background
      // reload then asks the API for the canonical project list without
      // temporarily hiding the confirmed record.
      setState((current) => {
        if (current.kind !== "ready") {
          return current;
        }

        return {
          kind: "ready",
          builds: [
            buildBrief,
            ...current.builds.filter((existing) => existing.id !== buildBrief.id),
          ],
        };
      });
      setIsCreateBriefOpen(false);
      setCreationMessage(
        "Project created. Its early skill signals come from your project context, not an assessment.",
      );
      void loadBuilds({ background: true });
    },
    [loadBuilds],
  );

  useEffect(() => {
    void loadBuilds();
  }, [loadBuilds]);

  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Workspace navigation">
        <Link className="brand" href="/" aria-label="SkillForge home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SkillForge</span>
        </Link>
        <div className={styles.navActions}>
          <Link className={styles.portfolioLink} href="/portfolio">
            Skill Portfolio
          </Link>
          <Link className={styles.navLink} href="/login">
            Account
          </Link>
        </div>
      </nav>

      <section className={styles.hero} aria-labelledby="workspace-title">
        <div className={styles.heroCopy}>
          <p className="eyebrow">Workspace</p>
          <h1 id="workspace-title">{stateTitle(state)}</h1>
          <p>
            Capture the work you are doing, use AI when you need it, and let the
            proof build into a portfolio you can share when it matters.
          </p>
        </div>
        <section className={styles.portfolioHeroCard} id="skill-portfolio" aria-labelledby="portfolio-title">
          <div className={styles.portfolioCardTopline}>
            <span>Skill Portfolio</span>
            <span className={styles.portfolioPulse} aria-hidden="true" />
          </div>
          <h2 id="portfolio-title">
            {state.kind === "ready" && projectCount > 0
              ? `${projectCount} ${projectCount === 1 ? "project" : "projects"} in motion`
              : "Starts with your work"}
          </h2>
          <p>
            {state.kind === "ready" && projectCount > 0
              ? "Early skill signals are collecting from the projects you create and the work you add."
              : "Your projects become the evidence-led foundation of a living Skill Portfolio."}
          </p>
          {portfolioSkills.length > 0 ? (
            <div className={styles.portfolioSkillStrip} aria-label="Skill Portfolio starting signals">
              {portfolioSkills.slice(0, 3).map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          ) : null}
        </section>
      </section>

      {state.kind === "loading" ? (
        <section className={styles.statusPanel} aria-live="polite">
          <span className={styles.loadingMark} aria-hidden="true" />
          <div>
            <h2>Checking your workspace</h2>
            <p>Loading your projects.</p>
          </div>
        </section>
      ) : null}

      {state.kind === "configuration" ||
      state.kind === "unauthenticated" ||
      state.kind === "unavailable" ? (
        <section className={styles.statusPanel} aria-live="polite">
          <div className={styles.statusIcon} aria-hidden="true">
            {state.kind === "unavailable" ? "?" : "i"}
          </div>
          <div>
            <h2>{stateTitle(state)}</h2>
            <p>{state.message}</p>
            <div className={styles.statusActions}>
              {state.kind === "unauthenticated" ? (
                <Link className="button button-primary" href="/login">
                  Sign in
                </Link>
              ) : null}
              {state.kind === "configuration" || state.kind === "unavailable" ? (
                <button className="button button-quiet" onClick={() => void loadBuilds()} type="button">
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {state.kind === "ready" && state.builds.length === 0 ? (
        <>
          <section className={styles.emptyPanel}>
            <p className="eyebrow">A portfolio begins with the work</p>
            <h2>Bring in the project already taking shape.</h2>
            <p>
              It can be a product, business experiment, marketing initiative, or
              operational process. Start simple and refine it as you work.
            </p>
          </section>
          <BuildBriefForm mode="first" onCreated={handleBuildCreated} />
        </>
      ) : null}

      {state.kind === "ready" && state.builds.length > 0 ? (
        <div className={styles.workspaceLayout}>
          <section className={styles.projectSection} aria-labelledby="project-list-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">Your work</p>
              <h2 id="project-list-title">Projects</h2>
              <span>
                {state.builds.length} {state.builds.length === 1 ? "project" : "projects"}
              </span>
            </div>
            <div className={styles.sectionActions}>
              <button
                aria-expanded={isCreateBriefOpen}
                className={`button button-quiet ${styles.newProjectButton}`}
                onClick={() => {
                  if (!isCreateBriefOpen) {
                    setCreationMessage(null);
                  }
                  setIsCreateBriefOpen((current) => !current);
                }}
                type="button"
              >
                {isCreateBriefOpen ? "Cancel" : "New project"}
              </button>
            </div>
          </div>
          {isCreateBriefOpen ? (
            <BuildBriefForm
              mode="additional"
              onCreated={handleBuildCreated}
              withinBuildList
            />
          ) : null}
          {creationMessage ? (
            <p className={styles.creationMessage} role="status">
              {creationMessage}
            </p>
          ) : null}
          {refreshMessage ? (
            <p className={styles.refreshMessage} role="status">
              {refreshMessage} The projects currently shown have not been replaced.
            </p>
          ) : null}
          <div className={styles.projectGrid}>
            {state.builds.map((build) => {
              const updatedAt = formatDate(build.updatedAt);
              const skillEstimates = briefSkillEstimatesForBuild(build);

              return (
                <Link
                  aria-label={`Project: ${build.title}`}
                  className={styles.projectCard}
                  href={`/workspace/builds/${build.id}`}
                  key={build.id}
                >
                  <div className={styles.cardTopline}>
                    <span>{formatContextPack(build.primaryContextPack)}</span>
                    <span>{build.status}</span>
                  </div>
                  <h3>{build.title}</h3>
                  <p>{build.outcome}</p>
                  <div className={styles.skillEstimatesBlock}>
                    <span className={styles.skillEstimatesLabel}>Skill snapshot</span>
                    <div className={styles.skillEstimates} aria-label="Project-context skill signals">
                      {skillEstimates.map((estimate) => (
                        <span className={styles.skillEstimate} key={estimate.skill}>
                          <span>{estimate.skill}</span>
                          <span className={styles.skillEstimateLevel}>{estimate.level}</span>
                        </span>
                      ))}
                    </div>
                    <span className={styles.skillEstimatesNote}>
                      Unverified starting estimate · grows with your work and evidence
                    </span>
                  </div>
                  {updatedAt ? <small className={styles.updatedAt}>Updated {updatedAt}</small> : null}
                  <span className={styles.cardArrow} aria-hidden="true">
                    ↗
                  </span>
                </Link>
              );
            })}
          </div>
          </section>

          <aside className={styles.portfolioRail} aria-labelledby="portfolio-rail-title">
            <span className={styles.railKicker}>Skill Portfolio</span>
            <h2 id="portfolio-rail-title">Your work leaves a trail.</h2>
            <p>
              Each project gives your portfolio a richer view of how you think,
              decide, and deliver.
            </p>
            <div className={styles.railMetric}>
              <strong>{portfolioSkills.length}</strong>
              <span>early skill signals</span>
            </div>
            {portfolioSkills.length > 0 ? (
              <div className={styles.railSkills}>
                {portfolioSkills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            ) : null}
            <Link className={styles.railLink} href="/portfolio">
              Portfolio overview <span aria-hidden="true">↑</span>
            </Link>
          </aside>
        </div>
      ) : null}

      {state.kind === "ready" && state.builds.length === 0 && refreshMessage ? (
        <p className={styles.refreshMessage} role="status">
          {refreshMessage} The projects currently shown have not been replaced.
        </p>
      ) : null}
    </main>
  );
}
