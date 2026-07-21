# SkillForge - Product Specification

**Status:** active product contract  
**Last updated:** 2026-07-22  
**Related decisions:** [Pre-development refinement](./PRE_DEVELOPMENT_REFINEMENT.md) and [current implementation roadmap](./IMPLEMENTATION_ROADMAP.md)

## Product promise

SkillForge is a private-by-default, project-aware workspace for people creating a product, business, growth system, or operational process. It helps them move the work forward, retains the reasoning behind it, and builds a Skill Portfolio that can later be supported with proof.

The dedicated AI Assist surface is useful while the work is happening. The Skill Portfolio is the durable, selectively shareable outcome.

```text
“What have you built?”
        ->
Create or name a Project
        ->
Work with Project AI Assist
        ->
User-authored project inputs reveal unverified skill signals
        ->
Link relevant work or independent proof
        ->
Share selected, proof-labelled Skill Portfolio items
```

## Product vocabulary

| Term | Meaning |
| --- | --- |
| **Project** | The visible product term for a focused piece of outcome-driven work. It can be a software product, business or venture, marketing/growth system, or operations/process improvement. |
| **Project context** | The visible, structured starting point for a Project: outcome, role, audience, constraints, definition of done, metric, timebox, and context pack. |
| **AI Assist** | The dedicated project surface that answers work questions using only the active project’s bounded context. |
| **Build / Build Brief** | Internal, API, and database terminology for the Project and its structured context. It may remain while compatible naming migration is evaluated; it is not the primary visible UI noun. |
| **Skill estimate** | An internal, unverified assessment of a capability. It may be inferred automatically from the user's own Project-related inputs and remains unverified until relevant proof is linked and reviewed. |
| **Evidence card** | A user-reviewable record of a decision, artifact, result, or exact source excerpt. It helps explain and support a Skill Portfolio item. |
| **Proof** | A repository, public project, blog/write-up, certification, rank/test result, or other scoped source that the user links to support a skill claim. |
| **Skill Portfolio** | The visible, evolving portfolio view assembled from Projects, selected evidence, and precisely labelled proof. A shareable item is a selected, redacted snapshot; it never exposes raw chat history or unselected records. |

Use **Project** in visible product language. Use a project’s own title wherever possible. `Build` and `Build Brief` may remain in code, APIs, migrations, and internal documentation until a deliberate compatibility plan changes them.

## Who it is for

SkillForge starts with outcome-driven individual builders and small-team contributors:

- Software builders and technical founders.
- Founders validating a customer problem, offer, or business model.
- Marketing and growth builders improving a channel, funnel, or campaign.
- Operations builders improving a workflow, service level, or internal process.

Every Build has one primary context pack; it can add secondary workstreams when the work crosses disciplines.

| Context pack | Typical Build question | Relevant proof examples |
| --- | --- | --- |
| Software product | “How should I isolate tenant data in this API?” | Repository, PR, architecture note, test evidence, deployed public product. |
| Business / venture | “What customer interview result would falsify this offer?” | Public case study, interview synthesis, landing page, traction or revenue summary. |
| Marketing / growth | “How should we separate creative fatigue from audience mismatch?” | Campaign write-up, public dashboard excerpt, experiment report, portfolio case study. |
| Operations / process | “Which metric would show this automation is actually reducing rework?” | Process map, SOP, retrospective, public implementation write-up, outcome summary. |

## Trust model: inference is not verification

The user’s own work inputs can automatically change a **private, unverified** skill estimate. A well-scoped question, explanation, decision, or result can reveal capability-relevant reasoning; the platform should use that signal without interrupting the work.

That does not make the resulting level a verified or independently certified claim.

| Layer | How it changes | What it means |
| --- | --- | --- |
| Private skill inference | The system analyses eligible **user-authored** Build messages and other Build sources, retains exact provenance, and may update the private estimate when its calibrated progression policy is met. | A useful, explainable estimate; it is unverified and private by default. |
| Evidence record | The user can confirm, edit, dismiss, or revoke a source-backed evidence card. | A retained record of what happened; it can support explanation and sharing selection. |
| Proof status | The user links proof relevant to the exact capability and role. The system records the level of checking actually performed. | A scoped support signal, not a blanket certification. |

