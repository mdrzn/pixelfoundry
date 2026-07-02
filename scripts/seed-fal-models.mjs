// Targeted upsert of fal.ai provider models. Safe: only touches FAL rows,
// never the admin-managed catalog. (The legacy scripts/seed-provider-models.mjs
// is stale — uses the removed `jobType` field and its `update` clobbers metadata —
// do NOT run it; see the "retire legacy seed" follow-up.)
import { PrismaClient, Provider, JobType } from "@prisma/client";

const prisma = new PrismaClient();

const FAL_MODELS = [
  {
    slug: "fal-ai/flux/schnell",
    displayName: "FLUX schnell (fal)",
    description: "Fast fal.ai text-to-image. Phase 1 smoke-test model.",
    jobTypes: [JobType.CREATE_IMAGE],
    creditCost: 6,
    metadata: {
      fal: {
        falEndpoint: "fal-ai/flux/schnell",
        inputMap: { prompt: "prompt" },
        staticInputs: { num_images: 1 },
      },
    },
  },
  {
    // image-to-video model for Multi-Shot per-shot clips.
    // NOTE: inputMap field names are best-effort and MUST be validated against
    // the live fal endpoint before the first paid run (see the "seed a
    // validated fal video model" follow-up).
    slug: "fal-ai/ltx-video-13b-098-distilled/image-to-video",
    displayName: "LTX Video (fal, i2v)",
    description: "fal.ai image-to-video for Multi-Shot per-shot clips.",
    jobTypes: [JobType.CREATE_VIDEO],
    creditCost: 40,
    metadata: {
      fal: {
        falEndpoint: "fal-ai/ltx-video-13b-098-distilled/image-to-video",
        inputMap: { prompt: "prompt", image_url: "image_url", aspectRatio: "aspect_ratio" },
      },
    },
  },
  {
    // Voice-over pipeline: speech-to-text. Resolved by slug (not jobType).
    // NOTE: inputMap field names are best-effort and MUST be validated against
    // the live fal endpoint before the first paid run.
    slug: "fal-ai/elevenlabs/speech-to-text",
    displayName: "ElevenLabs STT (fal)",
    description: "fal.ai speech-to-text for the Voice-over pipeline.",
    jobTypes: [],
    creditCost: 2,
    metadata: {
      fal: {
        falEndpoint: "fal-ai/elevenlabs/speech-to-text",
        inputMap: { audio_url: "audio_url" },
      },
    },
  },
  {
    // Voice-over pipeline: text-to-speech. Resolved by slug (not jobType).
    slug: "fal-ai/minimax/speech-2.6-hd",
    displayName: "MiniMax TTS (fal)",
    description: "fal.ai text-to-speech for the Voice-over pipeline.",
    jobTypes: [],
    creditCost: 3,
    metadata: {
      fal: {
        falEndpoint: "fal-ai/minimax/speech-2.6-hd",
        inputMap: { text: "text", voice_id: "voice_id", language_boost: "language_boost" },
      },
    },
  },
  {
    // Voice-over pipeline: voice clone. Resolved by slug (not jobType).
    slug: "fal-ai/minimax/voice-clone",
    displayName: "MiniMax Voice Clone (fal)",
    description: "fal.ai voice cloning for the Voice-over pipeline.",
    jobTypes: [],
    creditCost: 2,
    metadata: {
      fal: {
        falEndpoint: "fal-ai/minimax/voice-clone",
        inputMap: { audio_url: "audio_url" },
      },
    },
  },
  // --- Studio step models (Phase 5). Resolved by SLUG. All fal endpoints/inputMaps
  // are BEST-EFFORT placeholders and MUST be validated against the live fal API
  // before any paid run. (mux/subtitle may later move to local ffmpeg — follow-up.)
  {
    slug: "fal-ai/any-llm",
    displayName: "Any LLM (fal)",
    description: "fal.ai LLM router for script/analysis steps.",
    jobTypes: [],
    creditCost: 1,
    metadata: { fal: { falEndpoint: "fal-ai/any-llm", inputMap: { prompt: "prompt" } } },
  },
  {
    slug: "fal-ai/minimax-music",
    displayName: "MiniMax Music (fal)",
    description: "fal.ai music generation for Shorts.",
    jobTypes: [],
    creditCost: 4,
    metadata: { fal: { falEndpoint: "fal-ai/minimax-music", inputMap: { prompt: "prompt" } } },
  },
  {
    slug: "fal-ai/auto-subtitle",
    displayName: "Auto Subtitle (fal)",
    description: "fal.ai auto-subtitle burn-in for Shorts.",
    jobTypes: [],
    creditCost: 3,
    metadata: { fal: { falEndpoint: "fal-ai/auto-subtitle", inputMap: { video_url: "video_url" } } },
  },
  {
    slug: "fal-ai/ffmpeg-api/mux-audio",
    displayName: "Mux Audio (fal)",
    description: "fal.ai mux audio into video (Shorts/Podcast).",
    jobTypes: [],
    creditCost: 1,
    metadata: { fal: { falEndpoint: "fal-ai/ffmpeg-api/mux-audio", inputMap: { video_url: "video_url", audio_url: "audio_url" } } },
  },
  {
    slug: "fal-ai/bytedance/seedream/v5/lite/edit",
    displayName: "Seedream Edit (fal, i2i)",
    description: "fal.ai reference-guided image edit for Scene Builder keyframes.",
    jobTypes: [],
    creditCost: 8,
    metadata: { fal: { falEndpoint: "fal-ai/bytedance/seedream/v5/lite/edit", inputMap: { prompt: "prompt", image_urls: "image_urls" } } },
  },
  {
    slug: "fal-ai/creatify/aurora",
    displayName: "Creatify Aurora Lipsync (fal)",
    description: "fal.ai lipsync (portrait + audio) for Podcast.",
    jobTypes: [],
    creditCost: 30,
    metadata: { fal: { falEndpoint: "fal-ai/creatify/aurora", inputMap: { image_url: "image_url", audio_url: "audio_url" } } },
  },
];

async function main() {
  for (const m of FAL_MODELS) {
    await prisma.providerModel.upsert({
      where: { provider_slug: { provider: Provider.FAL, slug: m.slug } },
      create: {
        provider: Provider.FAL,
        slug: m.slug,
        displayName: m.displayName,
        description: m.description,
        jobTypes: m.jobTypes,
        creditCost: m.creditCost,
        metadata: m.metadata,
      },
      update: {
        displayName: m.displayName,
        description: m.description,
        jobTypes: m.jobTypes,
        creditCost: m.creditCost,
        metadata: m.metadata,
        isActive: true,
      },
    });
    console.log(`Upserted FAL model ${m.slug}`);
  }
  console.log(`Done: ${FAL_MODELS.length} fal model(s).`);
}

main()
  .catch((error) => {
    console.error("Failed to seed fal models:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
