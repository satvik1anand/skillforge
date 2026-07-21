"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import { ApiConfigurationError, apiFetch } from "@/lib/api";

import styles from "./build-companion.module.css";

type CompanionRole = "user" | "assistant";
type MessageDelivery = "pending" | "failed";

type InferredSkill = {
  capabilityName: string;
  level: string;
  // This is deliberately fixed in the client. The companion must never
  // present an AI inference as independently verified proof.
  status: "unverified";
  rationale?: string;
};

type QuestionAnalysis = {
  inferredSkills: InferredSkill[];
};

type BuildInsight = {
  question: string;
  whyNow?: string;
};

type ConversationMessage = {
  id: string;
  role: CompanionRole;
  content: string;
  createdAt: string;
  /** Client-only retry key; never render or expose it as Build content. */
  idempotencyKey?: string;
  analysis?: QuestionAnalysis;
  delivery?: MessageDelivery;
};

type Conversation = {
  id?: string;
  buildId?: string;
  messages: ConversationMessage[];
  latestInsight?: BuildInsight;
};

type CompanionState =
  | { kind: "loading" }
  | { kind: "ready"; conversation: Conversation }
  | { kind: "unauthenticated" | "unavailable"; message: string };

type SendFailure = {
  message: string;
  retryable: boolean;
};

type SendResult = {
  userMessage?: ConversationMessage;
  assistantMessage?: ConversationMessage;
  insight?: BuildInsight;
  inference?: QuestionAnalysis;
};

const starterPrompts = [
  "Break the next project milestone into a practical plan.",
  "Stress-test an architecture or product decision I am considering.",
  "What evidence should I capture while I work on this?",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readTimestamp(value: unknown): string {
  const timestamp = readString(value);

  return timestamp && Number.isFinite(new Date(timestamp).getTime())
    ? timestamp
    : new Date().toISOString();
}

function readInsight(value: unknown): BuildInsight | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const question = readString(value.question);
  if (!question) {
    return undefined;
  }

  const whyNow = readString(value.whyNow);

  return {
    question,
    ...(whyNow ? { whyNow } : {}),
  };
}

function readQuestionAnalysis(value: unknown): QuestionAnalysis | undefined {
  if (!isRecord(value) || !Array.isArray(value.inferredSkills)) {
    return undefined;
  }

  const inferredSkills = value.inferredSkills.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const capabilityName = readString(item.capabilityName);
    const level = readString(item.level);
    if (!capabilityName || !level) {
      return [];
    }

    const rationale = readString(item.rationale);

    return [{
      capabilityName,
      level,
      status: "unverified" as const,
      ...(rationale ? { rationale } : {}),
    }];
  });

  return inferredSkills.length > 0 ? { inferredSkills } : undefined;
}

function readMessage(value: unknown, fallbackId: string): ConversationMessage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const role = value.role === "user" || value.role === "assistant" ? value.role : undefined;
  const content = readString(value.content);
  if (!role || !content) {
    return undefined;
  }

  const analysis = readQuestionAnalysis(value.analysis);

  return {
    id: readString(value.id) ?? fallbackId,
    role,
    content,
    createdAt: readTimestamp(value.createdAt),
    ...(analysis ? { analysis } : {}),
  };
}

function unwrapPayload(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  return isRecord(payload.data) ? payload.data : payload;
}

function readConversation(payload: unknown): Conversation | undefined {
  const root = unwrapPayload(payload);
  const candidate = root && isRecord(root.conversation) ? root.conversation : root;
  if (!candidate || !Array.isArray(candidate.messages)) {
    return undefined;
  }

  const messages = candidate.messages.flatMap((message, index) => {
    const parsed = readMessage(message, `conversation-${index}`);
    return parsed ? [parsed] : [];
  });
  const id = readString(candidate.id);
  const buildId = readString(candidate.buildId);
  const latestInsight = readInsight(candidate.latestInsight);

  // An empty conversation is valid. A malformed individual message is ignored
  // rather than making the whole private build unusable.
  return {
    ...(id ? { id } : {}),
    ...(buildId ? { buildId } : {}),
    messages,
    ...(latestInsight ? { latestInsight } : {}),
  };
}

