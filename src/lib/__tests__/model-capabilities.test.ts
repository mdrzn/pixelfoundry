import { describe, it, expect } from "vitest";
import { parseModelCapabilities } from "../model-capabilities";

describe("parseModelCapabilities", () => {
  it("should detect reference images support from image input field", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              image: { type: "string", format: "uri" },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsReferenceImages).toBe(true);
    expect(capabilities.imageInputField).toEqual({
      name: "image",
      acceptsMultiple: false,
    });
  });

  it("should detect multiple reference images from array input", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              reference_images: {
                type: "array",
                items: { type: "string", format: "uri" },
              },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsReferenceImages).toBe(true);
    expect(capabilities.imageInputField).toEqual({
      name: "reference_images",
      acceptsMultiple: true,
    });
  });

  it("should detect negative prompt support", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              negative_prompt: { type: "string" },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsNegativePrompt).toBe(true);
  });

  it("should handle missing schema gracefully", () => {
    const capabilities = parseModelCapabilities(null);

    expect(capabilities.supportsReferenceImages).toBe(false);
    expect(capabilities.supportsNegativePrompt).toBe(false);
    expect(capabilities.imageInputField).toBe(null);
  });

  it("should detect text-only models", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              width: { type: "integer" },
              height: { type: "integer" },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsReferenceImages).toBe(false);
    expect(capabilities.imageInputField).toBe(null);
  });
});
