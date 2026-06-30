export type ModelCapabilities = {
  supportsReferenceImages: boolean;
  supportsNegativePrompt: boolean;
  imageInputField: {
    name: string;
    acceptsMultiple: boolean;
  } | null;
  acceptedParams: string[];
};

type OpenAPISchema = {
  components?: {
    schemas?: {
      Input?: {
        type?: string;
        properties?: Record<string, unknown>;
      };
    };
  };
};

const IMAGE_INPUT_FIELD_NAMES = [
  "image",
  "input_image",
  "image_input",
  "reference_images",
  "reference_image",
  "source_image",
  "style_image",
  "control_image",
];

export function parseModelCapabilities(schema: unknown): ModelCapabilities {
  const defaultCapabilities: ModelCapabilities = {
    supportsReferenceImages: false,
    supportsNegativePrompt: false,
    imageInputField: null,
    acceptedParams: [],
  };

  if (!schema || typeof schema !== "object") {
    return defaultCapabilities;
  }

  const openAPISchema = schema as OpenAPISchema;
  const inputProperties = openAPISchema?.components?.schemas?.Input?.properties;

  if (!inputProperties || typeof inputProperties !== "object") {
    return defaultCapabilities;
  }

  const acceptedParams = Object.keys(inputProperties);

  // Detect reference images support
  let imageInputField: ModelCapabilities["imageInputField"] = null;

  for (const fieldName of IMAGE_INPUT_FIELD_NAMES) {
    const field = inputProperties[fieldName];

    if (!field || typeof field !== "object") {
      continue;
    }

    const fieldDef = field as Record<string, unknown>;

    // Check for array of URIs
    if (fieldDef.type === "array") {
      const items = fieldDef.items as Record<string, unknown> | undefined;
      if (items?.type === "string" || items?.format === "uri") {
        imageInputField = { name: fieldName, acceptsMultiple: true };
        break;
      }
    }

    // Check for single URI
    if (fieldDef.type === "string" && (fieldDef.format === "uri" || fieldName.includes("image"))) {
      imageInputField = { name: fieldName, acceptsMultiple: false };
      break;
    }
  }

  // Detect negative prompt support
  const supportsNegativePrompt = "negative_prompt" in inputProperties;

  return {
    supportsReferenceImages: imageInputField !== null,
    supportsNegativePrompt,
    imageInputField,
    acceptedParams,
  };
}
