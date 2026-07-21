"use client";

import { FormEvent, useId, useState } from "react";

import { ApiConfigurationError, apiFetch } from "@/lib/api";
import {
  buildContextPacks,
  contextPackLabels,
  isBuildBrief,
  type BuildBrief,
  type BuildContextPack,
} from "@/lib/build-brief";

import styles from "./build-brief-form.module.css";

type BuildBriefFormProps = {
  onCreated: (buildBrief: BuildBrief) => void;
  mode: "first" | "additional";
  withinBuildList?: boolean;
};

type FormValues = {
  title: string;
  primaryContextPack: BuildContextPack;
  outcome: string;
  roleStatement: string;
  audienceOrStakeholder: string;
  constraintsSummary: string;
  definitionOfDone: string;
  metricLabel: string;
  metricUnit: string;
  metricBaseline: string;
  metricTarget: string;
  timeboxEndDate: string;
  evidenceCaptureEnabled: boolean;
};

type CreateBuildBriefPayload = {
  title: string;
  primaryContextPack: BuildContextPack;
  outcome: string;
  roleStatement?: string;
  audienceOrStakeholder?: string;
  constraintsSummary?: string;
  definitionOfDone?: string;
  metric?: {
    label: string;
    unit?: string;
    baselineValue?: number;
    targetValue?: number;
  };
  timeboxEndsAt?: string;
  evidenceCaptureEnabled: boolean;
};

const initialValues: FormValues = {
  title: "",
  primaryContextPack: "software_product",
  outcome: "",
  roleStatement: "",
  audienceOrStakeholder: "",
  constraintsSummary: "",
  definitionOfDone: "",
  metricLabel: "",
  metricUnit: "",
  metricBaseline: "",
  metricTarget: "",
  timeboxEndDate: "",
  evidenceCaptureEnabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getApiErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Sign in again before creating this project.";
  }

  if (status === 503) {
    return "Project storage is currently unavailable. Nothing was created. Try again once the service is available.";
  }

  return "We could not create this project. Your projects have not changed.";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function compactText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalNumber(value: string, label: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }

  return parsed;
}

function toEndOfDayIso(dateValue: string): string | undefined {
  if (!dateValue) {
    return undefined;
  }

  const parts = dateValue.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error("Choose a valid timebox end date.");
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Choose a valid timebox end date.");
  }

  return date.toISOString();
}

function buildPayload(values: FormValues): CreateBuildBriefPayload {
  const title = values.title.trim();
  const outcome = values.outcome.trim();
  const roleStatement = compactText(values.roleStatement);
  const audienceOrStakeholder = compactText(values.audienceOrStakeholder);
  const constraintsSummary = compactText(values.constraintsSummary);
  const definitionOfDone = compactText(values.definitionOfDone);

  if (!title || !outcome) {
    throw new Error("Add a project name and intended outcome before creating this project.");
  }

  const metricLabel = compactText(values.metricLabel);
  const metricUnit = compactText(values.metricUnit);
  const baselineValue = readOptionalNumber(values.metricBaseline, "Metric baseline");
  const targetValue = readOptionalNumber(values.metricTarget, "Metric target");
  const includesMetric = Boolean(metricLabel || metricUnit || baselineValue !== undefined || targetValue !== undefined);

  if (includesMetric && !metricLabel) {
    throw new Error("Give the metric a label before adding its unit or values.");
  }

  const timeboxEndsAt = toEndOfDayIso(values.timeboxEndDate);

  return {
    title,
    primaryContextPack: values.primaryContextPack,
    outcome,
    ...(roleStatement ? { roleStatement } : {}),
    ...(audienceOrStakeholder ? { audienceOrStakeholder } : {}),
    ...(constraintsSummary ? { constraintsSummary } : {}),
    ...(definitionOfDone ? { definitionOfDone } : {}),
    ...(includesMetric && metricLabel
      ? {
          metric: {
            label: metricLabel,
            ...(metricUnit ? { unit: metricUnit } : {}),
            ...(baselineValue !== undefined ? { baselineValue } : {}),
            ...(targetValue !== undefined ? { targetValue } : {}),
          },
        }
      : {}),
    ...(timeboxEndsAt ? { timeboxEndsAt } : {}),
    evidenceCaptureEnabled: values.evidenceCaptureEnabled,
  };
}

