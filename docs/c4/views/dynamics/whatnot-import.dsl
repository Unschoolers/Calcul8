dynamic calcul8 "WhatnotImportFlow" {
    title "Whatnot import and review"
    seller -> calcul8.web "Starts CSV or connected Whatnot import."
    calcul8.web -> calcul8.api "Requests connection state or import preparation."
    calcul8.api -> whatnot "Uses OAuth connection when connected."
    calcul8.api -> calcul8.cosmos "Reads connection metadata and writes import state."
    calcul8.api -> calcul8.web "Returns mapped rows and review decisions."
    seller -> calcul8.web "Confirms create, update, or skip decisions."
    calcul8.web -> calcul8.api "Submits reviewed import batch."
    calcul8.api -> calcul8.cosmos "Claims the batch, writes sales and mappings, and checkpoints each operation."
    calcul8.cosmos -> calcul8.api "Returns completed checkpoints or recoverable workflow state for deterministic retry."
    autoLayout lr
}
