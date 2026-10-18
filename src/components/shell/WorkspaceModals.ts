import AppConfirmDialog from "../ui/AppConfirmDialog.vue";
import AppDialogShell from "../ui/AppDialogShell.vue";
import AppDestructiveWarning from "../ui/AppDestructiveWarning.vue";
import AppEmptyState from "../ui/AppEmptyState.vue";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useWorkspaceDialogPorts } from "./workspaceDialogPorts.ts";
import type { WorkspaceMember } from "../../types/app.ts";
import "./WorkspaceModals.css";

export const WorkspaceModals = {
  name: "WorkspaceModals",
  components: {
    AppConfirmDialog,
    AppDialogShell,
    AppDestructiveWarning,
    AppEmptyState,
    AppFormLayout
  },
  setup() {
    return useWorkspaceDialogPorts();
  },
  methods: {
    activeWorkspaceMembers(this: { workspaceMembers: WorkspaceMember[] }): WorkspaceMember[] {
      return this.workspaceMembers.filter(member => member.role === "member" && member.status === "active");
    },
    activeWorkspaceMemberOptions(this: { workspaceMembers: WorkspaceMember[] }): Array<{ title: string; value: string }> {
      return this.workspaceMembers
        .filter(member => member.role === "member" && member.status === "active")
        .map(member => ({
          title: member.displayName
            ? `${member.displayName} (${member.userId.slice(0, 8)}...${member.userId.slice(-4)})`
            : member.userId,
          value: member.userId
        }));
    }
  }
};
