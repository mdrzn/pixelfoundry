# Phase 6 — Translation Suite — Implementation Plan

> **For Claude:** subagent-driven-development. All tools = pipelines on the existing engine + shell. One shared enhancement: expose terminal data output in status (for text tools).

**Goal:** Bring the translator-studio tools into the unified app as pipelines: Translate Text, Transcribe, Translate Image, Subtitles, Dubbing (±lip-sync). (Voice-over / speech-to-speech already shipped in Phase 4.) `translate.mdrzn.it` becomes a redirect after this (Phase 8, out of scope here).

**Architecture:** New pipeline definitions reusing existing runners (llm, stt, image-edit, auto-subtitle, tts, voice-clone, audio-merge, mux-audio, lipsync, trim-audio, merge). One status enhancement: `getPipelineStatus` returns the terminal sink step's `output` data as `outputData` (text tools render it; media tools keep `outputUrl`). New UI pages reuse StudioShell + poller. Nav grows a "Translate" cluster.

**Scope:** the 5 tools above. Enum values (DUBBING, DUBBING_LIPSYNC, SUBTITLES) exist; add `TRANSLATE_TEXT`, `TRANSCRIBE`, `TRANSLATE_IMAGE` PipelineType values (db push). Fal inputMaps best-effort.

---

## Pre-flight
`git checkout -b phase-6-translation`. Add PipelineType `TRANSLATE_TEXT`, `TRANSCRIBE`, `TRANSLATE_IMAGE` (db push, NOT migrate dev).

## P6-1: Status data-output + instant text tools (Translate Text, Transcribe)
- **Status enhancement:** `src/lib/pipeline/status.ts` — add `outputData: unknown | null` to `PipelineStatusView` = the terminal sink step's `output` (find the sink DONE step; return its `output`). Small test.
- **Translate Text** definition (`TRANSLATE_TEXT`): 1 step `translate` (llm, prompt embeds text + target language, returns `{text}` — or raw). Params `{ text, targetLanguage, llmModelId? }`. estimate = llm cost.
- **Transcribe** definition (`TRANSCRIBE`): 1 step `transcribe` (stt). Params `{ audioAssetId→audioUrl, sttModelId }`. output data = `{text, words}`.
- Submit actions + a shared/simple page each (`/dashboard/translate-text`, `/dashboard/transcribe`): StudioShell; text tools render `outputData.text` in the Preview panel (read-only textarea / copy button) instead of a media element. Poller already returns terminal status; use `outputData`.
- Nav: "Translate Text", "Transcribe". TDD definitions + submit actions.

## P6-2: Translate Image + Subtitles (asset output)
- **Translate Image** (`TRANSLATE_IMAGE`): 1 step `image-edit` (nano-banana OCR+translate+rerender). Params `{ imageAssetId→url, targetLanguage, editModelId }`. Output = image asset. Page: image upload + target language; Preview = image.
- **Subtitles** (`SUBTITLES`): 1 step `auto-subtitle` on an uploaded video. Params `{ videoAssetId→url, targetLanguage?, subtitleModelId, ...style }`. Output = video asset. Page: video upload + options; Preview = video.
- Submit actions + pages + nav ("Translate Image", "Subtitles"). Uploads already accept images; ensure video upload allowed (extend classifyUpload to video/mp4,webm if not already — check P4-1). TDD.

## P6-3: Dubbing (±lip-sync)
- **Dubbing** (`DUBBING`): video in → extract audio (a `trim-audio`/ffmpeg "extract-audio" step, or reuse: mux-audio's inverse) → transcribe → translate(segments) → clone → per-seg tts → audio-merge → mux merged audio back into the ORIGINAL video. Reuses the Voice-over graph + a mux into the source video. 
- **Dubbing lip-sync** (`DUBBING_LIPSYNC`): same, then per-segment lipsync using the source video frames (or portrait) — simplest v1: after producing dubbed audio, run a single lipsync over the source video + dubbed audio (`fal sync-lipsync`). So DUBBING_LIPSYNC = DUBBING + a final `lipsync` step (video + dubbed audio) as the sink.
- Needs an "extract audio from video" step: add a small ffmpeg runner `extract-audio` (ffmpeg -i video -vn audio.mp3) — pure arg-builder + runner, TDD.
- Definition(s) + submit + one page with a lip-sync toggle (chooses DUBBING vs DUBBING_LIPSYNC) + nav "Dubbing". TDD graphs.

## P6-4: Seed models + visual verify + cutover note + merge
- Seed any new fal models by slug (image-translate/nano-banana-edit, sync-lipsync) — best-effort.
- Playwright screenshots of the new pages (light+dark). Build green.
- Add a note/task for Phase 8 cutover (301 translate.mdrzn.it). Merge Phase 6 to master.

## Definition of done (Phase 6)
- 5 translation tools as pipelines: definitions graph-tested, submit actions tested, pages render (Playwright), nav entries, status exposes text output. `npm test` green. Merged.

**Out of scope / follow-ups:** live validation of fal translation endpoints; the 301 cutover (Phase 8); advanced dubbing (per-segment lipsync vs whole-video); subtitle style presets (TikTok/YouTube/Karaoke from the translator).