The UI must show these axes separately. For example:

```text
Social media marketing  |  Intermediate  |  Unverified estimate
```

After the user adds a relevant public case study or test ranking, it may become:

```text
Social media marketing  |  Intermediate  |  Proof-linked
```

`Proof-linked` means the user connected a relevant visible source. It must not be labelled “independently verified” unless a later source-validation or issuer/reviewer workflow actually establishes that status.

### Automatic inference from Project inputs

For an eligible user message, the assistant may identify capability signals such as problem framing, constraints, trade-offs, execution planning, measurement, iteration, quality/risk thinking, or communication. The question or query itself is the input being analysed; an assistant-generated question is not evidence of the user’s ability.

Each inference must retain:

- The exact user message ID and a private excerpt or content hash.
- Active Project (internally, its Build ID), context-pack, capability, and optional practice identifiers.
- The model, prompt/schema, and progression-policy versions.
- The rationale, confidence, and previous/new private estimate when a change occurs.
- A lifecycle/audit record that can be inspected, corrected, removed, or recalculated after the source is deleted.

The platform may raise an unverified level automatically, without requiring an evidence-card confirmation. Guardrails still apply: one unusually polished prompt cannot make a large jump, assistant messages never count as user signals, unrelated Builds do not contribute by default, and the system needs coherent, capability-specific signals before a higher estimate is displayed.

The user can see “Why this estimate?”, correct the underlying context, turn off inference capture for a Project, and remove eligible sources. No automatic inference is public or shareable by itself.

### Proof and verification states

| Proof status | Meaning |
| --- | --- |
| **Unverified estimate** | The private estimate is based on Build inputs and/or retained evidence but has no linked proof. |
| **Proof-linked** | The user linked relevant work or a third-party source and stated their role or connection. |
| **Source-validated** | A controlled future workflow checked the reachable source and, where possible, ownership or platform identity. This does not prove broad competence. |
| **Independently verified** | A trusted issuer, platform, qualified reviewer, or formal assessment verified the scoped claim. This is a future workflow. |

Supported proof links include an open-source repository, a public or safely visible closed-source project with a public-safe role statement, a blog/write-up or case study, a certification, and a rank or score in a relevant test. A proof must be relevant to the capability and Project contribution; a URL alone does not validate the claim.

## Core experience

### First Project

1. The first prompt is **“What have you built?”** The user starts from real work already in motion, rather than choosing an abstract skill or taking a quiz.
2. SkillForge captures the answer as a Project with a primary context pack, intended outcome, role, audience, constraints, definition of done, and optional metric/timebox.
3. The workspace can display starting skill signals where a controlled capability mapping exists. These are clearly unverified estimates, not public credentials.
4. The workspace offers a useful next action; it does not make a depth-probing AI question an onboarding gate or a test.
5. The user can open the dedicated AI Assist surface immediately.

### Project workspace

The workspace remains calm, work-first, and visually structured around the current Project:

- **Projects area:** a clickable collection of project cards plus a clear action to add a project.
- **Consolidated Project view:** an overview of context, progress, evidence, skill signals, and sharing readiness without forcing all information into one long vertical record.
- **AI Assist:** a dedicated project-help surface, analogous to a focused work console rather than a generic chatbot. It answers the user’s immediate question first.
- **Skill Portfolio:** a visible summary of the skill signals and selected proof the user is accumulating across Projects.

The assistant receives only a bounded, active Project context: its internal Build Brief, selected durable facts/decisions/artifacts, current skill/proof snapshot, and recent relevant conversation. It does not receive all user history or another Project’s context by default.

Privacy is a default technical property, not a repeated visual badge. The UI communicates proof status and offers sharing controls when they are relevant; it does not repeatedly label ordinary Projects, evidence, or estimates as “private.”

### A message in the assistant

