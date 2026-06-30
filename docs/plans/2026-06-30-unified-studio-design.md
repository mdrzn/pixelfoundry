# Unified Studio — Design Document

**Date:** 2026-06-30
**Status:** Approved (brainstorm complete, ready for implementation planning)
**Author:** Federico P. + Claude

---

## 0. Purpose & mandate

Merge three separate apps into **one** creative-AI product, **PixelFoundry** (`tools.mdrzn.it`):

1. **PixelFoundry** — existing image generate/edit, Next.js 15 + NextAuth + Prisma/Postgres, credit-metered.
2. **`awesome-video-prompts`** (ilkerzg, videopromptkit.com) — video studios: Shorts, Podcast, Multi-Shot, Scene Builder + Generate, Shot-Composer, JSON-Prompt, Prompt-Lab, Explore.
3. **`translator-studio`** (ilkerzg, deployed at `translate.mdrzn.it`, port 3224) — Transcribe, Translate Text, Speech-to-Speech (voice-over), Translate Image, Voice Dub, Video Dubbing (lip-sync), Auto Subtitle.

**Mandate:** zero launch urgency. Build the *best correct* implementation under one roof — one account, one credit wallet, best-in-class UI/UX. No corner-cutting, no fastest-path work. Implement the FULL pipeline and roadmap.

Both external apps are currently fal.ai-based and run generation **client-side with the user's own key**. We **invert** that: every call runs server-side under our key, metered against credits.

> Note: the inventory of `translator-studio` was performed against the **public GitHub repo**. The live `translate.mdrzn.it` is a **reworked fork** (already has Google login + credits); its internals were not readable from this environment (`/home/mdrzn` permission-denied). Do not assume the live app is purely client-side.

---

## 1. System architecture

One Next.js app, one backend, one wallet. The two external apps are **absorbed** (logic + UX patterns lifted, rewritten onto our stack), not embedded. `translate.mdrzn.it` eventually becomes a 301 redirect into the unified app.

Three layers:

1. **Surface** — task-first pages under a grouped vertical nav rail. Canvas remains an optional power surface.
2. **Orchestration** — a server-side **pipeline engine** above today's single-call jobs. Studios/dubbing are multi-step pipelines; simple tools are one-step pipelines (same engine, degenerate case).
3. **Providers** — add **fal.ai** alongside Replicate/Gemini/OpenAI. Both video studios *and* translate tools resolve to the **same** fal endpoints (ElevenLabs STT, Gemini LLM, MiniMax voice, lipsync, FFmpeg utilities).

Two load-bearing problems this design solves:
- **Storage:** base64-in-Postgres is a dead end for video/audio → real object storage behind an abstraction (Section 4).
- **Client→server inversion:** all fal calls move server-side under our key + metering.

---

## 2. Pipeline engine (the spine)

Today `createImageJob` runs **inline** and returns in seconds. Studios take **minutes** with per-scene fan-out, so we need durable background execution.