function readSendResult(payload: unknown): SendResult | undefined {
  const root = unwrapPayload(payload);
  if (!root) {
    return undefined;
  }

  const userMessage = readMessage(root.userMessage, "server-user-message");
  const assistantMessage = readMessage(root.assistantMessage, "server-assistant-message");
  const inference = readQuestionAnalysis(root.inference);
  const insight = readInsight(root.insight);

  if (!userMessage && !assistantMessage) {
    return undefined;
  }

  return {
    ...(userMessage ? { userMessage } : {}),
    ...(assistantMessage ? { assistantMessage } : {}),
    ...(inference ? { inference } : {}),
    ...(insight ? { insight } : {}),
  };
}

function formatMessageTime(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function localMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pending-${crypto.randomUUID()}`;
  }

  return `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // This fallback preserves the UUID shape the API validates. It is a
  // best-effort retry identifier, not an authorization or security token.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = character === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export function BuildCompanion({
  buildId,
  buildTitle,
  onSkillProfilesChanged,
}: {
  buildId: string;
  buildTitle: string;
  /** Re-read the server-owned overview after a persisted inference. */
  onSkillProfilesChanged?: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<CompanionState>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendFailure, setSendFailure] = useState<SendFailure | null>(null);

  const conversationPath = `/api/v1/builds/${encodeURIComponent(buildId)}/conversation`;

  const loadConversation = useCallback(async () => {
    setState({ kind: "loading" });

    try {
      const response = await apiFetch(conversationPath, { cache: "no-store" });

      if (response.status === 401 || response.status === 403) {
        setState({
          kind: "unauthenticated",
          message: "Your session needs another sign-in before AI Assist can load for this project.",
        });
        return;
      }

      if (!response.ok) {
        const fallback = response.status === 404
          ? "AI Assist is not available for this project yet. Your project brief and evidence remain available."
          : "AI Assist could not be loaded. Your project brief and evidence remain available.";
        setState({
          kind: "unavailable",
          message: fallback,
        });
        return;
      }

      const conversation = readConversation(await response.json());
      if (!conversation) {
        setState({
          kind: "unavailable",
          message: "AI Assist returned an unexpected response. Your project brief and evidence remain available.",
        });
        return;
      }

      setState({ kind: "ready", conversation });
      setSendFailure(null);
    } catch (error) {
      setState({
        kind: error instanceof ApiConfigurationError ? "unauthenticated" : "unavailable",
        message: error instanceof ApiConfigurationError
          ? "Sign in to use AI Assist."
          : "AI Assist could not be reached. Your project brief and evidence remain available.",
      });
    }
  }, [conversationPath]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  const updatePendingMessage = (messageId: string, update: Partial<ConversationMessage>) => {
    setState((current) => {
      if (current.kind !== "ready") {
        return current;
      }

      return {
        ...current,
        conversation: {
          ...current.conversation,
          messages: current.conversation.messages.map((message) => message.id === messageId
            ? { ...message, ...update }
            : message),
        },
      };
    });
  };

  const submitMessage = async (
    content: string,
    retryingMessageId?: string,
    retryingIdempotencyKey?: string,
  ) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isSending || state.kind !== "ready") {
      return;
    }

    const pendingMessage: ConversationMessage = {
      id: retryingMessageId ?? localMessageId(),
      role: "user",
      content: trimmedContent,
      createdAt: new Date().toISOString(),
      idempotencyKey: retryingIdempotencyKey ?? localIdempotencyKey(),
      delivery: "pending",
    };

    if (retryingMessageId) {
      updatePendingMessage(retryingMessageId, { delivery: "pending" });
    } else {
      setState((current) => current.kind === "ready"
        ? {
            ...current,
            conversation: {
              ...current.conversation,
              messages: [...current.conversation.messages, pendingMessage],
            },
          }
        : current);
    }

    setDraft("");
    setIsSending(true);
    setSendFailure(null);

    try {
      const response = await apiFetch(conversationPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmedContent,
          idempotencyKey: pendingMessage.idempotencyKey,
        }),
      });

      if (!response.ok) {
        const fallback = response.status === 401 || response.status === 403
          ? "Your session needs another sign-in before your message can be sent."
          : response.status === 503
            ? "AI Assist cannot respond right now. Your question was not assumed to be analysed."
            : "Your message was not sent. Try again when you are ready.";
        updatePendingMessage(pendingMessage.id, { delivery: "failed" });
        setSendFailure({ message: fallback, retryable: response.status !== 401 && response.status !== 403 });
        return;
      }

      const result = readSendResult(await response.json());
      if (!result) {
        updatePendingMessage(pendingMessage.id, { delivery: "failed" });
        setSendFailure({
          message: "AI Assist did not return a usable response. Refresh the conversation before sending another message.",
          retryable: false,
        });
        return;
      }

      const returnedUserMessage = result.userMessage
        ? {
            ...result.userMessage,
            ...(result.inference && !result.userMessage.analysis ? { analysis: result.inference } : {}),
          }
        : {
            ...pendingMessage,
            ...(result.inference ? { analysis: result.inference } : {}),
          };

      setState((current) => {
        if (current.kind !== "ready") {
          return current;
        }

        const withoutPending = current.conversation.messages.filter((message) => message.id !== pendingMessage.id);
        const messages = [...withoutPending, returnedUserMessage];

        if (result.assistantMessage && !messages.some((message) => message.id === result.assistantMessage?.id)) {
          messages.push(result.assistantMessage);
        }

        return {
          ...current,
          conversation: {
            ...current.conversation,
            messages,
            ...(result.insight ? { latestInsight: result.insight } : {}),
          },
        };
      });

      if (result.inference) {
        onSkillProfilesChanged?.();
      }

      if (!result.assistantMessage) {
        setSendFailure({
          message: "Your question was saved, but AI Assist did not return a reply. Refresh this conversation before continuing.",
          retryable: false,
        });
      }
    } catch (error) {
      updatePendingMessage(pendingMessage.id, { delivery: "failed" });
      setSendFailure({
        message: error instanceof ApiConfigurationError
          ? "Sign in to use AI Assist."
          : "We could not confirm that your message was sent. Refresh the conversation before trying again to avoid a duplicate.",
        retryable: false,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage(draft);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submitMessage(draft);
    }
  };

  const handleStarterPrompt = (prompt: string) => {
    setDraft(prompt);
    setSendFailure(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <section className={styles.companion} aria-labelledby="ai-assist-title">
      <span className={styles.ambientGlow} aria-hidden="true" />
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">AI Assist</p>
          <h2 id="ai-assist-title">A working partner for {buildTitle}</h2>
        </div>
        <span className={styles.projectPill}>Project context</span>
      </div>
      <p className={styles.intro}>
        Plan, debug, pressure-test decisions, and turn the work into clear next moves without leaving this project&apos;s context.
      </p>
      <div className={styles.contextStrip}>
        <span className={styles.contextSpark} aria-hidden="true" />
        <div>
          <strong>Grounded in this project</strong>
          <span>Project brief, your decisions, and the current conversation</span>
        </div>
      </div>

      {state.kind === "loading" ? (
        <div className={styles.loadingState} aria-live="polite">
          <span className={styles.loadingMark} aria-hidden="true" />
          <p>Opening AI Assist for this project.</p>
        </div>
      ) : null}

      {state.kind === "unauthenticated" || state.kind === "unavailable" ? (
        <div className={styles.unavailableState} aria-live="polite">
          <div>
            <strong>AI Assist unavailable</strong>
            <p>{state.message}</p>
          </div>
          <div className={styles.unavailableActions}>
            {state.kind === "unauthenticated" ? <Link className="button button-quiet" href="/login">Sign in</Link> : null}
            <button className="button button-quiet" onClick={() => void loadConversation()} type="button">
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <>
          <div className={styles.messageLog} aria-label="AI Assist conversation" aria-live="polite" aria-relevant="additions text" role="log">
            {state.conversation.messages.length === 0 ? (
              <div className={styles.emptyConversation}>
                <span className={styles.emptyMark} aria-hidden="true">↗</span>
                <div>
                  <h3>Start with the work in front of you</h3>
                  <p>Bring a decision, a tricky implementation detail, or a milestone you want to move forward.</p>
                </div>
              </div>
            ) : state.conversation.messages.map((message) => (
              <ConversationMessageItem
                key={message.id}
                message={message}
                onRetry={message.delivery === "failed" && sendFailure?.retryable
                  ? () => void submitMessage(
                    message.content,
                    message.id,
                    message.idempotencyKey,
                  )
                  : undefined}
              />
            ))}
          </div>

          {state.conversation.latestInsight ? <InsightCard insight={state.conversation.latestInsight} /> : null}

          <form className={styles.composer} onSubmit={handleSubmit}>
            <div className={styles.composerTopline}>
              <label className={styles.composerLabel} htmlFor={inputId}>What are you working through?</label>
              <span aria-hidden="true">AI Assist</span>
            </div>
            <textarea
              aria-describedby={`${inputId}-hint`}
              disabled={isSending}
              id={inputId}
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask about architecture, a difficult decision, an implementation detail, or your next move..."
              ref={inputRef}
              rows={3}
              value={draft}
            />
            <div className={styles.composerFooter}>
              <p id={`${inputId}-hint`}>Uses this project&apos;s brief and conversation. Ctrl/Cmd + Enter sends.</p>
              <button className="button button-primary" disabled={isSending || !draft.trim()} type="submit">
                {isSending ? "Thinking..." : "Send"}
              </button>
            </div>
          </form>

          {sendFailure ? (
            <div className={styles.sendFailure} role="status">
              <p>{sendFailure.message}</p>
              {!sendFailure.retryable ? (
                <button className="button button-quiet" onClick={() => void loadConversation()} type="button">
                  Refresh conversation
                </button>
              ) : null}
            </div>
          ) : null}

          {state.conversation.messages.length === 0 ? (
            <div className={styles.starterPrompts} aria-label="Starter prompts">
              {starterPrompts.map((prompt) => (
                <button key={prompt} onClick={() => handleStarterPrompt(prompt)} type="button">
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ConversationMessageItem({
  message,
  onRetry,
}: {
  message: ConversationMessage;
  onRetry?: () => void;
}) {
  const label = message.role === "user" ? "You" : "AI Assist";
  const timestamp = formatMessageTime(message.createdAt);

  return (
    <article className={styles.messageGroup} data-role={message.role}>
      <div className={styles.messageMeta}>
        <span className={styles.messageIdentity}>
          <span className={styles.roleMark} aria-hidden="true">{message.role === "user" ? "Y" : "AI"}</span>
          <span>{label}</span>
        </span>
        {timestamp ? <time dateTime={message.createdAt}>{timestamp}</time> : null}
      </div>
      <div className={styles.messageBubble}>
        <p>{message.content}</p>
        {message.delivery === "pending" ? <span className={styles.deliveryState}>Sending...</span> : null}
        {message.delivery === "failed" ? (
          <div className={styles.failedDelivery}>
            <span>Not sent</span>
            {onRetry ? <button onClick={onRetry} type="button">Retry</button> : null}
          </div>
        ) : null}
      </div>
      {message.role === "user" && message.analysis ? <QuestionAnalysisCard analysis={message.analysis} /> : null}
    </article>
  );
}

function QuestionAnalysisCard({ analysis }: { analysis: QuestionAnalysis }) {
  return (
    <aside className={styles.analysisCard} aria-label="Unverified skill estimate observed in your project input">
      <div className={styles.analysisHeading}>
        <span>Observed in your input</span>
        <strong>Unverified estimate</strong>
      </div>
      <ul>
        {analysis.inferredSkills.map((skill) => (
          <li key={`${skill.capabilityName}-${skill.level}`}>
            <div>
              <span>{skill.capabilityName}</span>
              <strong>{skill.level}</strong>
            </div>
            {skill.rationale ? <p>{skill.rationale}</p> : null}
          </li>
        ))}
      </ul>
      <p className={styles.analysisNote}>This is an AI-derived estimate from your work in this project. It is not verification or a public claim.</p>
    </aside>
  );
}

function InsightCard({ insight }: { insight: BuildInsight }) {
  return (
    <aside className={styles.insightCard} aria-labelledby="deeper-project-angle-title">
      <div className={styles.insightHeading}>
        <span id="deeper-project-angle-title">A deeper project angle</span>
        <span>Optional prompt</span>
      </div>
      <p>{insight.question}</p>
      {insight.whyNow ? <small>{insight.whyNow}</small> : null}
    </aside>
  );
}
