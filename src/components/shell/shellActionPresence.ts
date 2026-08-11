import { inject, type InjectionKey } from "vue";

export interface ShellActionPresence {
  createActionId(): string;
  setVisible(actionId: string, visible: boolean): void;
}

type ShellActionPresenceState = {
  visibleShellContextActionIds: string[];
};

export const shellActionPresenceKey: InjectionKey<ShellActionPresence> = Symbol("shellActionPresence");

export function createShellActionPresence(state: ShellActionPresenceState): ShellActionPresence {
  let actionSequence = 0;

  return {
    createActionId(): string {
      actionSequence += 1;
      return `context-action-dock-${actionSequence}`;
    },
    setVisible(actionId: string, visible: boolean): void {
      const index = state.visibleShellContextActionIds.indexOf(actionId);
      if (visible && index === -1) {
        state.visibleShellContextActionIds.push(actionId);
      } else if (!visible && index !== -1) {
        state.visibleShellContextActionIds.splice(index, 1);
      }
    }
  };
}

export function useShellActionPresence(): ShellActionPresence {
  const presence = inject(shellActionPresenceKey, null);
  if (!presence) throw new Error("Shell action presence was not provided.");
  return presence;
}
