import type { UserRole } from "@/lib/generated/prisma/enums";

type Action = "create" | "read" | "update" | "delete" | "export" | "admin";

type Resource =
  | "contacts"
  | "companies"
  | "products"
  | "tags"
  | "pipelines"
  | "opportunities"
  | "billing"
  | "conversations"
  | "tasks"
  | "team"
  | "automations"
  | "reports"
  | "settings"
  | "integrations"
  | "ai_logs";

type Permission = `${Action}:${Resource}`;

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: ["create:contacts","read:contacts","update:contacts","delete:contacts","export:contacts","admin:contacts","create:companies","read:companies","update:companies","delete:companies","export:companies","admin:companies","create:products","read:products","update:products","delete:products","create:tags","read:tags","update:tags","delete:tags","create:pipelines","read:pipelines","update:pipelines","delete:pipelines","admin:pipelines","create:opportunities","read:opportunities","update:opportunities","delete:opportunities","create:billing","read:billing","update:billing","delete:billing","create:conversations","read:conversations","update:conversations","delete:conversations","create:tasks","read:tasks","update:tasks","delete:tasks","create:team","read:team","update:team","delete:team","admin:team","create:automations","read:automations","update:automations","delete:automations","read:reports","export:reports","create:settings","read:settings","update:settings","delete:settings","admin:settings","create:integrations","read:integrations","update:integrations","delete:integrations","read:ai_logs"],

  owner: ["create:contacts","read:contacts","update:contacts","delete:contacts","export:contacts","create:companies","read:companies","update:companies","delete:companies","export:companies","create:products","read:products","update:products","delete:products","create:tags","read:tags","update:tags","delete:tags","create:pipelines","read:pipelines","update:pipelines","delete:pipelines","admin:pipelines","create:opportunities","read:opportunities","update:opportunities","delete:opportunities","create:billing","read:billing","update:billing","delete:billing","create:conversations","read:conversations","update:conversations","delete:conversations","create:tasks","read:tasks","update:tasks","delete:tasks","create:team","read:team","update:team","delete:team","create:automations","read:automations","update:automations","delete:automations","read:reports","export:reports","read:settings","update:settings","admin:settings","create:integrations","read:integrations","update:integrations","delete:integrations","read:ai_logs"],

  manager: ["create:contacts","read:contacts","update:contacts","delete:contacts","export:contacts","create:companies","read:companies","update:companies","delete:companies","create:products","read:products","update:products","create:tags","read:tags","update:tags","delete:tags","create:pipelines","read:pipelines","update:pipelines","create:opportunities","read:opportunities","update:opportunities","delete:opportunities","read:billing","create:conversations","read:conversations","update:conversations","delete:conversations","create:tasks","read:tasks","update:tasks","delete:tasks","read:team","create:automations","read:automations","update:automations","delete:automations","read:reports","read:settings","update:settings","read:integrations","read:ai_logs"],

  salesperson: ["create:contacts","read:contacts","update:contacts","export:contacts","create:companies","read:companies","update:companies","read:products","create:tags","read:tags","create:opportunities","read:opportunities","update:opportunities","create:conversations","read:conversations","update:conversations","create:tasks","read:tasks","update:tasks","read:reports"],

  attendant: ["read:contacts","update:contacts","read:companies","read:products","read:tags","create:tags","create:conversations","read:conversations","update:conversations","create:tasks","read:tasks","update:tasks"],

  financial: ["read:contacts","read:companies","read:opportunities","create:billing","read:billing","update:billing","delete:billing","export:billing","read:reports","export:reports"],

  viewer: ["read:contacts","read:companies","read:products","read:tags","read:opportunities","read:billing","read:conversations","read:tasks"],
};

export function can(
  role: UserRole,
  action: Action,
  resource: Resource
): boolean {
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes(`${action}:${resource}`);
}

export function canAny(
  role: UserRole,
  checks: { action: Action; resource: Resource }[]
): boolean {
  return checks.some(({ action, resource }) => can(role, action, resource));
}
