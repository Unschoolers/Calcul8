import "./ConfigWindow.css";
import "./SinglesConfigWindow.css";
import SinglesCsvImportDialog from "./singles/SinglesCsvImportDialog.vue";
import SinglesPurchasingCard from "./singles/SinglesPurchasingCard.vue";
import SinglesSellingCard from "./singles/SinglesSellingCard.vue";
import AdminSyncImportCard from "./AdminSyncImportCard.vue";
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
