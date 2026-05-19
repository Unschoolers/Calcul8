import "../config/ConfigWindow.css";
import "./SinglesConfigWindow.css";
import AppStickyActionFooter from "../../ui/AppStickyActionFooter.vue";
import SinglesCsvImportDialog from "./SinglesCsvImportDialog.vue";
import SinglesPurchasingCard from "./SinglesPurchasingCard.vue";
import SinglesSellingCard from "./SinglesSellingCard.vue";
import AdminSyncImportCard from "../config/AdminSyncImportCard.vue";
import { singlesConfigWindowDefinition } from "./SinglesConfigWindow.definition.ts";

export const SinglesConfigWindow: any = {
  ...singlesConfigWindowDefinition,
  components: {
    AppStickyActionFooter,
    SinglesPurchasingCard,
    SinglesSellingCard,
    SinglesCsvImportDialog,
    AdminSyncImportCard
  }
};
