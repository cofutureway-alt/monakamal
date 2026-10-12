// Canonical MCP OAuth scope allowlist (mirrored in supabase/functions/mcp-oauth/index.ts — keep in sync).
export const MCP_OAUTH_SCOPES = [
  "read:users",
  "read:courses",
  "read:bundles",
  "read:lessons",
  "read:quizzes",
  "read:orders",
  "read:settings",
  "create:*",
  "update:*",
  "delete:*",
] as const;

export function parseScopes(csv: string): string[] {
  return [...new Set(csv.split(",").map((s) => s.trim()).filter(Boolean))];
}

export function isValidScope(scope: string): boolean {
  return (MCP_OAUTH_SCOPES as readonly string[]).includes(scope);
}

export function parseValidScopes(csv: string): string[] | null {
  const scopes = parseScopes(csv);
  return scopes.length > 0 && scopes.every(isValidScope) ? scopes : null;
}
