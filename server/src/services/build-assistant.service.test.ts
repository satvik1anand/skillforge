import assert from "node:assert/strict";
import test from "node:test";

import type { ServerConfig } from "../config/env.js";
import type { BuildBriefDto } from "../contracts/build-brief.contract.js";
import type {
  BuildCapabilityDto,
  BuildConversationMessageDto,
} from "../contracts/build-conversation.contract.js";
import {
  BUILD_ASSISTANT_OPENAI_MODEL,
  BUILD_ASSISTANT_OPENROUTER_DEFAULT_MODEL,
  createBuildAssistantProvider,
} from "./build-assistant.service.js";

const noKeyConfig: ServerConfig = {
  nodeEnv: "test",
  port: 0,
  frontendUrl: "http://localhost:3000",
};

const build: BuildBriefDto = {
  id: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  status: "active",
  title: "Learning app launch",
  primaryContextPack: "software_product",
  outcome: "Validate a safe learning-app onboarding flow.",
  constraintsSummary: "Keep user data private by default.",
  metric: { label: "activation rate" },
  timeboxEndsAt: null,
  evidenceCaptureEnabled: true,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

const capability: BuildCapabilityDto = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "solution-architecture",
  name: "Solution architecture",
  contextPracticeId: "33333333-3333-4333-8333-333333333333",
};

function userMessage(
  content: string,
  sequence = 1,
): BuildConversationMessageDto {
  return {
    id: `44444444-4444-4444-8444-${String(sequence).padStart(12, "0")}`,
    conversationId: "55555555-5555-4555-8555-555555555555",
    buildId: build.id,
    role: "user",
    content,
    inReplyToMessageId: null,
    mode: null,
    insight: null,
    createdAt: "2026-07-21T00:00:00.000Z",
  };
}

test("the no-key fallback gives project-specific next steps and a conservative candidate", async () => {
  const provider = createBuildAssistantProvider(noKeyConfig);
  const result = await provider.generate({
    build,
    capabilities: [capability],
    messages: [userMessage(
      "Should I split the backend API before launch when the privacy constraint and activation metric may conflict?",
    )],
  });

  assert.equal(result.mode, "fallback");
  assert.equal(result.model, "deterministic-fallback");
  assert.match(result.content, /Learning app launch/);
  assert.match(result.content, /intended outcome/);
  assert.match(result.content, /boundary between components/);
  assert.equal(result.insight?.capabilitySlug, capability.slug);
  assert.equal(result.inference?.capabilitySlug, capability.slug);
  assert.equal(result.inference?.inferredLevel, "intermediate");
  assert.notEqual(result.inference?.inferredLevel, "advanced");
});

test("the fallback answers generic project input without creating a skill inference", async () => {
  const provider = createBuildAssistantProvider(noKeyConfig);
  const result = await provider.generate({
    build,
    capabilities: [capability],
    messages: [userMessage("Can you help me with this project please?")],
  });

  assert.equal(result.mode, "fallback");
  assert.match(result.content, /Learning app launch/);
  assert.equal(result.inference, null);
});

