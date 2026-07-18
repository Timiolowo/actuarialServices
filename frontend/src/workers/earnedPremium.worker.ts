import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import ExcelJS from 'exceljs';

export interface EpWorkerMessage {
  type: 'start' | 'progress' | 'complete' | 'error';
  file?: File;
  valStartStr?: string;
  valEndStr?: string;
  templateBuffer?: ArrayBuffer;
  progressPercent?: number;
  status?: string;
  blob?: Blob;
  summary?: any[];
  detailRows?: any[];
  audit?: ProcessingAudit;
  message?: string;
}

interface ProcessingAudit {
  totalRows: number;
  calculatedRows: number;
  reviewRows: number;
  previewRows: number;
  previewLimit: number;
  reasons: Record<string, number>;
}

const msPerDay = 1000 * 60 * 60 * 24;
const previewLimit = 1000;

function parseDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + d * msPerDay);
  }
  const t = new Date(d);
  if (isNaN(t.getTime())) return null;
  return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
}

function getEndDate(policyClass: string, startdate: Date | null, enddate: Date | null): Date | null {
  if (policyClass === 'MARINE CARGO') {
    if (!enddate && startdate) {
      const targetMonth = startdate.getUTCMonth() + 6;
      const monthEnd = new Date(Date.UTC(startdate.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
      const sixMonthsLater = new Date(Date.UTC(
        startdate.getUTCFullYear(),
        targetMonth,
        Math.min(startdate.getUTCDate(), monthEnd)
      ));
      sixMonthsLater.setUTCDate(sixMonthsLater.getUTCDate() - 1);
      return sixMonthsLater;
    }
  }
  return enddate;
}

function getDateToUse(startdate: Date, enddate: Date, valstart: Date): Date | null {
  if (valstart > enddate) return null;
  return valstart > startdate ? valstart : startdate;
}

function calculateDuration(startdate: Date, enddate: Date, regDate: Date, valStart: Date, dateToUse: Date | null): number {
  let rtn = startdate;
  if (regDate.getUTCFullYear() === valStart.getUTCFullYear() && regDate.getUTCFullYear() > startdate.getUTCFullYear()) {
    if (dateToUse) rtn = dateToUse;
  }
  const diff = enddate.getTime() - rtn.getTime();
  return Math.floor(diff / msPerDay) + 1;
}

function gwpytd(reptdate: Date, valend: Date, premium: number): number {
  if (reptdate.getUTCFullYear() === valend.getUTCFullYear() && reptdate.getUTCMonth() <= valend.getUTCMonth()) {
    return premium;
  }
  return 0;
}

function exposedDays(dateToUse: Date | null, valEnd: Date, enddate: Date, gwpYtd: number): number {
  if (!dateToUse) {
    if (gwpYtd !== 0) return 1;
    return 0;
  }
  const pmin = valEnd < enddate ? valEnd : enddate;
  const daysDiff = Math.floor((pmin.getTime() - dateToUse.getTime()) / msPerDay) + 1;
  return daysDiff < 0 ? 0 : daysDiff;
}

function earnedFraction(exposeddays: number, duration: number, dateToUse: Date | null, gwpYtd: number): number {
  let outputa = (!dateToUse && gwpYtd !== 0) ? 1 : (exposeddays / duration);
  if (!isFinite(outputa) || isNaN(outputa)) return 0;
  return outputa;
}

function earnedPrem(premium: number, earnedFrac: number): number {
  return premium * earnedFrac;
}

function unePeriod(valend: Date, enddate: Date, datetouse: Date | null, duration: number): number {
  if (enddate > valend) {
    if (datetouse && datetouse > valend) {
      return duration;
    }
    return Math.floor((enddate.getTime() - valend.getTime()) / msPerDay);
  }
  return 0;
}

function unepremium(unperiod: number, duration: number, premium: number): number {
  if (duration === 0) return 0;
  const out = (unperiod / duration) * premium;
  return isNaN(out) || !isFinite(out) ? 0 : out;
}

function calcDac(unperiod: number, duration: number, comm: number): number {
  if (duration === 0) return 0;
  const out = (unperiod / duration) * comm;
  return isNaN(out) || !isFinite(out) ? 0 : out;
}

function fixVal(v: any): number {
  const n = Number(v);
  return (isNaN(n) || !isFinite(n)) ? 0 : n;
}

function normalizeHeader(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildColumnMap(row: Record<string, any>): Map<string, string> {
  return new Map(Object.keys(row).map(key => [normalizeHeader(key), key]));
}

function firstValue(row: Record<string, any>, columns: Map<string, string>, aliases: string[]): any {
  for (const alias of aliases) {
    const key = columns.get(alias);
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function finiteNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function postProgress(status: string, progressPercent: number) {
  self.postMessage({ type: 'progress', status, progressPercent });
}

async function processFile(file: File, valStartStr: string, valEndStr: string, templateBuffer: ArrayBuffer) {
  postProgress('Reading file...', 5);

  const valStart = parseDate(valStartStr)!;
  const valEnd = parseDate(valEndStr)!;
  if (!valStart || !valEnd || valStart > valEnd) {
    throw new Error('Valuation start date must be on or before the valuation end date.');
  }

  let rows: any[] = [];

  // Parse based on extension
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    postProgress('Parsing CSV...', 15);
    const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
    rows = parsed.data;
  } else if (file.name.toLowerCase().endsWith('.parquet')) {
    postProgress('Parsing Parquet...', 15);
    const buffer = await file.arrayBuffer();
    const metadata = await parquetMetadataAsync(buffer);
    const colNames = metadata.schema.slice(1).map((s: any) => s.name);

    await parquetRead({
      file: buffer,
      onComplete: (data) => {
        if (!data || data.length === 0) return;
        for (let row of data) {
          const rowObj: any = {};
          for (let i = 0; i < colNames.length; i++) {
            rowObj[colNames[i]] = row[i];
          }
          rows.push(rowObj);
        }
      }
    });
  } else {
    postProgress('Parsing Excel...', 15);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: true });
  }

  let columns: Map<string, string>;
  if (rows.length > 0) {
    columns = buildColumnMap(rows[0]);
    const requiredCols = ['REGISTRATN_DT', 'START_DATE', 'END_DATE', 'CLASS', 'PREMIUM', 'COMM'];
    const missingCols = requiredCols.filter(column => !columns.has(column));
    if (missingCols.length > 0) {
      throw new Error(`Missing required columns: ${missingCols.join(', ')}`);
    }
  } else {
    throw new Error('No rows found in the uploaded file.');
  }

  postProgress('Applying Actuarial Calculations...', 40);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);
  const calcSheet = wb.getWorksheet('Calculation');
  if (!calcSheet) throw new Error('The local template is missing the Calculation sheet.');
  calcSheet.getCell('E1').value = new Date(`${valStartStr}T00:00:00Z`);
  calcSheet.getCell('E1').numFmt = 'DD/MM/YYYY';
  calcSheet.getCell('H1').value = new Date(`${valEndStr}T00:00:00Z`);
  calcSheet.getCell('H1').numFmt = 'DD/MM/YYYY';

  const reviewSheet = wb.getWorksheet('Review') || wb.addWorksheet('Review');
  reviewSheet.addRow(['SOURCE ROW', 'POLICY KEY', 'CUSTOMER NAME', 'CLASS', 'REGISTRATION DATE', 'START DATE', 'END DATE', 'PREMIUM', 'REASON']);

  const summaryMap = new Map<string, {
    earnedPremium: number;
    unearnedPremium: number;
    dac: number;
    gwpYtd: number;
    exposure: number;
  }>();

  const detailRows: any[] = [];
  const audit: ProcessingAudit = {
    totalRows: rows.length,
    calculatedRows: 0,
    reviewRows: 0,
    previewRows: 0,
    previewLimit,
    reasons: {}
  };
  let calculationRow = 3;

  const sendToReview = (sourceRow: number, values: any[], reason: string) => {
    audit.reviewRows++;
    audit.reasons[reason] = (audit.reasons[reason] || 0) + 1;
    reviewSheet.addRow([sourceRow, ...values, reason]);
  };

  for (let i = 0; i < rows.length; i++) {
    if (i % 5000 === 0) {
      postProgress(`Processing row ${i} / ${rows.length}`, 40 + (i / rows.length) * 30);
    }
    const r = rows[i];
    rows[i] = null;

    const policyKey = firstValue(r, columns, ['POLICYKEY', 'POLICY_KEY']) ?? '';
    const custName = firstValue(r, columns, ['CUSTOMER_NAME', 'CUST_NAME']) ?? '';
    const policyClass = String(firstValue(r, columns, ['CLASS']) ?? '').trim().toUpperCase();
    const premiumValue = firstValue(r, columns, ['PREMIUM', 'GROSS_PREMIUM']);
    const commissionValue = firstValue(r, columns, ['COMM', 'COMMISSION']);
    const premium = finiteNumber(premiumValue);
    const comm = finiteNumber(commissionValue) ?? 0;

    const rawRegDate = firstValue(r, columns, ['REGISTRATN_DT', 'REG_DATE']);
    const rawStartDate = firstValue(r, columns, ['START_DATE']);
    const rawEndDate = firstValue(r, columns, ['END_DATE']);
    const regDate = parseDate(rawRegDate);
    const startDate = parseDate(rawStartDate);
    let endDate = parseDate(rawEndDate);
    const reviewValues = [policyKey, custName, policyClass, rawRegDate ?? '', rawStartDate ?? '', rawEndDate ?? '', premiumValue ?? ''];

    if (!regDate) {
      sendToReview(i + 2, reviewValues, 'Invalid registration date');
      continue;
    }
    if (regDate > valEnd) {
      sendToReview(i + 2, reviewValues, 'Registration date is after valuation date');
      continue;
    }
    if (!startDate) {
      sendToReview(i + 2, reviewValues, 'Invalid start date');
      continue;
    }
    if (!policyClass) {
      sendToReview(i + 2, reviewValues, 'Missing class');
      continue;
    }
    if (premium === null) {
      sendToReview(i + 2, reviewValues, 'Invalid premium');
      continue;
    }

    endDate = getEndDate(policyClass, startDate, endDate);
    if (!endDate) {
      sendToReview(i + 2, reviewValues, 'Missing or invalid end date');
      continue;
    }

    const dateToUse = getDateToUse(startDate, endDate, valStart);
    const duration = calculateDuration(startDate, endDate, regDate, valStart, dateToUse);
    if (duration <= 0) {
      sendToReview(i + 2, reviewValues, 'End date is before calculation start date');
      continue;
    }
    const gwp = gwpytd(regDate, valEnd, premium);
    const expDays = exposedDays(dateToUse, valEnd, endDate, gwp);
    const earnedFrac = earnedFraction(expDays, duration, dateToUse, gwp);
    const earnedPrm = earnedPrem(premium, earnedFrac);
    const unep = unePeriod(valEnd, endDate, dateToUse, duration);
    const unearnedPrm = unepremium(unep, duration, premium);
    const dacVal = calcDac(unep, duration, comm);

    // Sanitize calculated values
    const safeEarnedPrm = fixVal(earnedPrm);
    const safeUnearnedPrm = fixVal(unearnedPrm);
    const safeDac = fixVal(dacVal);
    const safeGwp = fixVal(gwp);

    // Accumulate summary
    if (!summaryMap.has(policyClass)) {
      summaryMap.set(policyClass, { earnedPremium: 0, unearnedPremium: 0, dac: 0, gwpYtd: 0, exposure: 0 });
    }
    const s = summaryMap.get(policyClass)!;
    s.earnedPremium += safeEarnedPrm;
    s.unearnedPremium += safeUnearnedPrm;
    s.dac += safeDac;
    s.gwpYtd += safeGwp;
    s.exposure += expDays;

    const detail = {
      policyKey,
      custName,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      premium,
      commission: comm,
      class: policyClass,
      regDate: regDate.toISOString().split('T')[0],
      duration,
      exposedDays: expDays,
      earnedFrac,
      earnedPremium: safeEarnedPrm,
      unePeriod: unep,
      unearnedPremium: safeUnearnedPrm,
      dac: safeDac,
      gwpYtd: safeGwp
    };

    const outputRow = calcSheet.getRow(calculationRow++);
    [
      detail.policyKey, detail.custName, detail.startDate, detail.endDate,
      detail.premium, detail.commission, detail.class, detail.regDate,
      detail.duration, detail.exposedDays, detail.earnedFrac, detail.earnedPremium,
      detail.unePeriod, detail.unearnedPremium, detail.dac, detail.gwpYtd
    ].forEach((value, column) => { outputRow.getCell(column + 1).value = value; });
    outputRow.commit();

    audit.calculatedRows++;
    if (detailRows.length < previewLimit) detailRows.push(detail);
  }

  postProgress('Generating Excel Output...', 75);
  audit.previewRows = detailRows.length;
  rows.length = 0;

  // --- Write "Summary" sheet ---
  const summarySheet = wb.getWorksheet('Summary');
  if (summarySheet) {
    let totEarned = 0, totUnearned = 0, totDac = 0, totGwp = 0;

    for (const [cls, s] of summaryMap.entries()) {
      for (let rowNum = 4; rowNum <= 11; rowNum++) {
        const row = summarySheet.getRow(rowNum);
        if (String(row.getCell(2).value ?? '').trim().toUpperCase() !== cls) continue;
        row.getCell(3).value = s.earnedPremium;
        row.getCell(4).value = s.unearnedPremium;
        row.getCell(5).value = s.dac;
        row.getCell(6).value = s.gwpYtd;
        break;
      }
      totEarned += s.earnedPremium;
      totUnearned += s.unearnedPremium;
      totDac += s.dac;
      totGwp += s.gwpYtd;
    }

    const totRow = summarySheet.getRow(12);
    totRow.getCell(2).value = 'TOTAL';
    totRow.getCell(3).value = totEarned;
    totRow.getCell(4).value = totUnearned;
    totRow.getCell(5).value = totDac;
    totRow.getCell(6).value = totGwp;
    totRow.commit();
  }

  postProgress('Finalizing Excel File...', 90);
  const summaryArray = Array.from(summaryMap.entries())
    .map(([cls, s]) => ({
      class: cls,
      earnedPremium: s.earnedPremium,
      unearnedPremium: s.unearnedPremium,
      dac: s.dac,
      gwpYtd: s.gwpYtd,
      exposure: s.exposure,
      total: s.earnedPremium + s.unearnedPremium + s.dac + s.gwpYtd
    }))
    .sort((a, b) => a.class.localeCompare(b.class));

  const summaryDataSheet = wb.getWorksheet('Summary Data') || wb.addWorksheet('Summary Data');
  summaryDataSheet.addRow(['CLASS', 'EARNED PREMIUM', 'UNEARNED PREMIUM', 'DAC', 'GWP YTD', 'EXPOSURE']);
  for (const summary of summaryArray) {
    summaryDataSheet.addRow([
      summary.class,
      summary.earnedPremium,
      summary.unearnedPremium,
      summary.dac,
      summary.gwpYtd,
      summary.exposure
    ]);
  }
  summaryDataSheet.addRow([
    'TOTAL',
    summaryArray.reduce((total, row) => total + row.earnedPremium, 0),
    summaryArray.reduce((total, row) => total + row.unearnedPremium, 0),
    summaryArray.reduce((total, row) => total + row.dac, 0),
    summaryArray.reduce((total, row) => total + row.gwpYtd, 0),
    summaryArray.reduce((total, row) => total + row.exposure, 0)
  ]);

  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  self.postMessage({ type: 'complete', blob, summary: summaryArray, detailRows, audit });
}

self.onmessage = (event: MessageEvent<EpWorkerMessage>) => {
  if (event.data.type === 'start') {
    const { file, valStartStr, valEndStr, templateBuffer } = event.data;
    if (file && valStartStr && valEndStr && templateBuffer) {
      processFile(file, valStartStr, valEndStr, templateBuffer).catch((err) => {
        self.postMessage({ type: 'error', message: err.message || 'Processing failed' });
      });
    }
  }
};
