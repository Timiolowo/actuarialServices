export const GROUP1_SHEETS = [
  "ACTUALS_FOR_VISUALIZATION", "ACTUARIAL_AOM_IMPACT", "CF_T1_PVFC_LIC_CLO",
  "CF_T1_PVFC_LIC_INCEXP_LIC_INCR", "CF_T1_PVFC_LIC_INCLAIM_LIC_INCR", "CURVE_ID_PARAM",
  "INITIALIZATION", "MANDATORY_ACTUALS", "MP_GOC", "MP_GOC_SEG", "OCI_OPTION_DERECOG",
  "CF_T1_PVFC_LIC_CLO_FADJ_PY", "CF_T1_PVFC_LIC_OP", "CF_T1_PVFC_LIC_TEXPVAR_PY"
];

export const GROUP2_SHEETS = [
  "CF_T1_PVFC_LIC_CLO_FADJ_PY", "CF_T1_PVFC_LIC_CLO_TADJ_PY", "CF_T1_PVFC_LIC_DEREC",
  "CF_T1_PVFC_LIC_EXPCLO_PY"
];

export const GROUP3_SHEETS = [
  "CF_T1_PVFC_LIC_OP", "CF_T1_PVFC_LIC_OP_FADJ_PY", "CF_T1_PVFC_LIC_OP_TADJ_PY"
];

export const GROUP4_SHEETS = [
  "CF_T1_PVFC_LIC_TEXPVAR_PY", "CF_T1_PVFC_LIC_TASSCHG_PY", "CF_T1_PVFC_LIC_FASSCHG_PY",
  "CF_T1_PVFC_LIC_FEXPVAR_PY"
];

export interface SheetProcessingSummary {
  rowCount: number;
  columnCount: number;
  emptyCells: number;
  totalCells: number;
  sourceFileCount: number;
}

export interface ProcessingSummary {
  uploadedFileCount: number;
  processedFileCount: number;
  skippedFiles: { name: string; reason: string }[];
  sheetCount: number;
  populatedSheetCount: number;
  totalRows: number;
  sheets: Record<string, SheetProcessingSummary>;
}