test("a configured provider sends bounded schema-constrained Responses input", async () => {
  const originalFetch = globalThis.fetch;
  const capturedUrls: string[] = [];
  let capturedRequest: Record<string, unknown> | undefined;

  globalThis.fetch = async (input, init) => {
    capturedUrls.push(input.toString());
    capturedRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      id: "resp_demo",
      output_text: JSON.stringify({
        answer: "Start with a narrow API boundary and validate it end to end.",
        insight: null,
        inference: {
          capabilitySlug: capability.slug,
          inferredLevel: "intermediate",
          rationale: "The user compares a privacy constraint with a measurable launch outcome.",
          dimensions: ["reasoning", "tradeoff"],
        },
      }),
      usage: { input_tokens: 20, output_tokens: 30 },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const provider = createBuildAssistantProvider({
      ...noKeyConfig,
      openAiApiKey: "demo-key",
      openRouterApiKey: "router-demo-key",
    });
    const result = await provider.generate({
      build,
      capabilities: [capability],
      messages: Array.from({ length: 12 }, (_, index) => userMessage(
        `How should I test the API boundary for launch decision ${index + 1}?`,
        index + 1,
      )),
    });

    assert.equal(result.mode, "model");
    assert.equal(result.model, BUILD_ASSISTANT_OPENAI_MODEL);
    assert.equal(result.providerResponseId, "resp_demo");
    assert.equal(result.inputTokens, 20);
    assert.equal(result.outputTokens, 30);
    assert.equal(result.inference?.capabilitySlug, capability.slug);
    assert.deepEqual(capturedUrls, ["https://api.openai.com/v1/responses"]);
    assert.equal(capturedRequest?.model, BUILD_ASSISTANT_OPENAI_MODEL);
    assert.equal(capturedRequest?.store, false);
    assert.deepEqual(capturedRequest?.reasoning, { effort: "low" });

    const text = capturedRequest?.text as { format?: { strict?: boolean } };
    assert.equal(text.format?.strict, true);

    const input = capturedRequest?.input as Array<{ role: string; content: string }>;
    assert.equal(input[0]?.role, "developer");
    assert.equal(input[1]?.role, "user");
    const boundedContext = JSON.parse(input[1]!.content) as {
      recentMessages: unknown[];
    };
    assert.equal(boundedContext.recentMessages.length, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenRouter succeeds after an OpenAI failure and preserves strict local validation", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let openRouterRequest: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    const url = input.toString();
    calls.push(url);
    if (url === "https://api.openai.com/v1/responses") {
      return new Response("unavailable", { status: 503 });
    }

    openRouterRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      id: "or-demo",
      choices: [{
        message: {
          content: `\`\`\`json\n${JSON.stringify({
            answer: "Start with the narrowest API boundary that protects the onboarding data.",
            insight: null,
            inference: {
              capabilitySlug: capability.slug,
              inferredLevel: "intermediate",
              rationale: "The user compares a privacy constraint with a launch decision.",
              dimensions: ["reasoning", "tradeoff"],
            },
          })}\n\`\`\``,
        },
      }],
      usage: { prompt_tokens: 21, completion_tokens: 31 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const provider = createBuildAssistantProvider({
      ...noKeyConfig,
      openAiApiKey: "demo-key",
      openRouterApiKey: "router-demo-key",
    });
    const result = await provider.generate({
      build,
      capabilities: [capability],
      messages: [userMessage(
        "How should I test the privacy tradeoff before launching this feature?",
      )],
    });

    assert.equal(result.mode, "model");
    assert.equal(result.model, BUILD_ASSISTANT_OPENROUTER_DEFAULT_MODEL);
    assert.equal(result.providerResponseId, "or-demo");
    assert.equal(result.inputTokens, 21);
    assert.equal(result.outputTokens, 31);
    assert.equal(result.inference?.capabilitySlug, capability.slug);
    assert.equal(result.inference?.inferredLevel, "intermediate");
    assert.deepEqual(calls, [
      "https://api.openai.com/v1/responses",
      "https://openrouter.ai/api/v1/chat/completions",
    ]);
    assert.equal(openRouterRequest?.model, BUILD_ASSISTANT_OPENROUTER_DEFAULT_MODEL);
    assert.deepEqual(openRouterRequest?.response_format, { type: "json_object" });
    const messages = openRouterRequest?.messages as Array<{ role: string; content: string }>;
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "user");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("both remote provider failures degrade to the deterministic fallback", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(input.toString());
    return new Response("unavailable", { status: 503 });
  };

  try {
    const provider = createBuildAssistantProvider({
      ...noKeyConfig,
      openAiApiKey: "demo-key",
      openRouterApiKey: "router-demo-key",
    });
    const result = await provider.generate({
      build,
      capabilities: [capability],
      messages: [userMessage(
        "How should I test the privacy tradeoff before launching this feature?",
      )],
    });

    assert.equal(result.mode, "fallback");
    assert.equal(result.model, "deterministic-fallback");
    assert.equal(result.inference?.capabilitySlug, capability.slug);
    assert.equal(result.inference?.inferredLevel, "beginner");
    assert.deepEqual(calls, [
      "https://api.openai.com/v1/responses",
      "https://openrouter.ai/api/v1/chat/completions",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