export function BuildBriefForm({
  mode,
  onCreated,
  withinBuildList = false,
}: BuildBriefFormProps) {
  const formId = useId();
  const [values, setValues] = useState<FormValues>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function updateText<Key extends keyof FormValues>(key: Key, value: FormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    let payload: CreateBuildBriefPayload;
    try {
      payload = buildPayload(values);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Check the project details and try again.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiFetch("/api/v1/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const responsePayload = await readJson(response);

      if (response.status !== 201) {
        setErrorMessage(getApiErrorMessage(response.status));
        return;
      }

      const created =
        isRecord(responsePayload) &&
        isRecord(responsePayload.data) &&
        responsePayload.data.buildBrief;

      if (!isBuildBrief(created)) {
        setErrorMessage(
          "We could not confirm that project creation. Refresh your workspace before trying again.",
        );
        return;
      }

      onCreated(created);
      setValues(initialValues);
    } catch (error) {
      if (error instanceof ApiConfigurationError) {
        setErrorMessage("Sign in again before creating this project.");
      } else {
        setErrorMessage(
          "We could not create this project right now. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      className={`${styles.panel} ${withinBuildList ? styles.panelWithinBuildList : ""}`}
      aria-labelledby={`${formId}-title`}
    >
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">{mode === "first" ? "Your first project" : "New project"}</p>
          <h2 id={`${formId}-title`}>
            {mode === "first" ? "What have you built?" : "Give this project a clear starting point."}
          </h2>
        </div>
        <p>
          Start with the work in front of you. You can refine the details, add evidence, and make it shareable when ready.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <fieldset className={styles.requiredFields}>
          <legend>Project details</legend>
          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor={`${formId}-title`}>
              <span>Project name</span>
              <input
                id={`${formId}-title`}
                maxLength={160}
                onChange={(event) => updateText("title", event.target.value)}
                placeholder="e.g. Launch a research-backed onboarding flow"
                required
                value={values.title}
              />
            </label>
            <label className={styles.field} htmlFor={`${formId}-context-pack`}>
              <span>Type of work</span>
              <select
                id={`${formId}-context-pack`}
                onChange={(event) => updateText("primaryContextPack", event.target.value as BuildContextPack)}
                value={values.primaryContextPack}
              >
                {buildContextPacks.map((contextPack) => (
                  <option key={contextPack} value={contextPack}>
                    {contextPackLabels[contextPack]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.field} htmlFor={`${formId}-outcome`}>
            <span>What are you working toward?</span>
            <textarea
              id={`${formId}-outcome`}
              maxLength={4000}
              onChange={(event) => updateText("outcome", event.target.value)}
              placeholder="What meaningful result are you trying to create, improve, or learn?"
              required
              rows={4}
              value={values.outcome}
            />
          </label>
        </fieldset>

        <details className={styles.optionalFields}>
          <summary>Add optional context, measures, and timebox</summary>
          <div className={styles.optionalContent}>
            <div className={styles.fieldGrid}>
              <label className={styles.field} htmlFor={`${formId}-role`}>
                <span>Your role</span>
                <textarea
                  id={`${formId}-role`}
                  maxLength={2000}
                  onChange={(event) => updateText("roleStatement", event.target.value)}
                  placeholder="Your responsibilities or contribution"
                  rows={3}
                  value={values.roleStatement}
                />
              </label>
              <label className={styles.field} htmlFor={`${formId}-audience`}>
                <span>Audience or stakeholder</span>
                <textarea
                  id={`${formId}-audience`}
                  maxLength={1000}
                  onChange={(event) => updateText("audienceOrStakeholder", event.target.value)}
                  placeholder="Who benefits or needs to be involved?"
                  rows={3}
                  value={values.audienceOrStakeholder}
                />
              </label>
            </div>

            <label className={styles.field} htmlFor={`${formId}-constraints`}>
              <span>Constraints or guardrails</span>
              <textarea
                id={`${formId}-constraints`}
                maxLength={4000}
                onChange={(event) => updateText("constraintsSummary", event.target.value)}
                placeholder="Budget, access, compliance, time, or other constraints that shape the work"
                rows={3}
                value={values.constraintsSummary}
              />
            </label>

            <label className={styles.field} htmlFor={`${formId}-definition-of-done`}>
              <span>Definition of done</span>
              <textarea
                id={`${formId}-definition-of-done`}
                maxLength={4000}
                onChange={(event) => updateText("definitionOfDone", event.target.value)}
                placeholder="What would make this ready to close, share, or evaluate?"
                rows={3}
                value={values.definitionOfDone}
              />
            </label>

            <fieldset className={styles.metricFields}>
              <legend>Optional metric</legend>
              <div className={styles.metricGrid}>
                <label className={styles.field} htmlFor={`${formId}-metric-label`}>
                  <span>Metric label</span>
                  <input
                    id={`${formId}-metric-label`}
                    maxLength={120}
                    onChange={(event) => updateText("metricLabel", event.target.value)}
                    placeholder="e.g. Activation rate"
                    value={values.metricLabel}
                  />
                </label>
                <label className={styles.field} htmlFor={`${formId}-metric-unit`}>
                  <span>Unit</span>
                  <input
                    id={`${formId}-metric-unit`}
                    maxLength={40}
                    onChange={(event) => updateText("metricUnit", event.target.value)}
                    placeholder="%, users, hours"
                    value={values.metricUnit}
                  />
                </label>
                <label className={styles.field} htmlFor={`${formId}-metric-baseline`}>
                  <span>Baseline</span>
                  <input
                    id={`${formId}-metric-baseline`}
                    inputMode="decimal"
                    onChange={(event) => updateText("metricBaseline", event.target.value)}
                    placeholder="Optional"
                    step="any"
                    type="number"
                    value={values.metricBaseline}
                  />
                </label>
                <label className={styles.field} htmlFor={`${formId}-metric-target`}>
                  <span>Target</span>
                  <input
                    id={`${formId}-metric-target`}
                    inputMode="decimal"
                    onChange={(event) => updateText("metricTarget", event.target.value)}
                    placeholder="Optional"
                    step="any"
                    type="number"
                    value={values.metricTarget}
                  />
                </label>
              </div>
            </fieldset>

            <label className={`${styles.field} ${styles.dateField}`} htmlFor={`${formId}-timebox`}>
              <span>Timebox end date</span>
              <input
                id={`${formId}-timebox`}
                onChange={(event) => updateText("timeboxEndDate", event.target.value)}
                type="date"
                value={values.timeboxEndDate}
              />
              <small>Stored as the end of this local calendar day.</small>
            </label>
          </div>
        </details>

        <label className={styles.evidenceToggle} htmlFor={`${formId}-evidence-capture`}>
          <input
            checked={values.evidenceCaptureEnabled}
            id={`${formId}-evidence-capture`}
            onChange={(event) => updateText("evidenceCaptureEnabled", event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Capture supporting evidence for this project</strong>
            <small>Add links, artifacts, and outcomes that can strengthen your Skill Portfolio over time.</small>
          </span>
        </label>

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button className="button button-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating..." : "Create project"}
          </button>
          <p>You can refine this project as the work develops.</p>
        </div>
      </form>
    </section>
  );
}
