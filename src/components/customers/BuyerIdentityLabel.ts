import { defineComponent, type PropType } from "vue";
import { composeBuyerIdentity } from "../../app-core/buyer-profile.ts";
import type { BuyerProfile } from "../../types/app.ts";
import "./BuyerIdentityLabel.css";

export const BuyerIdentityLabel = defineComponent({
  name: "BuyerIdentityLabel",
  props: {
    username: {
      type: String,
      required: true
    },
    profile: {
      type: Object as PropType<BuyerProfile | null>,
      default: null
    },
    maxVisibleTags: {
      type: Number,
      default: 2
    }
  },
  computed: {
    identity() {
      return composeBuyerIdentity(this.username, this.profile);
    },
    visibleTags(): string[] {
      return this.identity.tags.slice(0, Math.max(0, this.maxVisibleTags));
    },
    hiddenTagCount(): number {
      return Math.max(0, this.identity.tags.length - this.visibleTags.length);
    },
    accessibleLabel(): string {
      const identityLabel = this.identity.accessibleLabel || this.username;
      return this.identity.tags.length > 0
        ? `${identityLabel}, ${this.identity.tags.join(", ")}`
        : identityLabel;
    }
  }
});
