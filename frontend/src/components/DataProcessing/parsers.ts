import * as XLSX from 'xlsx';
import type {
  ParsedModelInput,
  ReserveLOBData,
  ReserveSplitData,
  UploadMatch,
  VerificationRow
} from './types';
import {
  RESERVE_LOB_SHEETS
} from './types';

export function formatNumber(value: number): string {
  if (value === 0) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function monthLabel(dateStr: string): string {
  const [year, month] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

export function derivePeriodLabel(dateStr: string): string {
  const month = parseInt(dateStr.split('-')[1], 10);
  const year = dateStr.split('-')[0];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[month - 1]}-${year}`;
}

export function deriveYearLabel(dateStr: string, compareYear: number): string {
  const year = parseInt(dateStr.split('-')[0], 10);
  if (year < compareYear) return 'Prior Year';
  return 'Current Year';
}

export function getYearMonth(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})/);
  if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2]}`;

  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const match = trimmed.match(/^([A-Za-z]{3})\s*[-/]?\s*(\d{4})$/);
  if (match) {
    const mon = months[match[1].toLowerCase()];
    if (mon) return `${match[2]}-${mon}`;
  }

  const match2 = trimmed.match(/^([A-Za-z]{3})\s*[-/]?\s*(\d{2})$/);
  if (match2) {
    const mon = months[match2[1].toLowerCase()];
    if (mon) return `20${match2[2]}-${mon}`;
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  return '';
}

export function normalizeIdentifier(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function extractLobName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  const [prefix] = withoutExtension.split(/_inputs_/i);
  return prefix.trim();
}

export function getRowLabel(row: Record<string, unknown>, headers: string[]) {
  const values = headers
    .slice(0, 2)
    .map(header => String(row[header] ?? '').trim())
    .filter(Boolean);
  return values.length > 0 ? values.join(' / ') : 'Unnamed row';
}

export function findSectionMatches(lobName: string, rows: Record<string, unknown>[], headers: string[]) {
  const normalizedLob = normalizeIdentifier(lobName);
  const exactMatches = rows.filter(row =>
    headers.some(header => normalizeIdentifier(String(row[header] ?? '')) === normalizedLob)
  );
  if (exactMatches.length > 0) return exactMatches;
  return rows.filter(row =>
    headers.some(header => {
      const normalizedCell = normalizeIdentifier(String(row[header] ?? ''));
      return normalizedCell !== '' && (
        normalizedCell.includes(normalizedLob) || normalizedLob.includes(normalizedCell)
      );
    })
  );
}

export function buildUploadMatches(
  files: File[],
  rows: Record<string, unknown>[],
  headers: string[],
  sectionLabel: 'Gross' | 'RI'
): UploadMatch[] {
  return files.map(file => {
    const lobName = extractLobName(file.name);
    const matches = findSectionMatches(lobName, rows, headers);
    return {
      id: `${file.name}:${file.lastModified}:${file.size}`,
      fileName: file.name,
      lobName,
      section: matches.length > 0 ? sectionLabel : 'Unmatched',
      matchCount: matches.length,
      matchedLabels: matches.map(row => getRowLabel(row, headers)).slice(0, 4)
    };
  });
}

export function parseModelInput(workbook: XLSX.WorkBook): ParsedModelInput | null {
  const sheetName = workbook.SheetNames.find(name => name.trim() === 'Modellinput');
  if (!sheetName) return null;

  const sheet = workbook.Sheets[sheetName];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  let headerRowIndex = -1;
  for (let i = 0; i < allRows.length; i += 1) {
    const value = allRows[i][2];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) return null;

  const headerRow = allRows[headerRowIndex];
  const grossHeaders: string[] = [];
  for (let column = 1; column <= 5; column += 1) {
    const raw = headerRow[column] !== undefined ? String(headerRow[column]).trim() : '';
    grossHeaders.push(raw || `Col_${String.fromCharCode(65 + column)}`);
  }

  const labelHeader = grossHeaders[0];
  const riHeaders = [labelHeader];
  for (let column = 10; column <= 13; column += 1) {
    riHeaders.push(headerRow[column] !== undefined ? String(headerRow[column]).trim() : `Col${column}`);
  }

  const grossData: Record<string, unknown>[] = [];
  const riData: Record<string, unknown>[] = [];

  for (const row of allRows.slice(headerRowIndex + 1)) {
    let hasGross = false;
    let hasRI = false;

    const grossRecord: Record<string, unknown> = {};
    for (let column = 1; column <= 5; column += 1) {
      const key = grossHeaders[column - 1];
      const value = row[column] !== undefined ? row[column] : '';
      grossRecord[key] = value;
      if (value !== '' && value !== null && value !== undefined) hasGross = true;
    }

    const riRecord: Record<string, unknown> = {};
    riRecord[labelHeader] = row[1] !== undefined ? row[1] : '';
    for (let column = 10; column <= 13; column += 1) {
      const key = riHeaders[column - 9];
      const value = row[column] !== undefined ? row[column] : '';
      riRecord[key] = value;
      if (value !== '' && value !== null && value !== undefined) hasRI = true;
    }

    if (hasGross) grossData.push(grossRecord);
    if (hasRI) riData.push(riRecord);
  }

  return { grossHeaders, riHeaders, grossData, riData };
}

export function parseReserveSplit(workbook: XLSX.WorkBook, valuationDateFull: string): ReserveSplitData {
  const valuationMonth = getYearMonth(valuationDateFull);
  const gross: ReserveLOBData[] = [];
  const ri: ReserveLOBData[] = [];
  const errors: string[] = [];
  const missingSheets: string[] = [];

  for (const lobName of RESERVE_LOB_SHEETS) {
    const actualSheetName = workbook.SheetNames.find(s => s.trim() === lobName.trim());
    const sheet = actualSheetName ? workbook.Sheets[actualSheetName] : undefined;
    if (!sheet) {
      missingSheets.push(lobName);
      continue;
    }

    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    if (data.length < 3) {
      errors.push(`[${lobName}] Sheet does not contain enough rows to extract reserve data.`);
      continue;
    }

    const row1 = data[0] || [];
    const row2 = data[1] || [];
    const grossCols = { attr: -1, large: -1, os: -1 };
    const riCols = { attr: [] as {idx: number, t: string}[], large: [] as {idx: number, t: string}[], os: [] as {idx: number, t: string}[] };

    for (let j = 0; j < row2.length; j++) {
      const val = String(row2[j]).trim().toUpperCase();
      if (!val) continue;

      let treatyStr = String(row2[j - 1] || '').trim().toUpperCase();
      if (!treatyStr) treatyStr = String(row1[j - 1] || '').trim().toUpperCase();
      if (!treatyStr || treatyStr.includes('ATTR') || treatyStr.includes('LARGE') || treatyStr.includes('GROSS')) treatyStr = 'Other';
      if (treatyStr.includes('FAC')) treatyStr = 'FAC';
      else if (treatyStr.includes('ST') || treatyStr.includes('TREATY')) treatyStr = 'ST';
      else if (treatyStr.includes('PF')) treatyStr = 'PF';
      else if (treatyStr.includes('XOL')) treatyStr = 'XOL';

      if (val.includes('ATTR')) {
        if (grossCols.attr === -1) grossCols.attr = j;
        else riCols.attr.push({ idx: j, t: treatyStr });
      } else if (val.includes('LARGE')) {
        if (grossCols.large === -1) grossCols.large = j;
        else riCols.large.push({ idx: j, t: treatyStr });
      } else if (val.includes('OS_AMOUNT')) {
        if (grossCols.os === -1) grossCols.os = j;
      } else if (val.includes('SHARE') || val.includes('XOL OS') || val.includes('RI OCR')) {
        let osTreatyStr = val;
        if (!osTreatyStr || osTreatyStr.includes('ATTR') || osTreatyStr.includes('LARGE') || osTreatyStr.includes('GROSS')) osTreatyStr = 'Other';
        if (osTreatyStr.includes('FAC')) osTreatyStr = 'FAC';
        else if (osTreatyStr.includes('ST') || osTreatyStr.includes('TREATY')) osTreatyStr = 'ST';
        else if (osTreatyStr.includes('PF')) osTreatyStr = 'PF';
        else if (osTreatyStr.includes('XOL')) osTreatyStr = 'XOL';
        riCols.os.push({ idx: j, t: osTreatyStr !== 'Other' ? osTreatyStr : treatyStr });
      }
    }

    if (grossCols.attr === -1) grossCols.attr = 2;
    if (grossCols.large === -1) grossCols.large = 3;
    if (grossCols.os === -1) grossCols.os = 6;

    const lobDataCurrent: ReserveLOBData = {
      lobName, attrIBNR: 0, largeIBNR: 0, outstandingClaims: 0, grossIBNRTotal: 0, grossOCRTotal: 0, lastDate: '', dateMatches: false, yearCategory: 'Current Year'
    };
    const lobDataPrior: ReserveLOBData = {
      lobName, attrIBNR: 0, largeIBNR: 0, outstandingClaims: 0, grossIBNRTotal: 0, grossOCRTotal: 0, lastDate: '', dateMatches: false, yearCategory: 'Prior Year'
    };

    const riLobDataCurrent: ReserveLOBData = {
      lobName, attrIBNR: 0, largeIBNR: 0, outstandingClaims: 0, grossIBNRTotal: 0, grossOCRTotal: 0, lastDate: '', dateMatches: false, yearCategory: 'Current Year', treaties: {}
    };
    const riLobDataPrior: ReserveLOBData = {
      lobName, attrIBNR: 0, largeIBNR: 0, outstandingClaims: 0, grossIBNRTotal: 0, grossOCRTotal: 0, lastDate: '', dateMatches: false, yearCategory: 'Prior Year', treaties: {}
    };

    let lastDateStr = '';
    let foundGross = false;
    let foundRi = false;

    for (let i = 2; i < data.length; i++) {
      let dateCell = String(data[i][1] || '').trim();
      if (!dateCell) dateCell = String(data[i][0] || '').trim();
      if (!dateCell) dateCell = String(data[i][8] || '').trim();
      if (!dateCell) dateCell = String(data[i][13] || '').trim();
      if (!dateCell) continue;

      const rowYearStr = getYearMonth(dateCell).split('-')[0];
      const rowYear = parseInt(rowYearStr, 10);
      if (isNaN(rowYear)) continue;

      const valYear = parseInt(valuationDateFull.split('-')[0], 10);
      const parseNumberCell = (val: unknown) => parseFloat(String(val || '0').replace(/[^0-9.-]/g, '')) || 0;

      const gAttr = parseNumberCell(data[i][grossCols.attr]);
      const gLarge = parseNumberCell(data[i][grossCols.large]);
      const gOs = parseNumberCell(data[i][grossCols.os]);

      if (gAttr !== 0 || gLarge !== 0 || gOs !== 0) {
        lastDateStr = dateCell;
        foundGross = true;
        if (rowYear === valYear) {
          lobDataCurrent.attrIBNR += gAttr;
          lobDataCurrent.largeIBNR += gLarge;
          lobDataCurrent.outstandingClaims += gOs;
        } else if (rowYear < valYear) {
          lobDataPrior.attrIBNR += gAttr;
          lobDataPrior.largeIBNR += gLarge;
          lobDataPrior.outstandingClaims += gOs;
        }
      }

      let riAttr = 0, riLarge = 0, riOs = 0;
      
      const updateTreaty = (lobData: ReserveLOBData, t: string, attr: number, large: number, os: number) => {
        if (!lobData.treaties) lobData.treaties = {};
        if (!lobData.treaties[t]) lobData.treaties[t] = { attrIBNR: 0, largeIBNR: 0, outstandingClaims: 0 };
        lobData.treaties[t].attrIBNR += attr;
        lobData.treaties[t].largeIBNR += large;
        lobData.treaties[t].outstandingClaims += os;
      };

      riCols.attr.forEach(({ idx, t }) => {
        const val = parseNumberCell(data[i][idx]);
        riAttr += val;
        if (val !== 0) updateTreaty(rowYear === valYear ? riLobDataCurrent : rowYear < valYear ? riLobDataPrior : riLobDataCurrent, t, val, 0, 0);
      });
      riCols.large.forEach(({ idx, t }) => {
        const val = parseNumberCell(data[i][idx]);
        riLarge += val;
        if (val !== 0) updateTreaty(rowYear === valYear ? riLobDataCurrent : rowYear < valYear ? riLobDataPrior : riLobDataCurrent, t, 0, val, 0);
      });
      riCols.os.forEach(({ idx, t }) => {
        const val = parseNumberCell(data[i][idx]);
        riOs += val;
        if (val !== 0) updateTreaty(rowYear === valYear ? riLobDataCurrent : rowYear < valYear ? riLobDataPrior : riLobDataCurrent, t, 0, 0, val);
      });

      if (riAttr !== 0 || riLarge !== 0 || riOs !== 0) {
        lastDateStr = dateCell;
        foundRi = true;
        if (rowYear === valYear) {
          riLobDataCurrent.attrIBNR += riAttr;
          riLobDataCurrent.largeIBNR += riLarge;
          riLobDataCurrent.outstandingClaims += riOs;
        } else if (rowYear < valYear) {
          riLobDataPrior.attrIBNR += riAttr;
          riLobDataPrior.largeIBNR += riLarge;
          riLobDataPrior.outstandingClaims += riOs;
        }
      }
    }

    if (foundGross) {
      lobDataCurrent.lastDate = lastDateStr;
      lobDataCurrent.dateMatches = (getYearMonth(lastDateStr) === valuationMonth);
      lobDataPrior.lastDate = lastDateStr;
      lobDataPrior.dateMatches = lobDataCurrent.dateMatches;
      if (!lobDataCurrent.dateMatches) {
        errors.push(`[${lobName}] Last date "${lastDateStr}" does not match valuation month ${valuationMonth}`);
      }
      gross.push(lobDataCurrent);
      gross.push(lobDataPrior);
    }

    if (foundRi) {
      riLobDataCurrent.lastDate = lastDateStr;
      riLobDataCurrent.dateMatches = (getYearMonth(lastDateStr) === valuationMonth);
      riLobDataPrior.lastDate = lastDateStr;
      riLobDataPrior.dateMatches = riLobDataCurrent.dateMatches;
      if (!riLobDataCurrent.dateMatches) {
        errors.push(`[${lobName} RI] Last date "${lastDateStr}" does not match valuation month ${valuationMonth}`);
      }
      ri.push(riLobDataCurrent);
      ri.push(riLobDataPrior);
    }
  }

  return { gross, ri, errors, missingSheets };
}

export function generateCsvTemplate(reserveData: ReserveSplitData | null, modelInput: ParsedModelInput | null): string {
  const lines: string[] = [];
  
  // Headers
  const headers = ['CLASS', 'Attr PY IBNR', 'Attr CY IBNR', 'Large PY IBNR', 'Large CY IBNR', 'Paid', 'ULAE', 'RiskAdj', 'DefaultRisk'];
  lines.push(headers.join(','));
  
  const classes = new Set<string>();
  if (reserveData) reserveData.gross.forEach(r => classes.add(r.lobName));
  if (modelInput) modelInput.grossData.forEach(r => classes.add(String(r[modelInput.grossHeaders[1]] || '').trim()));
  if (classes.size === 0) RESERVE_LOB_SHEETS.forEach(c => classes.add(c));

  for (const c of classes) {
    if (!c) continue;
    lines.push(`"${c}",,,,,,,,`);
  }
  
  return lines.join('\n');
}

export function parseCsvVerification(text: string): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  const lines = text.split(/\r?\n/);
  
  if (lines.length < 2) return result;
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const classIdx = headers.indexOf('CLASS');
  
  if (classIdx === -1) return result;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parser for this specific format
    const cells: string[] = [];
    let inQuotes = false;
    let currentCell = '';
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        cells.push(currentCell);
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell);

    const className = (cells[classIdx] || '').replace(/^"|"$/g, '').trim();
    if (!className) continue;
    
    const metrics = new Map<string, number>();
    
    for (let h = 0; h < headers.length; h++) {
      if (h === classIdx) continue;
      const valStr = cells[h];
      if (valStr !== undefined && valStr.trim() !== '') {
        const val = parseFloat(valStr.replace(/[^0-9.-]/g, ''));
        if (!isNaN(val)) metrics.set(headers[h], val);
      }
    }
    
    if (!result.has(className)) result.set(className, new Map());
    const existing = result.get(className)!;
    for (const [k, v] of metrics.entries()) existing.set(k, v);
  }
  
  return result;
}

