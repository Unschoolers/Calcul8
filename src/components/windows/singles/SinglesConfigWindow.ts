import "../config/ConfigWindow.css";
import "./SinglesConfigWindow.css";
import SinglesCsvImportDialog from "./SinglesCsvImportDialog.vue";
import SinglesPurchasingCard from "./SinglesPurchasingCard.vue";
import SinglesSellingCard from "./SinglesSellingCard.vue";
import AdminSyncImportCard from "../config/AdminSyncImportCard.vue";
import { singlesConfigWindowDefinition } from "./SinglesConfigWindow.definition.ts";

export const SinglesConfigWindow: any = {
  ...singlesConfigWindowDefinition,
  components: {
    SinglesPurchasingCard,
    SinglesSellingCard,
    SinglesCsvImportDialog,
    AdminSyncImportCard
  }
};