1. The user sends a Project-related question, query, explanation, or decision through AI Assist.
2. SkillForge persists the message with an idempotency key and assembles bounded active-Project context.
3. The assistant returns a helpful answer to the user’s question.
4. In the background, it analyses the **user message** for relevant capability signals and may create a private inference event. The progression policy can then update the private unverified estimate.
5. The workspace updates the private skill overview without interrupting the answer. The user can inspect its provenance and reasoning.
6. If the message establishes a concrete decision, artifact, experiment, or outcome, the system may separately draft an evidence card for the Evidence Inbox.

The private inference and evidence-card paths are related but independent: automatic inference does not require the user to approve a card; public sharing always requires explicit selection of appropriate evidence/proof.

### Optional deeper prompts

The assistant may occasionally offer one optional, context-specific “Consider next” prompt after it has answered the user. This is a helpful way to deepen the Project, not a quiz and not a scoring mechanism.

- It is grounded in facts already present in the Project context.
- It is skippable, dismissible, and rate-limited.
- It never counts as a signal merely because the assistant asked it.
- A later user response can be analysed in the normal way because it is a user-authored Project input.

### Proof Plan

Instead of generic “skills to build,” SkillForge recommends a concrete next action that makes the work or its evidence stronger. It can suggest a test, task, challenge, public write-up, or hackathon opportunity only when the recommendation is relevant and its source/date is trustworthy.

Each item states the target capability, why it is useful for the active Project, expected output, completion criteria, and a place to attach the result. Completing a Proof Plan item does not automatically verify a level.

### Proof linking and selected sharing

The user can attach public proof to a capability/Project contribution, describe their role, and review how it will appear. For closed-source work, they must provide a public-safe role statement and explicitly confirm they may share the selected description.

To create a shareable Skill Portfolio item, the user chooses confirmed evidence, proof links, and a short public narrative; previews and redacts it; then creates an opaque, revocable share link. A public item shows only selected, public-safe snapshots with their precise proof labels. It never exposes raw chat, hidden private inferences, internal notes, or database identifiers.

## Capability and level model

SkillForge uses a controlled capability taxonomy, not an AI-invented skill list.

1. Problem framing and outcome definition
2. Research and validation
3. Planning and prioritisation
4. Solution, system, or process design
5. Execution and delivery
6. Experimentation and measurement
7. Decision-making and iteration
8. Quality, risk, and reliability
9. Communication and documentation

Context packs add domain practices below these capabilities, such as funnel-conversion experimentation or API design. The overview can present a friendly domain skill name while retaining the stable underlying capability/practice mapping.

Private estimate levels are `Not yet assessed`, `Novice`, `Beginner`, `Intermediate`, and `Advanced`. They represent the system’s current inference from the user’s Build activity and retained sources, not self-selected credentials. The system uses calibrated, versioned policy and supports correction/recalculation; it must never make an opaque global score or automatically downgrade someone for inactivity.

## Current scope and exclusions

The current product foundation includes Build Briefs, private manual evidence, controlled capability/context vocabulary, and clearly labelled Brief-derived starting estimates. It does **not** yet include the Build-aware chat assistant, automatic message inference, durable chat memory, proof linking, public sharing, or an independently verified status.

The next assistant slice must not add:

- Public-by-default portfolios or automatic publication.
- Claims that a model independently verified a person from their questions.
- Arbitrary external URL fetching, repository imports, or provider tokens.
- Hiring scores, employer grading, or a global competency score.
- A generic knowledge quiz disguised as a Build conversation.

## Product quality requirements

- The assistant must help with the user’s immediate Build question before presenting any portfolio-related material.
- Every private inference must be explainable, reversible, and scoped to a user-owned Build.
- All data and model access stays behind authenticated backend routes; client code never receives server secrets.
- Model requests use bounded context, structured output validation, idempotency, cost caps, and an operator kill switch.
- Users control Build-level capture, evidence retention, proof linking, publication, and revocation.
- Accessibility, keyboard navigation, readable contrast, and desktop/tablet workspace usability are MVP requirements.

For implementation sequencing and live status, see the [current implementation roadmap](./IMPLEMENTATION_ROADMAP.md). For the detailed assistant contract, see [AI integration](./AI_INTEGRATION.md).
