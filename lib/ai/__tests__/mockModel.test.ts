import { afterEach, describe, expect, test } from "vitest";
import { createE2eMockLanguageModel, isE2eMockAiEnabled } from "../mockModel";

const ENV_VAR = "LUMORA_E2E_MOCK_AI";
const originalValue = process.env[ENV_VAR];

afterEach(() => {
  if (originalValue === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalValue;
});

describe("isE2eMockAiEnabled", () => {
  test("is false when the env var is unset", () => {
    delete process.env[ENV_VAR];
    expect(isE2eMockAiEnabled()).toBe(false);
  });

  test("is true only for the exact string \"true\"", () => {
    process.env[ENV_VAR] = "true";
    expect(isE2eMockAiEnabled()).toBe(true);
  });

  test("is false for any other value, including truthy-looking ones", () => {
    for (const value of ["1", "TRUE", "True", "yes", ""]) {
      process.env[ENV_VAR] = value;
      expect(isE2eMockAiEnabled()).toBe(false);
    }
  });

  test("is not tied to the generic CI flag", () => {
    delete process.env[ENV_VAR];
    process.env.CI = "true";
    expect(isE2eMockAiEnabled()).toBe(false);
    delete process.env.CI;
  });
});

describe("createE2eMockLanguageModel", () => {
  test("reports the requested model id and the v4 spec version streamText expects", () => {
    const model = createE2eMockLanguageModel("openai/gpt-oss-20b");
    expect(model.modelId).toBe("openai/gpt-oss-20b");
    expect(model.specificationVersion).toBe("v4");
  });

  test("streams a deterministic text response ending in a clean 'stop' finish", async () => {
    const model = createE2eMockLanguageModel("openai/gpt-oss-20b");
    // The mock never reads its call options — only exercising its own
    // canned output, not real prompt handling — so a minimal cast is fine
    // here rather than constructing a full LanguageModelV4CallOptions.
    const { stream } = await model.doStream({ prompt: [] } as never);

    const parts: unknown[] = [];
    for await (const part of stream as unknown as AsyncIterable<Record<string, unknown>>) {
      parts.push(part);
    }

    const textDeltas = parts.filter(
      (part): part is { type: string; delta: string } =>
        (part as { type?: string }).type === "text-delta",
    );
    expect(textDeltas.map((part) => part.delta).join("")).toBe("Acknowledged.");

    const finish = parts.find((part) => (part as { type?: string }).type === "finish") as
      | { finishReason: { unified: string } }
      | undefined;
    expect(finish?.finishReason.unified).toBe("stop");
  });

  test("two calls produce independent instances (no shared mutable state)", async () => {
    const first = createE2eMockLanguageModel("openai/gpt-oss-20b");
    const second = createE2eMockLanguageModel("qwen/qwen3.6-27b");
    expect(first).not.toBe(second);
    expect(first.modelId).not.toBe(second.modelId);
  });
});
