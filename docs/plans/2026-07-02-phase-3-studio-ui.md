# Phase 3 — Studio Shell + Multi-Shot UI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: subagent-driven-development. UI phase — lean on build + Playwright visual verification over heavy TDD; unit-test only real logic (action param mapping, tracker status mapping).

**Goal:** The first user-facing surface for the pipeline engine — a task-first Multi-Shot studio page (brief → live pipeline tracker → merged video preview) built on a reusable Studio Shell, with a working light/dark toggle.

**Architecture:** Server component loads active fal image+video models → client form (Studio Shell layout) → a submit server action wrapping `submitPipeline` → the page polls `getPipelineStatusAction(pipelineId)` and renders a live step tracker → on COMPLETE shows the merged video. Uses the existing neutral design system + `.dark` tokens; adds a theme toggle.

**Tech Stack:** Next 15 App Router, existing shadcn-style UI + OKLch tokens, the Phase 2 pipeline engine (`submitPipeline`, `getPipelineStatusAction`), Playwright (visual verify).

**Builds on:** Phase 2 (engine). **Scope:** Multi-Shot UI only (other studios = Phase 5). Uses existing design tokens; forge/ember rebrand is a SEPARATE optional change, not in scope.

**Prereqs for LIVE use (not for building/verifying the UI):** a seeded fal video model, the PM2 `pipeline-worker` running, and credits. The page builds + renders + is visually verifiable without submitting a live pipeline.

---

## Pre-flight
Branch `phase-3-studio-ui` already created.

---

## P3-1: Light/dark theme toggle
**Files:** `src/components/theme-toggle.tsx` (new), `src/app/layout.tsx` (no-flash init script), `src/components/layout/dashboard-sidebar.tsx` (mount the toggle in the header).

- No `next-themes`. A small client `ThemeToggle`: reads/writes `localStorage.theme` ("light"|"dark"), toggles the `.dark` class on `document.documentElement`, shows a sun/moon lucide icon (Button `variant="ghost" size="icon"`).
- In `layout.tsx`, add a tiny inline `<script>` in `<head>` (or before children) that, before paint, applies `document.documentElement.classList.toggle("dark", localStorage.theme === "dark" || (!("theme" in localStorage) && matchMedia("(prefers-color-scheme: dark)").matches))` — prevents flash. (Root `<html>` already has `suppressHydrationWarning`.)
- Mount `<ThemeToggle/>` in the dashboard header (next to the credits pill).
- Verify: `npm run build` ok; a small vitest for a pure `nextTheme(current)` helper if extracted. Commit.

## P3-2: Studio Shell + Pipeline Tracker (presentational)
**Files:** `src/components/studio/studio-shell.tsx`, `src/components/studio/pipeline-tracker.tsx`, `pipeline-tracker.test.ts`.

- `StudioShell`: props `{ title, description, estCost?, action, inputPanel, tracker, preview }`. Layout: header row (title/description left, est-cost chip + action right), then a responsive grid: input panel (left), tracker (center), preview (right) — collapses to stacked on narrow screens. Pure token classes (`bg-card`, `text-foreground`, `border`, etc.) so it works in both themes.
- `PipelineTracker`: props `{ status, progress, steps: {key,name,status}[] }`. Renders a vertical stepper: done (check, success color), running (spinner), pending (muted), failed (destructive). A progress bar (existing `Progress`). Extract a pure `stepVisual(status)` → {icon,className,label} and unit-test the mapping for all StepStatus values + the pipeline status → header label.
- Commit.

## P3-3: Multi-Shot submit server action
**Files:** `src/app/(dashboard)/dashboard/multi-shot/_actions/submit-multi-shot.ts`, `submit-multi-shot.test.ts`.

- `"use server"` `submitMultiShotAction(input)`: auth via `getSession()`; Zod-validate `{ story (10-2000 chars), imageModelId, videoModelId, llmModelId?, maxShots (1-8, default 4), aspectRatio }`; call `submitPipeline({ userId, type: MULTI_SHOT, params })`; return `{ ok, pipelineId, heldCost }` or `{ ok:false, error }` (catch insufficient-credits + validation).
- Unit-test (mock `@/lib/session` + `@/lib/pipeline/submit`): valid input → calls submitPipeline with mapped params, returns pipelineId; unauthenticated → error, submit not called; invalid story → validation error, submit not called; submit throws "Insufficient credits" → `{ok:false,error}`.
- Commit.

## P3-4: Multi-Shot page + client form
**Files:** `src/app/(dashboard)/dashboard/multi-shot/page.tsx` (server), `multi-shot-form.tsx` (client), `_hooks/use-pipeline-poller.ts`.

- Page (server): auth; load fal image models (`provider:FAL, isActive, jobTypes has CREATE_IMAGE`) + fal video models (`... has CREATE_VIDEO`); map to `{value,label,creditCost}`; pass to `<MultiShotForm imageModels videoModels/>`. Render inside `DashboardPageContainer` (or full-bleed — use the standard padded container, this is a task page not a canvas).
- `MultiShotForm` (client): story textarea, image-model Select, video-model Select, maxShots (1-8), aspect-ratio quick buttons (9:16/16:9/1:1). Est-cost display (compute client-side from selected models: llm 1 + maxShots*(imageCost+videoCost) + 2). "Generate" → calls `submitMultiShotAction` → on ok, store `pipelineId`, start polling.
- `usePipelinePoller(pipelineId)`: every 3s calls `getPipelineStatusAction(pipelineId)`; returns `{status, progress, steps, outputUrl}`; stops polling on terminal status. Feeds `PipelineTracker` + preview (a `<video controls>` of `outputUrl` when COMPLETED).
- Compose with `StudioShell`. If no fal video model exists, show a clear inline notice ("No video model configured yet") instead of a broken form.
- Commit.

## P3-5: Nav entry + visual verification
**Files:** `src/lib/site-config.ts`, `src/components/layout/dashboard-sidebar.tsx`.

- Add `{ name: "Multi-Shot", href: "/dashboard/multi-shot" }` to `dashboardNav.primary` (after Create Video) + an icon in `iconMap` (e.g. `Clapperboard` or `Layers` from lucide).
- `npm run build` succeeds; route present.
- **Playwright visual check** (playwright-skill): start dev server on a free port, log in (or bypass), load `/dashboard/multi-shot`, screenshot in BOTH light and dark (toggle the class), confirm the shell/form render correctly in both. Also screenshot an existing page (e.g. create-image) in dark to confirm the toggle didn't break other pages. Do NOT submit a live pipeline.
- Commit.

## Definition of done (Phase 3)
- Light/dark toggle works; app respects it without flash.
- `/dashboard/multi-shot` renders the Studio Shell + form in both themes; nav entry highlights when active.
- Submit action validated (unit tests) and wired to `submitPipeline`; polling + tracker + preview wired to `getPipelineStatusAction`.
- `npm run build` clean; unit tests green; Playwright screenshots captured (light+dark) and reviewed.
- Merged to master. (Live submission deferred — needs worker + video model + credits.)

**Out of scope:** forge/ember global rebrand (offer separately), other studios (Phase 5), starting the worker in prod, live generation.
