# Phase 2 — Pipeline Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans / subagent-driven-development to implement task-by-task.

**Goal:** A durable, resumable, credit-metered server-side pipeline engine that runs multi-step generation graphs (with dynamic per-item fan-out) on a background worker — proven by the Multi-Shot pipeline end-to-end.

**Architecture:** A `Pipeline` row is a run; `PipelineStep` rows are its DAG (deps + dynamic fan-out). A **BullMQ + Redis** worker (PM2-managed) drains a queue; the executor repeatedly runs steps whose deps are satisfied, persists each step's output (JSON data and/or an Asset), and survives restarts by reloading step state from the DB. Credits use **conservative hold → reconcile with partial refund** (hold an upper-bound estimate, charge only executed steps). No UI in this phase (Phase 3); verified via a gated e2e.

**Tech Stack:** BullMQ, Redis (already on box, 127.0.0.1:6379), Prisma/Postgres, fal.ai provider (Phase 1), server-side ffmpeg (merge), Vitest.

**Builds on:** Phase 0/1 (`StorageDriver`, `persistUrlToStorage`, fal `runFalStep`/`runFalImageJob`/`runFalVideoJob`, `docs/plans/2026-06-30-unified-studio-design.md` §2/§8).

**Scope boundary:** engine + Multi-Shot pipeline logic + gated e2e. NO studio UI, NO other studios, NO audio/translation. Schema changes use `npx prisma db push` (migration drift — see Phase 0/1 plan).

---

## Pre-flight
```bash
cd /home/tools/public_html/dashboard-app
git checkout -b phase-2-pipeline-engine
```

---

## Task 1: Pipeline schema

**Files:** `prisma/schema.prisma`

Add enums:
```prisma
enum PipelineType { MULTI_SHOT SHORTS PODCAST SCENE_BUILDER DUBBING DUBBING_LIPSYNC VOICEOVER SUBTITLES }
enum PipelineStatus { QUEUED RUNNING PARTIAL COMPLETED FAILED CANCELED }
enum StepStatus { PENDING RUNNING DONE FAILED SKIPPED }
```
Add models:
```prisma
model Pipeline {
  id            String         @id @default(cuid())
  userId        String
  type          PipelineType
  status        PipelineStatus @default(QUEUED)
  params        Json           @default("{}")
  estimatedCost Int            @default(0)
  heldCost      Int            @default(0)
  actualCost    Int            @default(0)
  progress      Int            @default(0)   // 0-100
  outputAssetId String?
  error         String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  completedAt   DateTime?

  user        User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  outputAsset Asset?         @relation("PipelineOutputAsset", fields: [outputAssetId], references: [id], onDelete: SetNull)
  steps       PipelineStep[]

  @@index([userId])
  @@index([status])
}

model PipelineStep {
  id              String     @id @default(cuid())
  pipelineId      String
  key             String     // stable within a pipeline, e.g. "shots", "shot:2:image"
  name            String
  stepType        String     // "llm" | "image" | "video" | "merge" | ...
  status          StepStatus @default(PENDING)
  dependsOn       String[]   @default([])   // step keys
  input           Json       @default("{}")
  output          Json?      // structured data output (e.g. shots list)
  outputAssetId   String?
  providerModelId String?
  cost            Int        @default(0)
  attempts        Int        @default(0)
  error           String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  startedAt       DateTime?
  finishedAt      DateTime?

  pipeline    Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  outputAsset Asset?   @relation("StepOutputAsset", fields: [outputAssetId], references: [id], onDelete: SetNull)

  @@unique([pipelineId, key])
  @@index([pipelineId])
}
```
Relations to add: `User { pipelines Pipeline[] }`; `Asset { pipelineOutputs Pipeline[] @relation("PipelineOutputAsset")  stepOutputs PipelineStep[] @relation("StepOutputAsset") }`; `CreditLedger { pipelineId String? }` + `pipeline Pipeline? @relation(...)` and back-relation on Pipeline (`creditEntries CreditLedger[]`).

Apply: `npx prisma db push` (NOT migrate dev). Verify `npx tsc --noEmit`. Commit.

