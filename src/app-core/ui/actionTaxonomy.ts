export type AppActionId =
  | "add"
  | "close"
  | "copy"
  | "delete"
  | "edit"
  | "export"
  | "help"
  | "import"
  | "live"
  | "open"
  | "reset"
  | "save"
  | "settings"
  | "share"
  | "sync"
  | "verify";

export type AppActionTone =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "neutral";

export type AppActionVariant = "flat" | "tonal" | "text" | "elevated" | "outlined" | "plain";

export type AppActionDefinition = {
  icon: string;
  tone: AppActionTone;
  variant: AppActionVariant;
  color?: string;
  destructive?: boolean;
};

export const APP_ACTION_DEFINITIONS: Record<AppActionId, AppActionDefinition> = {
  add: { icon: "mdi-plus", tone: "primary", variant: "tonal", color: "primary" },
  close: { icon: "mdi-close", tone: "neutral", variant: "text" },
  copy: { icon: "mdi-content-copy", tone: "secondary", variant: "text" },
  delete: { icon: "mdi-delete-outline", tone: "destructive", variant: "text", color: "error", destructive: true },
  edit: { icon: "mdi-pencil-outline", tone: "secondary", variant: "text" },
  export: { icon: "mdi-download", tone: "secondary", variant: "tonal", color: "secondary" },
  help: { icon: "mdi-help-circle-outline", tone: "neutral", variant: "text" },
  import: { icon: "mdi-upload", tone: "secondary", variant: "tonal", color: "secondary" },
  live: { icon: "mdi-broadcast", tone: "success", variant: "elevated", color: "success" },
  open: { icon: "mdi-open-in-new", tone: "secondary", variant: "text" },
  reset: { icon: "mdi-restore", tone: "warning", variant: "tonal", color: "warning" },
  save: { icon: "mdi-content-save-outline", tone: "primary", variant: "flat", color: "primary" },
  settings: { icon: "mdi-cog-outline", tone: "neutral", variant: "text" },
  share: { icon: "mdi-share-variant", tone: "secondary", variant: "tonal", color: "secondary" },
  sync: { icon: "mdi-sync", tone: "secondary", variant: "text" },
  verify: { icon: "mdi-shield-check-outline", tone: "success", variant: "tonal", color: "success" }
};

export function resolveActionDefinition(action: AppActionId): AppActionDefinition {
  return APP_ACTION_DEFINITIONS[action];
}
