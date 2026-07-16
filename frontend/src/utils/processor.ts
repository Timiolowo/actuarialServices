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

/** Sheets used for Individual Life portfolios (from tra_inputs/transform2.py). */
export const INDIVIDUAL_LIFE_SHEETS = [
  "MP_GOC", "MP_GOC_SEG", "ACTUARIAL_AOM_IMPACT", "INITIALIZATION", "CURVE_ID_PARAM",
  "OCI_OPTION_DERECOG", "MANDATORY_ACTUALS", "ACTUALS_FOR_VISUALIZATION", "COVERAGE_UNIT",
  "CF_T1_PVFC_LRC_OP", "CF_T1_PVFC_LRC_OP_TADJ", "CF_T1_PVFC_LRC_OP_FADJ",
  "CF_T1_PVFC_LRC_NB_POS", "CF_T1_PVFC_LRC_EXPCLOIF", "CF_T1_PVFC_LRC_EXPCLONB",
  "CF_T1_PVFC_LRC_DEREC", "CF_T1_PVFC_LRC_CLO_TADJ", "CF_T1_PVFC_LRC_CLO_FADJ",
  "CF_T1_PVFC_LRC_TEXPVAR", "CF_T1_PVFC_LRC_FEXPVAR", "CF_T1_PVFC_LRC_TASSCHG",
  "CF_T1_PVFC_LRC_FASSCHG", "CF_T1_PVFC_LRC_CLO", "CF_T1_PVFC_LIC_OP",
  "CF_T1_PVFC_LIC_OP_TADJ_PY", "CF_T1_PVFC_LIC_OP_FADJ_PY", "CF_T1_PVFC_LIC_EXPCLO_PY",
  "CF_T1_PVFC_LIC_DEREC", "CF_T1_PVFC_LIC_CLO_TADJ_PY", "CF_T1_PVFC_LIC_CLO_FADJ_PY",
  "CF_T1_PVFC_LIC_TEXPVAR_PY", "CF_T1_PVFC_LIC_FEXPVAR_PY", "CF_T1_PVFC_LIC_TASSCHG_PY",
  "CF_T1_PVFC_LIC_FASSCHG_PY", "CF_T1_PVFC_LIC_INCLAIM_LIC_INCR",
  "CF_T1_PVFC_LIC_INCEXP_LIC_INCR", "CF_T1_PVFC_LIC_CLO", "CF_T1_ACQ_CF_LRC_OP_TADJ",
  "CF_T1_ACQ_CF_LRC_OP_FADJ", "CF_T1_ACQ_CF_LRC_OP", "CF_T1_ACQ_CF_LRC_NB",
  "CF_T1_ACQ_CF_LRC_EXPCLOIF", "CF_T1_ACQ_CF_LRC_TEXPVAR", "CF_T1_ACQ_CF_LRC_EXPCLONB",
  "CF_T1_ACQ_CF_LRC_DEREC", "CF_T1_ACQ_CF_LRC_TASSCHG", "CF_T1_ACQ_CF_LRC_FASSCHG",
  "CF_T1_ACQ_CF_LRC_CLO"
];

/** No derived-sheet groups exist for Individual Life (transform2.py has them commented out). */
export const INDIVIDUAL_LIFE_DERIVED_GROUPS: string[][] = [];

export interface SheetConfig {
  primarySheets: string[];
  derivedGroups: string[][];
}

/**
 * Return the correct sheet configuration for a given portfolio.
 * 'individual-life' uses INDIVIDUAL_LIFE_SHEETS with no derived groups.
 * All other portfolios use the standard P&C / General sheets.
 */
export function getSheetConfig(portfolioId: string): SheetConfig {
  if (portfolioId === 'individual-life') {
    return {
      primarySheets: INDIVIDUAL_LIFE_SHEETS,
      derivedGroups: INDIVIDUAL_LIFE_DERIVED_GROUPS
    };
  }
  return {
    primarySheets: GROUP1_SHEETS,
    derivedGroups: [GROUP2_SHEETS, GROUP3_SHEETS, GROUP4_SHEETS]
  };
}

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
