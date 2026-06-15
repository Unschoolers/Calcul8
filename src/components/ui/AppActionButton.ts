import { defineComponent, type PropType } from "vue";
import {
  resolveActionDefinition,
  type AppActionId,
  type AppActionVariant
} from "../../app-core/ui/actionTaxonomy.ts";

type ClassObject = Record<string, boolean>;
type ClassValue = string | string[] | ClassObject | Array<string | ClassObject>;

export const AppActionButton = defineComponent({
  name: "AppActionButton",
  inheritAttrs: false,
  props: {
    action: {
      type: String as PropType<AppActionId>,
      required: true
    },
    label: {
      type: String,
      default: ""
    },
    ariaLabel: {
      type: String,
      default: ""
    },
    title: {
      type: String,
      default: ""
    },
    iconOnly: {
      type: Boolean,
      default: false
    },
    icon: {
      type: String,
      default: ""
    },
    color: {
      type: String,
      default: ""
    },
    variant: {
      type: String as PropType<AppActionVariant | "">,
      default: ""
    },
    size: {
      type: [String, Number],
      default: undefined
    },
    density: {
      type: String,
      default: undefined
    },
    disabled: {
      type: Boolean,
      default: false
    },
    loading: {
      type: Boolean,
      default: false
    },
    block: {
      type: Boolean,
      default: false
    },
    buttonClass: {
      type: [String, Array, Object] as PropType<ClassValue>,
      default: ""
    }
  },
  emits: ["click"],
  computed: {
    definition() {
      return resolveActionDefinition(this.action);
    },
    resolvedIcon(): string {
      return this.icon || this.definition.icon;
    },
    resolvedColor(): string | undefined {
      return this.color || this.definition.color || undefined;
    },
    resolvedVariant(): AppActionVariant {
      return this.variant || this.definition.variant;
    },
    resolvedTitle(): string | undefined {
      return this.title || this.ariaLabel || this.label || undefined;
    },
    resolvedAriaLabel(): string | undefined {
      return this.ariaLabel || this.title || this.label || undefined;
    },
    resolvedClasses(): unknown[] {
      return [
        "app-action-button",
        `app-action-button--${this.action}`,
        `app-action-button--${this.definition.tone}`,
        {
          "app-action-button--icon-only": this.iconOnly,
          "app-action-button--destructive": this.definition.destructive === true
        },
        this.buttonClass
      ];
    },
    resolvedIconProp(): string | undefined {
      return this.iconOnly ? this.resolvedIcon : undefined;
    },
    resolvedPrependIcon(): string | undefined {
      return this.iconOnly ? undefined : this.resolvedIcon;
    }
  }
});