---

## Task 2: Redis + BullMQ install & connection

**Files:** `package.json`, `src/lib/queue/connection.ts`, `.env.example`

- `npm install bullmq ioredis`
- `src/lib/queue/connection.ts`: export a shared ioredis connection from `REDIS_URL` (default `redis://127.0.0.1:6379`) with `maxRetriesPerRequest: null` (BullMQ requirement).
- Add `REDIS_URL` to `.env.example`.
- Commit. (No test — pure config; verified when the queue runs.)

---

## Task 3: Step-output resolution helpers (TDD, pure)

**Files:** `src/lib/pipeline/refs.ts`, `src/lib/pipeline/refs.test.ts`

The executor passes prior step outputs into later steps via references. Implement pure helpers:
- `resolveInput(input: Json, outputsByKey: Record<string, StepOutput>): Json` — replaces reference tokens like `{ "$ref": "shots.output.shots[2]" }` or `{ "$asset": "shot:2:image" }` with actual values / asset URLs from completed steps.
- `StepOutput = { data?: unknown; assetUrl?: string; assetId?: string }`.

Test: ref to data path, ref to asset URL, nested refs in arrays/objects, missing ref throws. TDD. Commit.

---

## Task 4: Pipeline definition interface + Multi-Shot definition (TDD the planner)

**Files:** `src/lib/pipeline/types.ts`, `src/lib/pipeline/definitions/multi-shot.ts`, `multi-shot.test.ts`

- `types.ts`: 
  ```ts
  export type PlannedStep = { key: string; name: string; stepType: string; dependsOn: string[]; input: unknown; providerModelId?: string; cost: number };
  export interface PipelineDefinition {
    type: PipelineType;
    // initial steps from params (before any dynamic fan-out)
    plan(params: unknown, ctx: PlanContext): PlannedStep[];
    // given a completed step's output, expand dynamic fan-out steps (or [])
    expand(step: PipelineStepRecord, ctx: PlanContext): PlannedStep[];
    // upper-bound cost estimate for the hold
    estimateUpperBound(params: unknown, ctx: PlanContext): number;
  }
  ```
- `multi-shot.ts`: Multi-Shot = (1) `shots` LLM step: story→JSON array of N shots (bounded, e.g. max 8); (2) after `shots` completes, `expand` creates per-shot `shot:i:image` (fan-out, image model) then `shot:i:video` (depends on that image), then a final `merge` step (depends on all videos). `estimateUpperBound` assumes max shots. Costs from provider models + a fixed merge cost.
- TDD the pure `plan`/`expand`/`estimateUpperBound` with a fake ctx (model costs), asserting the produced step graph shape for a 3-shot output. Commit.

---

## Task 5: Step runners registry (TDD dispatch)

**Files:** `src/lib/pipeline/runners.ts`, `runners.test.ts`