- **Queue/worker:** **BullMQ + Redis** (Redis already on the box) + a PM2-managed worker process. Web app enqueues; worker drains. Survives restarts.
- **Data model:** a `Pipeline` row is the run; **each step is a `Job`** (one provider call = one Job — exactly today's unit). The Pipeline holds an ordered DAG with dependencies and **fan-out** (e.g. "scene visuals" spawns N parallel child Jobs).
- **Intermediate assets:** every step persists its output; later steps read earlier outputs. A failed step **retries without rerunning** completed ones → checkpoint/resume for free.
- **Metering with holds:** estimate cost on submit, deduct as a **hold**; on partial failure, **refund un-run steps**, keep what executed (reuses existing `deductCredits`/`refundCredits`).
- **Progress:** worker writes step status to DB; client polls (same pattern as `/api/jobs/recent`) and renders the stage tracker.

---

## 3. fal.ai provider & model catalog

- **Enums:** add `FAL` to `Provider` and `JobProvider` (one migration). Key stored in `ProviderCredential`, server-side only.
- **Generalized provider contract:** new `src/lib/providers/fal.ts` with `runFalStep(endpoint, input)` returning assets/metadata; friendly `runImageJob`/etc. become thin wrappers.
- **Two kinds of fal endpoint:**
  - **Selectable models** (Veo 3.1, Kling, Seedance, MiniMax TTS, image models, the 9 video models…) → `ProviderModel` rows. `metadata` holds the fal endpoint id, input-field mapping (ported from the kit's `buildInput` adapters), capabilities, price. Shown in dropdowns, costed, admin-toggleable.
  - **Internal utility steps** (trim / merge / subtitle / split-audio / Ken-Burns) → NOT catalog models. Fixed operations baked into pipeline definitions; priced as part of the pipeline.
- **Reuse from kit:** model registry, `buildInput` adapters, prompt-profiles, JSON-prompt + shot-composer vocabularies → catalog metadata + seed data.

---

## 4. Storage (replacing base64-in-Postgres)

- **`StorageDriver` interface:** `put(key, stream, contentType)`, `signedUrl(key)`, `delete(key)`. Backend swappable; never leaks into feature code.
- **`Asset` gains real fields:** `storageKey`, `mimeType`, `sizeBytes`, `durationMs`, `posterKey` (still frame for video). `url` stops being base64.
- **Stream-to-storage:** the `persistExternalUrl` base64 hack is replaced — the worker streams provider CDN outputs straight into our store, never into memory as base64.
- **Range requests:** video seeking requires HTTP `Range` — handled by the serving layer (Apache alias).
- **Decision — local disk:** media lives on `/home` (5.3 TB free), served via an Apache alias with range support. **No** external object storage (avoiding cloud/egress fees pre-launch). Built behind `StorageDriver` so swapping to S3/R2 later is a config change.
  - **Risk accepted:** box is RAID0 (no redundancy) and large media is excluded from backups → local media is one disk failure from gone. Acceptable pre-launch; offsite backup revisited once there are paying customers.
- One-off migration lifts existing base64 assets out of Postgres.

---

## 5. Surface: shell & interaction archetypes

- **Vertical nav rail** (chosen over horizontal tabs). Grouped IA:
  - **Create** — Create Image, Edit Image
  - **Video Studios** — Generate, Shorts, Podcast, Multi-Shot, Scene Builder
  - **Translate** — Subtitles, Dubbing, Voice-over, Transcribe, Translate Text, Translate Image
  - **Compose** — Shot Composer, JSON Prompt, Prompt Lab
  - **Library** — My Library, Explore, Canvas
  - **Account** — Billing, Settings, Support
- **Shared "Studio Shell":** header (title + est. cost + primary action), left input panel, center pipeline tracker, right preview/result. One shell → consistency across ~20 features.
- **Two archetypes:**
  - **Instant tools** (Translate Text, Transcribe, Create/Edit Image, Translate Image) — one step, seconds; tracker collapses to a spinner.
  - **Studio pipelines** (Shorts, Podcast, Multi-Shot, Scene Builder, Dubbing, Voice-over, Subtitles) — minutes, multi-step, background worker, **resumable** (close tab, rejoin from Library/tracker).
- **Cross-cutting:** a **Smart uploader** (files → `StorageDriver`, server-side probing) replaces browser-side fal upload + browser audio code; **Result actions** (preview, download, push to Library, open in Canvas, **chain into another tool**) — chaining is the connective tissue that makes it one studio.
- **Theming:** forge/ember identity (accent `#FF6A3D`). **Both light and dark mode required.**

---

## 6. Credit metering & pricing

- **Per-step pricing:** each `ProviderModel` keeps its own `creditCost`; utility steps carry small fixed costs. Pipeline price = **sum of steps**, including fan-out (10 scenes = 10× render cost).
- **Estimate → hold → reconcile:**
  1. **Estimate** shown before running.
  2. **Hold** deducted on submit (guarded).
  3. **Reconcile** at end — charge what ran, **refund un-run steps** on partial failure.
- **Variable-cost pipelines** (e.g. Dubbing — segment count known only mid-run): **conservative hold + refund.** Hold an upper-bound (worst-case) estimate on submit; refund the difference once the real count is known. UI shows the hold as an upper bound ("up to N credits"); never charges more than shown; never stalls a run on a prompt.
- **Ledger transparency:** one `CreditLedger` parent entry per pipeline with per-step breakdown in metadata.
- **Margin decoupled from cost:** `creditCost` set per model in admin via markup over real vendor price. Pack pricing is a separate business decision (Billing packs become real when payments land — out of scope here).

---

## 7. Translation suite migration

The 7 tools are pipelines hitting the **same** fal endpoints as the studios:

| Tool | Archetype | Pipeline |
|---|---|---|
| Translate Text | instant | Gemini LLM |
| Transcribe | instant | ElevenLabs STT |
| Translate Image | instant | nano-banana OCR-edit |
| Voice-over (speech→speech) | studio | STT → translate → voice-clone → TTS |
| Subtitles | studio | auto-subtitle (transcribe + style + burn) |
| Dubbing (no lip-sync) | studio | extract audio → clone → STT → segment → per-segment translate+TTS (fan-out) → merge → mux |
| Dubbing (lip-sync) | studio | …above → lipsync |

- **Audio surgery → server-side ffmpeg.** Timestamp-accurate segment merge, silence-trim, mux — done with **our own ffmpeg binary** in the worker (NOT browser Web Audio, NOT fal ffmpeg endpoints). Most stable/reliable; keeps resume/retry/metering uniform; no device variability. (Confirm ffmpeg installed at implementation; trivial install if missing.) **Flagged as the project's main spike** — timestamp accuracy needs dedicated testing.
- **Constants** (27 languages, voices, subtitle fonts/presets) port directly as seed data.
- **Cutover:** build in PixelFoundry → parity-test vs live → 301 `translate.mdrzn.it` into unified app. Reconcile accounts (fork already has login + credits).

---

## 8. Data model & schema changes

**Principle: extend, don't replace.** Reuse `Job`/`Asset`/`CreditLedger`; layer pipelines on top. One additive migration.

**Enums**
- `Provider` += `FAL`; `JobProvider` += `FAL`
- new `PipelineType` (SHORTS, PODCAST, MULTI_SHOT, SCENE_BUILDER, DUBBING, DUBBING_LIPSYNC, VOICEOVER, SUBTITLES)
- new `PipelineStatus` (QUEUED, RUNNING, PARTIAL, COMPLETED, FAILED, CANCELED)
- `AssetType` += `AUDIO`

**New models**
- **`Pipeline`** — `id, userId, type, status, params(Json), estimatedCost, heldCost, actualCost, progress, outputAssetId?, error?, createdAt, completedAt?`
- **`PipelineStep`** — `id, pipelineId, index, name, stepType, status, jobId?, inputAssetIds[], outputAssetId?, cost, providerModelId?, attempts, startedAt?, finishedAt?` (fan-out = N rows; `jobId` links to a real `Job` when the step is a provider call)

**`Asset` additions:** `storageKey, mimeType, sizeBytes, durationMs, posterKey, width, height`; `url` becomes a served path.

**`ProviderModel`:** no structural change; `metadata` typed for fal: `{ falEndpoint, inputMap, stepType, capabilities }`.

**Relations:** `User → Pipeline[]`, `Pipeline → PipelineStep[]`, `PipelineStep → Job?`, `CreditLedger → pipelineId?`.

Nothing existing is dropped — current image/edit/video jobs keep working untouched.

---

## 9. Phased roadmap

Full roadmap to be implemented end to end. Each phase ends with a verifiable checkpoint.

- **Phase 0 — Foundations** *(no user-visible change):* schema migration; `StorageDriver` + local-disk backend + Apache range alias; migrate base64 assets out of Postgres; confirm/install ffmpeg. *Checkpoint: existing app runs unchanged on new storage.*
- **Phase 1 — fal provider, single-step:** add `FAL`, `fal.ts`, `runFalStep`, seed fal image/video models; wire into existing pages. *Checkpoint: a fal model generates end-to-end, metered, stored locally.*
- **Phase 2 — Pipeline engine:** BullMQ + Redis + PM2 worker; `Pipeline`/`PipelineStep` execution with DAG + fan-out; intermediate assets; checkpoint/resume; conservative-hold metering + partial refunds; status polling. Prove with **Multi-Shot** (fan-out, no audio). *Checkpoint: a multi-step run survives a worker restart and reconciles credits.*
- **Phase 3 — Studio Shell + Multi-Shot page:** shared shell, light+dark theming, resumable UI. *Checkpoint: first real studio usable.*
- **Phase 4 — Audio spike + Voice-over:** server-side ffmpeg timestamp-merge proven on the simplest audio pipeline first. *Checkpoint: voice-over audio lands on correct timestamps reliably.*
- **Phase 5 — Remaining studios:** Shorts, Podcast, Scene Builder.
- **Phase 6 — Translation suite:** instant tools (Text/Transcribe/Image) → Subtitles → Dubbing (±lipsync, reuses Phase 4).
- **Phase 7 — Compose & polish:** Shot Composer, JSON Prompt, Prompt Lab, Explore/prompt-library import (MIT data), Canvas chaining.
- **Phase 8 — Cutover:** parity-test vs `translate.mdrzn.it`, reconcile accounts, 301 redirect.

**Out of scope (separate tracks):** payments/Stripe, the unfinished Support/billing pages from the earlier audit.

---

## Appendix — reusable assets from source repos (MIT)

- `video-models.ts` registry + per-model `buildInput` adapters (9 video models)
- `prompt-profiles.ts` (model-specific prompt enhancement rules)
- `shot-categories.ts` (80+ shot-composer presets w/ example videos)
- `example-videos.ts` (100+ curated prompts for Explore)
- JSON-prompt category schema (8–15 cinematic categories)
- 27-language + voice + subtitle-font/preset constants (translator)

Source repos cloned to scratchpad for reference during implementation.
