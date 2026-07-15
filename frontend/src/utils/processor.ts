import * as XLSX from 'xlsx';
import JSZip from 'jszip';

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

export interface ProcessedSheets {
  [sheetName: string]: Record<string, any>[];
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

/**
 * Checks if a value is numeric or can be coerced to a number.
 */
function isNumericLike(val: any): boolean {
  if (typeof val === 'number') return !isNaN(val);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return false;
    // Basic numeric check (matches digits, decmials, optional sign)
    return !isNaN(Number(trimmed));
  }
  return false;
}

/**
 * Converts a list of object-based rows to a standard CSV string.
 */
export function objectsToCsv(data: Record<string, any>[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const obj of data) {
    const values = headers.map(header => {
      const val = obj[header];
      const strVal = val === null || val === undefined ? '' : String(val);
      if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

/**
 * Merges and processes actuarial sheets from uploaded files.
 */
export async function processActuarialFiles(
  files: File[],
  onProgress: (status: string, percentage: number) => void
): Promise<{ zipBlob: Blob; processedData: ProcessedSheets }> {
  const processedData: ProcessedSheets = {};
  const totalSheetsList = [
    ...GROUP1_SHEETS,
    ...GROUP2_SHEETS.slice(1), // skip first since it's in Group 1
    ...GROUP3_SHEETS.slice(1), 
    ...GROUP4_SHEETS.slice(1)
  ];
  
  let completedCount = 0;
  const updateProgress = (sheetName: string) => {
    completedCount++;
    const percent = Math.round((completedCount / totalSheetsList.length) * 100);
    onProgress(`Processed sheet: ${sheetName}`, percent);
  };

  // Group 1: Parse and consolidate
  for (const sheetName of GROUP1_SHEETS) {
    let mergedRows: Record<string, any>[] = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        if (!workbook.SheetNames.includes(sheetName)) {
          continue;
        }

        const sheet = workbook.Sheets[sheetName];
        // Read sheet as rows of arrays, including blank values
        const allRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        
        if (allRows.length <= 8) {
          continue; // Not enough rows to skip 8
        }

        const headerRow = allRows[8].map(h => String(h).trim()); // Header is at row index 8
        const dataRows = allRows.slice(9);

        // Convert rows to objects using header names
        for (const row of dataRows) {
          const obj: Record<string, any> = {};
          let hasData = false;

          for (let c = 0; c < headerRow.length; c++) {
            const colName = headerRow[c];
            if (colName !== undefined && colName !== null && colName !== '') {
              obj[colName] = row[c] !== undefined ? row[c] : '';
              if (row[c] !== undefined && row[c] !== '') {
                hasData = true;
              }
            }
          }

          if (hasData) {
            mergedRows.push(obj);
          }
        }
      } catch (err: any) {
        console.error(`Error reading ${sheetName} from ${file.name}:`, err);
      }
    }

    // Normalization logic: if a column is >90% numeric, coerce it
    if (mergedRows.length > 0) {
      const headers = Object.keys(mergedRows[0]);
      const firstHeader = headers[0];

      for (const col of headers) {
        if (col === firstHeader) continue; // Skip label column

        let numericCount = 0;
        for (const row of mergedRows) {
          if (isNumericLike(row[col])) {
            numericCount++;
          }
        }

        const ratio = numericCount / mergedRows.length;
        if (ratio > 0.9) {
          for (const row of mergedRows) {
            const val = row[col];
            if (isNumericLike(val)) {
              row[col] = Number(val);
            } else {
              row[col] = 0;
            }
          }
        }
      }
    }

    // Drop column if ACTUARIAL_AOM_IMPACT
    if (sheetName === "ACTUARIAL_AOM_IMPACT" && mergedRows.length > 0) {
      const dropCol = "* MACRO_STEP_ID_DESCRIPTION";
      for (const row of mergedRows) {
        delete row[dropCol];
      }
    }

    processedData[sheetName] = mergedRows;
    updateProgress(sheetName);
  }

  // Group 2: Clone from primary Group 2 sheet (which is in Group 1)
  const primaryG2 = GROUP2_SHEETS[0]; // CF_T1_PVFC_LIC_CLO_FADJ_PY
  for (const sheetName of GROUP2_SHEETS.slice(1)) {
    processedData[sheetName] = (processedData[primaryG2] || []).map(row => ({ ...row }));
    updateProgress(sheetName);
  }

  // Group 3: Clone from primary Group 3 sheet (which is in Group 1)
  const primaryG3 = GROUP3_SHEETS[0]; // CF_T1_PVFC_LIC_OP
  for (const sheetName of GROUP3_SHEETS.slice(1)) {
    processedData[sheetName] = (processedData[primaryG3] || []).map(row => ({ ...row }));
    updateProgress(sheetName);
  }

  // Group 4: Clone from primary Group 4 sheet (which is in Group 1)
  const primaryG4 = GROUP4_SHEETS[0]; // CF_T1_PVFC_LIC_TEXPVAR_PY
  for (const sheetName of GROUP4_SHEETS.slice(1)) {
    processedData[sheetName] = (processedData[primaryG4] || []).map(row => ({ ...row }));
    updateProgress(sheetName);
  }

  // Bundle in ZIP using JSZip
  const zip = new JSZip();
  for (const [name, rows] of Object.entries(processedData)) {
    const csvContent = objectsToCsv(rows);
    zip.file(`${name}.csv`, csvContent);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { zipBlob, processedData };
}