Map `stepType` → an async runner `(step, resolvedInput, ctx) => Promise<StepResult>` where `StepResult = { data?: unknown; asset?: ProviderRunAsset }`:
- `llm`: call fal `runFalStep` on an LLM endpoint (e.g. `fal-ai/any-llm`), parse JSON from the response text. (Keep the endpoint/model configurable via the step's providerModel/input.)
- `image`: call `runFalImageJob`-style via the model; return the asset.
- `video`: same for video.
- `merge`: run **server-side ffmpeg** to concat the input video assets into one; return the merged asset (written via `persistBytesToStorage`/StorageDriver).
- TDD what's unit-testable: the registry lookup + the JSON-extraction helper for `llm` (mock runFalStep). ffmpeg merge gets an integration check in the e2e. Commit.

---

## Task 6: The executor (TDD core state machine)

**Files:** `src/lib/pipeline/executor.ts`, `executor.test.ts`

Core loop (pure-ish, DB-backed):
- `runPipeline(pipelineId)`: load pipeline + steps; loop: find PENDING steps whose `dependsOn` are all DONE → mark RUNNING → resolve input (Task 3) → run (Task 5) → persist output (data → `step.output`; asset → create Asset via `persistUrlToStorage`, set `outputAssetId`) → mark DONE; after a step completes, call definition `expand` and insert any new steps. Update `progress`. Stop when all DONE (→ finalize) or a step FAILS (→ mark pipeline PARTIAL/FAILED). Support bounded parallelism for independent runnable steps.
- **Checkpoint/resume:** all state is in DB; re-invoking `runPipeline` after a crash re-derives runnable steps and skips DONE ones (their outputs persisted). A step retried increments `attempts`.
- **Reconcile credits on terminal:** `actualCost = sum(cost of DONE steps)`; refund `heldCost - actualCost` (never negative) via existing `refundCredits`; write a ledger entry referencing `pipelineId`.
- TDD with **fake runners** (inject the runner registry) and an in-memory/mocked prisma OR a real test DB: assert (a) linear deps run in order, (b) fan-out expands and runs, (c) a mid-graph failure stops downstream and reconciles refund correctly, (d) resume skips DONE steps. Prefer injecting runners + a thin persistence port so the core is testable without network. Commit.

---

## Task 7: Submit + metering (TDD the hold math)

**Files:** `src/lib/pipeline/submit.ts`, `submit.test.ts`

- `submitPipeline({ userId, type, params })`: resolve definition; `estimateUpperBound`; **deduct hold** (existing `deductCredits`, guarded); create `Pipeline` (status QUEUED, heldCost=estimate) + initial `plan()` steps in a transaction + ledger DEDUCT entry referencing pipelineId; enqueue a BullMQ job `{ pipelineId }`; return `{ pipelineId, heldCost }`. On insufficient credits, throw before enqueue.
- TDD the estimate/hold interaction with fakes: enough credits → hold deducted = estimate; insufficient → throws, nothing enqueued. Commit.

---

## Task 8: Worker entry + PM2

**Files:** `src/worker/index.ts`, `ecosystem.config.js`, `package.json` (script)

- `src/worker/index.ts`: a BullMQ `Worker` on the pipeline queue that calls `runPipeline(job.data.pipelineId)`; concurrency from env; graceful shutdown. Run via `tsx` (add `tsx` devDep) — script `"worker": "tsx src/worker/index.ts"`.
- Add a PM2 entry `pixelfoundry-worker` to `ecosystem.config.js`.
- Commit. (Runtime verified in e2e.)

---

## Task 9: Status server action + polling shape

**Files:** `src/app/(dashboard)/dashboard/_actions/pipeline-status.ts` (or reuse pattern), `pipeline-status.test.ts`

- `getPipelineStatusAction(pipelineId)`: auth via getSession; return `{ status, progress, steps: [{key,name,status}], outputUrl? }` for the owner. (This is what Phase 3's UI will poll.)
- Light test of the mapping/ownership guard. Commit.

---

## Task 10: Multi-Shot gated e2e

**Files:** `src/lib/pipeline/multi-shot.e2e.test.ts`

Gated behind `RUN_PIPELINE_E2E=1` (costs fal credits — keep gated). Submits a Multi-Shot pipeline for a test user with a short story (force max 2–3 shots to limit spend), runs the executor inline (or drains the queue once), asserts: pipeline COMPLETED, N image + N video + 1 merge steps DONE, a final merged video asset stored at `/media/...`, credits reconciled (charged = sum of steps, hold refunded down to actual). Also a **resume** assertion: mark the pipeline mid-run (one video step PENDING), re-run, confirm it finishes without re-running DONE steps. Commit.

---

## Definition of done (Phase 2)
- `npm test` green (unit tests: refs, definition planner, runners registry, executor state machine w/ fakes, submit metering, status mapping); pipeline e2e gated + passing when run once.
- A Multi-Shot run: survives a worker restart (resume), fans out per-shot, produces one merged video on local disk, and reconciles credits (conservative hold → partial refund).
- Existing image/edit/video single-call jobs untouched.
- Branch merged to master.

**Out of scope / follow-ups:** studio UI (Phase 3), other studios (Phase 5), audio (Phase 4), retry backoff tuning, dead-letter handling for permanently stuck pipelines.
