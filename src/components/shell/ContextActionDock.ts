import { defineComponent, type PropType } from "vue";
import { useShellActionPresence } from "./shellActionPresence.ts";
import "./ContextActionDock.css";

export type ContextActionDockAction = {
  id: string;
  icon: string;
  color: string;
  label: string;
  disabled?: boolean;
};

export const ContextActionDock = defineComponent({
  name: "ContextActionDock",
  props: {
    active: {
      type: Boolean,
      required: true
    },
    primaryAction: {
      type: Object as PropType<ContextActionDockAction>,
      required: true
    },
    secondaryActions: {
      type: Array as PropType<ContextActionDockAction[]>,
      default: () => []
    },
    badgeLabel: {
      type: String,
      default: ""
    },
    secondaryLabel: {
      type: String,
      required: true
    }
  },
  emits: {
    activate: (actionId: string) => typeof actionId === "string" && actionId.length > 0
  },
  data() {
    const shellActionPresence = useShellActionPresence();
    return {
      actionPresenceId: shellActionPresence.createActionId(),
      menuOpen: false,
      shellActionPresence
    };
  },
  mounted(): void {
    this.shellActionPresence.setVisible(this.actionPresenceId, this.active);
  },
  beforeUnmount(): void {
    this.shellActionPresence.setVisible(this.actionPresenceId, false);
  },
  watch: {
    active(active: boolean): void {
      this.shellActionPresence.setVisible(this.actionPresenceId, active);
    }
  },
  methods: {
    activate(actionId: string): void {
      this.menuOpen = false;
      this.$emit("activate", actionId);
    }
  }
});
