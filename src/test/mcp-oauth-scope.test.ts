import { describe, expect, it } from "vitest";
import { isValidScope, parseScopes, parseValidScopes } from "@/lib/mcp-oauth-scope";

describe("MCP OAuth scopes", () => {
  it("parses csv, trims, drops empties, dedupes", () => {
    expect(parseScopes(" read:users, ,read:users,read:courses ")).toEqual(["read:users", "read:courses"]);
  });
  it("accepts known scopes", () => {
    expect(isValidScope("read:users")).toBe(true);
    expect(isValidScope("read:settings")).toBe(true);
    expect(parseValidScopes("read:users,read:courses")).toEqual(["read:users", "read:courses"]);
  });
  it("rejects unknown scopes", () => {
    expect(isValidScope("read:wallets")).toBe(false);
    expect(isValidScope("write:users")).toBe(false);
    expect(parseValidScopes("read:users,admin:*")).toBeNull();
  });
  it("accepts wildcard action scopes as literal strings", () => {
    expect(isValidScope("create:*")).toBe(true);
    expect(isValidScope("update:*")).toBe(true);
    expect(isValidScope("delete:*")).toBe(true);
  });
  it("rejects empty scope", () => {
    expect(parseValidScopes("")).toBeNull();
  });
});
