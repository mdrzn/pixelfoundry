# Phase 5 — Video Studios (Shorts, Scene Builder, Podcast) — Implementation Plan

> **For Claude:** subagent-driven-development. Each studio = new fal step-runners (shared) + a pipeline definition (TDD the graph) + submit action + UI page (reuse StudioShell) + gated e2e. No new engine work.

**Goal:** Add the three remaining video studios on the Phase 2 engine + Phase 3 shell + Phase 4 audio, reusing the Multi-Shot/Voice-over patterns. Order: shared runners → Shorts (flagship) → Scene Builder → Podcast (hardest: lipsync + diarization).

**Scope:** definitions + runners + UIs + gated e2es. Fal input-maps best-effort (validate live later). Uses existing schema (PipelineType SHORTS/PODCAST/SCENE_BUILDER exist).

---

## Pre-flight
`git checkout -b phase-5-studios`

## P5-1: Shared studio step-runners
**Files:** `src/lib/pipeline/runners.ts` (extend) + tests.
Add runner step types (all via `runFalModelStep(await ctx.getModel(providerModelId), resolvedInput)`; classify output as asset vs data):
- `music` → audio asset (extractFalAssets AUDIO).
- `trim-video` → video asset (input `{ video_url, start?, duration }`).
- `mux-audio` → video asset (merge audio track into video; input `{ video_url, audio_url }`).
- `auto-subtitle` → video asset (input `{ video_url, ...style }`).
- `lipsync` → video asset (input `{ image_url|video_url, audio_url }`).
- `image-edit` → image asset (input `{ prompt, image_urls[] }` reference-guided).
Also add a `video-concat` alias if needed (the existing `merge` runner does ffmpeg video concat already — reuse it). TDD: registry resolves each new type; normalization is trivial (reuse extractFalAssets). Note the `split-audio` case (one call → many outputs) is NOT added as a normal runner (breaks one-step-one-output); Podcast handles segmentation via the STT word timestamps + per-segment `trim`/`adelay` instead (document this).

## P5-2: Shorts studio
Pipeline (bounded scenes, e.g. ≤10): `script`(llm→{scenes[],ttsScript,musicPrompt}) → `voice`(tts) → `timing`(stt on the voice) → `plan`(llm→per-scene durations) → per-scene [`scene:i:image`(image) → `scene:i:video`(video i2v) ] → `music`(music) → `merge`(video concat) → `mux-narration`(mux-audio) → `mux-music`(mux-audio) → `subtitle`(auto-subtitle). (Simplify vs the kit: skip the 3-way subtitle split + Ken Burns end-card for v1; single auto-subtitle pass.)
- Definition `definitions/shorts.ts` + TDD graph (multi-stage expand: after script→voice; after voice→timing; after timing→plan; after plan→per-scene fan-out + music + merge + mux + subtitle). estimateUpperBound bounded.
- Submit action + `/dashboard/shorts` page (topic input + aspect ratio + voice select; models resolved by slug where fixed) + nav.
- Gated e2e (written, unrun).

## P5-3: Scene Builder studio
Pipeline: `analyze`(llm→{characters[],environments[],scenes[]}) → per-character `char:i:image`(image) + per-env `env:i:image`(image) → per-scene `scene:i:keyframe`(image-edit w/ character+env refs) → `scene:i:video`(video i2v) → `merge`(video concat).
- Definition + TDD graph (expand after analyze creates char/env image steps; after those, scene keyframes referencing the ref images via `$asset`; then videos; then merge). 
- Submit + `/dashboard/scene-builder` page (story concept input) + nav. Gated e2e (unrun).

## P5-4: Podcast studio
Pipeline: `script`(llm→2-speaker lines) → `portraits`(image-edit ×2 studio portraits) → `tts`(multi-speaker) → `transcribe`(stt diarized) → per-segment `seg:i:lipsync`(lipsync: speaker portrait + that segment's audio via timestamp trim) → `merge`(video concat) → `mux`(original full audio).
- Segmentation: use the STT diarized word timestamps to compute per-speaker segments; per-segment audio via `trim`/adelay from the full TTS audio (reuse audio-merge/trim building blocks) — document the approach (avoids split-audio multi-output).
- Definition + TDD graph + submit + `/dashboard/podcast` page + nav. Gated e2e (unrun).

## P5-5: Seed studio models + nav polish + visual verify
- Seed any fal models the studios reference by slug (music, lipsync, image-edit, subtitle/trim/mux utilities as ProviderModels or fixed endpoints) — best-effort, in `seed-fal-models.mjs`.
- Playwright screenshots of all three new pages (light+dark). Build green. Merge to master.

## Definition of done (Phase 5)
- 3 studios: definitions graph-tested, submit actions tested, pages render (Playwright, both themes), nav entries, gated e2es written+unrun. `npm test` green. Merged.

**Out of scope / follow-ups:** live validation of all new fal endpoints/inputMaps + a live run per studio (credit-gated); the kit's fancier touches (3-way subtitle styling, Ken Burns end-cards, per-segment time-stretch); split-audio multi-output runner.
