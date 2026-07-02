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
