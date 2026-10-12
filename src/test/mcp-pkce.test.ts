import { describe, expect, it } from "vitest";
import { createPkceChallenge } from "@/lib/mcp-pkce";

describe("MCP PKCE", () => {
  it("creates S256 verifier and challenge", async () => {
    const result = await createPkceChallenge();
    expect(result.method).toBe("S256");
    expect(result.verifier.length).toBeGreaterThan(40);
    expect(result.challenge.length).toBeGreaterThan(30);
    expect(result.challenge).not.toBe(result.verifier);
  });
});