export function buildVerificationRows(
  reserveData: ReserveSplitData | null,
  verificationData: Map<string, Map<string, number>> | null
): VerificationRow[] {
  if (!reserveData) return [];

  const rows: VerificationRow[] = [];
  const metrics = ['Attr PY IBNR', 'Attr CY IBNR', 'Large PY IBNR', 'Large CY IBNR'] as const;

  const map = new Map<string, { attrPY: number; attrCY: number; largePY: number; largeCY: number }>();
  for (const lob of reserveData.gross) {
    if (!map.has(lob.lobName)) {
      map.set(lob.lobName, { attrPY: 0, attrCY: 0, largePY: 0, largeCY: 0 });
    }
    const item = map.get(lob.lobName)!;
    if (lob.yearCategory === 'Prior Year') {
      item.attrPY += lob.attrIBNR;
      item.largePY += lob.largeIBNR;
    } else {
      item.attrCY += lob.attrIBNR;
      item.largeCY += lob.largeIBNR;
    }
  }

  for (const [lobName, data] of map.entries()) {
    const expected = verificationData?.get(lobName);
    const actuals = [data.attrPY, data.attrCY, data.largePY, data.largeCY];

    for (let i = 0; i < metrics.length; i++) {
      const exp = expected?.get(metrics[i]) ?? null;
      const act = actuals[i];
      rows.push({
        lobName,
        metric: metrics[i],
        expected: exp,
        actual: act,
        matches: exp === null ? null : Math.abs(exp - act) < 0.01,
      });
    }
  }

  return rows;
}
