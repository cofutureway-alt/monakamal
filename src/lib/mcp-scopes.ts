export type McpPermission = { read: boolean; create: boolean; update: boolean; delete: boolean };
export const MCP_SCOPE_GROUPS = ["users", "courses", "bundles", "lessons", "quizzes", "orders", "settings"] as const;
export function defaultMcpPermissions(): Record<string, McpPermission> {
  return Object.fromEntries(MCP_SCOPE_GROUPS.map((scope) => [scope, { read: true, create: false, update: false, delete: false }]));
}
export function scopeAllows(permissions: Record<string, McpPermission>, action: keyof McpPermission, resource: string) {
  return permissions[resource]?.[action] === true;
}
