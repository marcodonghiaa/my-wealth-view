import { describe, expect, it } from "vitest";
import { functionErrorMessage } from "./function-error";

const FALLBACK = "Couldn't load banks for this country.";

describe("functionErrorMessage", () => {
  it("returns the function's own error text from the response body", async () => {
    const error = {
      context: new Response(
        JSON.stringify({ error: "Your Enable Banking app was rejected: activate it" }),
        { status: 502 },
      ),
    };
    expect(await functionErrorMessage(error, FALLBACK)).toBe(
      "Your Enable Banking app was rejected: activate it",
    );
  });

  it.each([
    ["a non-JSON body", { context: new Response("not json", { status: 502 }) }],
    ["a JSON body without a string error", { context: new Response('{"error":42}') }],
    ["an empty error string", { context: new Response('{"error":""}') }],
    ["a plain Error", new Error("x")],
    ["null", null],
    ["undefined", undefined],
    ["a string", "boom"],
    ["a non-Response context", { context: { error: "spoof" } }],
  ])("falls back for %s", async (_label, error) => {
    expect(await functionErrorMessage(error, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back when the body was already read", async () => {
    const context = new Response(JSON.stringify({ error: "gone" }));
    await context.text();
    expect(await functionErrorMessage({ context }, FALLBACK)).toBe(FALLBACK);
  });
});
