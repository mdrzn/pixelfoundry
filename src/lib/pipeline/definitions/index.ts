import { PipelineType } from "@prisma/client";
import type { PipelineDefinition } from "../types";
import { multiShotDefinition } from "./multi-shot";
import { voiceoverDefinition } from "./voiceover";
import { shortsDefinition } from "./shorts";
import { sceneBuilderDefinition } from "./scene-builder";
import { podcastDefinition } from "./podcast";
import { translateTextDefinition } from "./translate-text";
import { transcribeDefinition } from "./transcribe";
import { translateImageDefinition } from "./translate-image";
import { subtitlesDefinition } from "./subtitles";
import { dubbingDefinition } from "./dubbing";

const REGISTRY: Partial<Record<PipelineType, PipelineDefinition>> = {
  [PipelineType.MULTI_SHOT]: multiShotDefinition,
  [PipelineType.VOICEOVER]: voiceoverDefinition,
  [PipelineType.SHORTS]: shortsDefinition,
  [PipelineType.SCENE_BUILDER]: sceneBuilderDefinition,
  [PipelineType.PODCAST]: podcastDefinition,
  [PipelineType.TRANSLATE_TEXT]: translateTextDefinition,
  [PipelineType.TRANSCRIBE]: transcribeDefinition,
  [PipelineType.TRANSLATE_IMAGE]: translateImageDefinition,
  [PipelineType.SUBTITLES]: subtitlesDefinition,
  [PipelineType.DUBBING]: dubbingDefinition,
};

export function getDefinition(type: PipelineType): PipelineDefinition {
  const def = REGISTRY[type];
  if (!def) throw new Error(`No pipeline definition registered for type ${type}`);
  return def;
}
