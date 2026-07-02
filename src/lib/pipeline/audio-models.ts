export const AUDIO_MODEL_SLUGS = {
  stt: "fal-ai/elevenlabs/speech-to-text",
  tts: "fal-ai/minimax/speech-2.6-hd",
  clone: "fal-ai/minimax/voice-clone",
} as const;

/**
 * Slug-resolved models for the Shorts studio. `script` and `voice` reuse
 * established fal slugs; `music`, `subtitle`, and `mux` are placeholder fal
 * slugs seeded in P5-5 (adjust once the real fal endpoints are confirmed).
 */
export const SHORTS_MODEL_SLUGS = {
  script: "fal-ai/any-llm",
  voice: "fal-ai/minimax/speech-2.6-hd",
  music: "fal-ai/minimax-music",
  subtitle: "fal-ai/auto-subtitle",
  mux: "fal-ai/ffmpeg-api/mux-audio",
} as const;

/**
 * Slug-resolved models for the Scene Builder studio. `script` reuses the
 * established any-llm slug; `imageEdit` is a placeholder fal slug seeded in
 * P5-5 (adjust once the real reference-guided edit endpoint is confirmed).
 * Image + video models are resolved by job type at submit time.
 */
export const SCENE_BUILDER_MODEL_SLUGS = {
  script: "fal-ai/any-llm",
  imageEdit: "fal-ai/bytedance/seedream/v5/lite/edit",
} as const;

/**
 * Slug-resolved models for the Podcast studio. `script`, `tts`, and `stt` reuse
 * established fal slugs; `lipsync` is a placeholder fal slug seeded in P5-5
 * (adjust once the real lip-sync endpoint is confirmed). The image model is
 * resolved by job type at submit time.
 */
/**
 * Slug-resolved models for the asset-output translation tools (P6-2).
 * `translateImage` reuses the Scene Builder seedream edit slug (already seeded)
 * so no new provider model is required; `subtitle` reuses the auto-subtitle
 * slug seeded in P5-5.
 */
export const TRANSLATION_ASSET_MODEL_SLUGS = {
  translateImage: SCENE_BUILDER_MODEL_SLUGS.imageEdit,
  subtitle: SHORTS_MODEL_SLUGS.subtitle,
} as const;

export const PODCAST_MODEL_SLUGS = {
  script: "fal-ai/any-llm",
  tts: "fal-ai/minimax/speech-2.6-hd",
  stt: "fal-ai/elevenlabs/speech-to-text",
  lipsync: "fal-ai/creatify/aurora",
} as const;
