/**
 * Live-model check that the extraction path actually works end to end
 * against the real Groq API — the one thing mocked tests can't prove.
 * Directly responsible for two real findings during this module's own
 * development: Groq's `response_format: json_schema`/`json_object` modes
 * both reject any request that also contains image content ("invalid image
 * data"), which is why extraction.ts forces a single non-application tool
 * call instead of using `generateObject()`. Opt-in only, same reasoning as
 * topicRecovery.live.test.ts: non-deterministic, real Groq quota usage, not
 * part of the default `vitest run`. Run explicitly with:
 *
 *   RUN_LIVE_AI_TESTS=1 npx vitest run lib/ai/__tests__/extraction.live.test.ts
 */
import { describe, test, expect } from "vitest";
import { extractImageContent, imageExtractionSchema } from "../extraction";

const RUN_LIVE = process.env.RUN_LIVE_AI_TESTS === "1";

// A real, decodable 64x64 PNG (a red circle on white) — big enough for
// Groq to actually accept as image content. The 2x2 pixel fixture used
// elsewhere (e2e/generate-vision.spec.ts, which only ever exercises a
// mocked /api/chat route) is too small for the real API — confirmed
// directly: it fails with "invalid image data" against the live endpoint.
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAD30lEQVR4nOyaS0sbURTHT5KZ1HQaH7GtaVpLSxeFdlPsa9MHSKGlO3Elgk/wRfZuBN0IfgAf+EJQRHe6FIyCKOIDBVe6UlGT+IqJxiTqJJMedCfcO4/EzLXkR8gi91xy/nPv3DlzzuHi8TjcZ4xwz0kL0Ju0AL1JC9AbDpJH/PIysrQUWV0VPZ7owYG4v4/f+Dtvt3N5efjhHQ5LQYHlyxfDgweQJAyJP8iiXm9wYiI0OxtZXo5fXcnaG8xm1CB8+2b9+xdVQWIkJCDm9/s6OgKjoyCKoB5ch5yyspyqKpPNBlrRKCAeCp30958MDMTDYUgMgyDYKitRhlEQQD1aBFxtbrobGsStLUge5jdvHN3d5vx8UIlqAaH5ea/TKYVCkGyM2dnPOzstHz+qm6XKOjAy4q6uvgvvESkQ2C0vPxsfVzVLhYDTkZHDlhaQJLg7RHG/sRH/SPkMpVsosrKyW1YG0SikAI7LHxxUuJcUCRC93p2iIjw0IVWYcnJejo3xz57JWspvodj5uaeuLpXew/UTxlNfL11cyFrKCwgMDFxubEDKuVxf9/f2yprJbKHo0dH2nz/S+TnogdFqfT09bcrMpNkAlZOeHr08R6Rg0N/TQ7ehrQBe/q3CQiXx2d2B8dJrl4t7+pRkQFuBkMulr/dwHaKHpqYoBjQBQZcLGIDuBlEAnp7hxUVgAHSDshGIAsIzM9qi/OQjiuGFBdIgUQAew8AMF2trpCHiOzEeQcAM4t4eaYgoQHS7gRkozpBX4PgYmIHiDFFAjKUtRHHm/83MmZ48AWagOEMUwD1+DMxAcYZ4D3AsrQDFGaIAE0srQHGGuIUsHz4AM1CcIQp4+OMH8DywAM8LP3+SBsmnkNX68OtXYAB0w/joEWmU9hyw/voFDEB3gyZAKCwEBhA0C8DqQ67TCbqCDtAPdJm0SiwY3P79O+bzgR5g4ePV5KSJfAOAbCyEt7KtpgZ0wlZbS/celARz2aWllk+fIOVkFBTgX8uaKUruRn2+neJiLOZBquDsdkzucgpqZ4rCaS4319HRgVlvSAmYzHJ0dXHKKn9K3wcy3r/Pa2qClGBva8t4906hsYqLmlVSgrvtsLX1DtMtPJ/X3Iz1Y+UzVBf5sBDvxsx9IADJBt9aHO3taoNILWVWTHJ4nM7kJo7Mb9++6OujJHFJaC10i2JgaMjX1SWdnUFiGDMzc2trs8vLDZqC34RaDaTTU19np394WHurQUWFrbramJUFWkles8fcXGRpSWmzx+fPwvfv+jd73OJWu81Nxw1cB4U3HTeMttvoS7rlTG/SAvQmLUBv7r2AfwAAAP//wjmGCwAAAAZJREFUAwDdaJ6ZQokcxgAAAABJRU5ErkJggg==";

describe.skipIf(!RUN_LIVE)("extractImageContent (live model)", () => {
  test(
    "returns a schema-valid extraction for a real image, from a real Groq call with no tools",
    async () => {
      const result = await extractImageContent({
        image: { mediaType: "image/png", filename: "photo.png", url: `data:image/png;base64,${VALID_PNG_BASE64}` },
        userText: "What color is this?",
      });

      expect(imageExtractionSchema.safeParse(result).success).toBe(true);
      expect(typeof result.summary).toBe("string");
      expect(result.summary.length).toBeGreaterThan(0);
    },
    60000,
  );
});
