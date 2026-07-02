# Phase 4 — Audio Spike + Voice-over — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: subagent-driven-development. The ffmpeg audio-merge is the project's flagged spike — TDD the pure arg-builder hard; validate real ffmpeg in a gated e2e.

**Goal:** Prove server-side, timestamp-accurate audio assembly (the hardest remaining integration) on the simplest audio pipeline — **Voice-over** (speech→translated-speech in a cloned voice) — reusing the Phase 2 engine + Phase 3 Studio Shell.

**Architecture:** New fal step-runners (STT with word timestamps, TTS, voice-clone) added to the Phase 2 runner registry. A new **audio-merge** runner uses OUR ffmpeg to place per-segment translated speech at the original timestamps (adelay + mix onto a silent bed). The Voice-over pipeline: `transcribe → translate → clone-voice → (per-segment TTS: fan-out) → audio-merge`. UI = a Studio Shell page (upload audio + pick target language → translated-audio player). Uploads extended to accept audio.

**Tech Stack:** Phase 2 engine, fal (ElevenLabs STT / MiniMax voice-clone + TTS / Gemini translate via any-llm), server ffmpeg 5.1.6, Vitest.

**Scope:** Voice-over only. NO video Dubbing/lipsync (Phase 6), NO Shorts/Podcast (Phase 5). Schema unchanged (VOICEOVER enum already exists). `AssetType.AUDIO` already exists.

---

## Pre-flight
`git checkout -b phase-4-audio-voiceover`

## P4-1: Audio upload support
**Files:** `src/app/api/uploads/route.ts`.
- Extend the MIME allowlist + magic-byte checks to accept common audio (mp3 `audio/mpeg`, wav `audio/wav`/`audio/x-wav`, m4a/mp4 audio, webm audio) alongside images. Raise the size cap for audio (e.g. 25 MB) while keeping the image cap. Set `AssetType.AUDIO` for audio uploads (currently hardcoded IMAGE). Persist via the existing StorageDriver path (already generic). Keep all existing image behavior.
- Unit-test the pure MIME/type→AssetType + magic-byte helpers if extracted; otherwise verify via build + a small test of the type-detection helper.

## P4-2: Audio step-runners (fal)
**Files:** `src/lib/pipeline/runners.ts` (extend), `src/lib/pipeline/audio-runners.test.ts`.
Add step types to the registry:
- `stt`: fal ElevenLabs speech-to-text with word timestamps + diarization. Input `{ audio_url }`. Returns `{ data: { text, words: [{text,start,end,speaker_id?}] } }` (normalize the fal response shape).
- `tts`: fal MiniMax speech. Input `{ prompt/text, voice_id?, language_boost? }`. Returns `{ asset: <audio> }`.
- `voice-clone`: fal MiniMax voice-clone. Input `{ audio_url }`. Returns `{ data: { voice_id } }`.
- Reuse the existing `llm` runner for translate (different prompt).
TDD: the response-normalization helpers (mock `runFalStep`) — extracting `words[]` from STT, `voice_id` from clone. Exact fal endpoints go in step input/model metadata; keep endpoints configurable. Do NOT call fal live.

## P4-3: Audio timestamp-merge (THE SPIKE)
**Files:** `src/lib/pipeline/audio-merge.ts`, `audio-merge.test.ts`, wire an `audio-merge` runner in `runners.ts`.
- Pure `buildAudioMergeArgs(segments: {startMs:number; file:string}[], totalMs:number, outFile:string): string[]` → ffmpeg args that lay each segment onto a silent bed of `totalMs` at its `startMs` offset using `adelay` + `amix` (normalize=0), output a single audio file. Include a silent-anchor input (`anullsrc`) of `totalMs` so gaps are preserved and total duration is exact.
- TDD `buildAudioMergeArgs`: correct `-i` per segment, `adelay=startMs|startMs` per segment, an `amix` with `inputs = N+1` (segments + silent bed), `-t <seconds>` bound, output path. Assert ordering + that a 0ms segment yields `adelay=0|0`.
- The `audio-merge` runner: resolves `$assetId` segment inputs → temp files (via `ctx.readAsset`), builds args, runs `ffmpeg` (execFile), persists the result via StorageDriver, returns `{ asset }`. (Executed for real only in the gated e2e.)

## P4-4: Voice-over pipeline definition
**Files:** `src/lib/pipeline/definitions/voiceover.ts`, `voiceover.test.ts`, register in `definitions/index.ts`.
Params: `{ audioAssetId, targetLanguage, sttModelId?, ttsModelId?, cloneModelId?, llmModelId? }`.
- `plan`: `transcribe` (stt, input `{ $asset-url of audioAssetId }`), then it needs the transcript before segmenting — so `expand` after `transcribe`: a `translate` step (llm; prompt embeds transcript + target language, returns `{segments:[{text,startMs}]}`), a `clone` step (voice-clone from the input audio), then after `translate` completes, per-segment `seg:i:tts` (fan-out, depends on clone + translate), then `audio-merge` (depends on all seg TTS). (Two expand stages: after transcribe → add translate+clone; after translate → add per-seg TTS + merge. The executor already supports expand after any step.)
- `estimateUpperBound`: stt + translate(llm) + clone + MAX_SEGMENTS*tts + merge. Cap segments (e.g. 40).
- TDD the graph shape with a fake ctx: plan has transcribe; expand(transcribe)→translate+clone; expand(translate w/ 3 segments)→3 tts + merge with correct deps ($assetId refs to seg audios).

## P4-5: Voice-over submit action + UI page
**Files:** submit action + `/dashboard/voiceover/page.tsx` + form + nav entry.
- Submit action: auth + Zod (`audioAssetId`, `targetLanguage`, model ids) → `submitPipeline({type: VOICEOVER, params})`. Unit-tested like P3-3.
- Page: StudioShell. Input panel: audio uploader (reuse `/api/uploads`, now audio-capable) + target-language Select (port the translator's 27-language list as a constant) + model pickers (fal STT/TTS/clone models). Tracker + Preview (an `<audio controls>` of the output). Nav entry "Voice-over".
- Verify via build + Playwright screenshot (light+dark). Do NOT submit live.

## P4-6: Gated Voice-over e2e
**Files:** `src/lib/pipeline/voiceover.e2e.test.ts` — gated `RUN_PIPELINE_E2E=1`, env-configurable models, needs a real short audio input. Asserts: pipeline COMPLETED, an output AUDIO asset on local disk, credit reconcile, and (the spike) the merged audio duration ≈ the source duration (ffprobe). WRITTEN, NOT RUN.

## Definition of done (Phase 4)
- `buildAudioMergeArgs` + audio runner-normalizers unit-tested; Voice-over definition graph tested; submit action tested. `npm test` green.
- `/dashboard/voiceover` renders in both themes (Playwright).
- Audio uploads work; new step types registered.
- Gated e2e written (unrun). Merged to master.

**Out of scope / follow-ups:** live audio run + validating fal audio endpoints/inputMaps (like the video model, best-effort until validated); Dubbing+lipsync (Phase 6); overlapping-segment handling beyond amix; per-segment time-stretch (translator did it in-browser — note as a refinement).
