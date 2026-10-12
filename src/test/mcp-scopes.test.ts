import { describe, expect, it } from "vitest";
import { defaultMcpPermissions, scopeAllows } from "@/lib/mcp-scopes";

describe("MCP scopes", () => {
  it("defaults to read-only", () => {
    const permissions = defaultMcpPermissions();
    expect(scopeAllows(permissions, "read", "users")).toBe(true);
    expect(scopeAllows(permissions, "update", "users")).toBe(false);
    expect(scopeAllows(permissions, "delete", "courses")).toBe(false);
  });
  it("rejects unknown resources", () => {
    expect(scopeAllows(defaultMcpPermissions(), "read", "secrets")).toBe(false);
  });
});
