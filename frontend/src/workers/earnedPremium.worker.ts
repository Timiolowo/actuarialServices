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
  message?: string;
}

const msPerDay = 1000 * 60 * 60 * 24;

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
  if (policyClass === "Marine Cargo") {
    if (!enddate && startdate) {
      const d = new Date(startdate);
      d.setUTCMonth(d.getUTCMonth() + 6);
      d.setUTCDate(d.getUTCDate() - 1);
      return d;
    }
  }
  return enddate;
}

function getDateToUse(startdate: Date, enddate: Date, valstart: Date): Date | null {
  if (valstart > enddate) return null;
  return valstart > startdate ? valstart : startdate;
}

function useDuration(startdate: Date, enddate: Date, regDate: Date, valStart: Date, dateToUse: Date | null): number {
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

function postProgress(status: string, progressPercent: number) {
  self.postMessage({ type: 'progress', status, progressPercent });
}

async function processFile(file: File, valStartStr: string, valEndStr: string, templateBuffer: ArrayBuffer) {
  postProgress('Reading file...', 5);

  const valStart = parseDate(valStartStr)!;
  const valEnd = parseDate(valEndStr)!;

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

  if (rows.length > 0) {
    const requiredCols = ['REGISTRATN_DT', 'START_DATE', 'END_DATE', 'CLASS', 'PREMIUM', 'COMM'];
    const extractedCols = Object.keys(rows[0]);
    const lowerExtractedCols = extractedCols.map(c => c.toLowerCase());
    const missingCols = requiredCols.filter(req => !lowerExtractedCols.includes(req.toLowerCase()));
    if (missingCols.length > 0) {
      throw new Error(`Missing required columns: ${missingCols.join(', ')}`);
    }
  } else {
    throw new Error('No rows found in the uploaded file.');
  }

  postProgress('Applying Actuarial Calculations...', 40);

  // Filter: year(REGISTRATN_DT) <= year(valend)
  const filtered = rows.filter(r => {
    const reg = parseDate(r.REGISTRATN_DT || r.registratn_dt);
    if (!reg) return false;
    return reg.getUTCFullYear() <= valEnd.getUTCFullYear();
  });

  const summaryMap = new Map<string, {
    earnedPremium: number;
    unearnedPremium: number;
    dac: number;
    gwpYtd: number;
    exposure: number;
  }>();

  const detailRows: any[] = [];

  for (let i = 0; i < filtered.length; i++) {
    if (i % 5000 === 0) {
      postProgress(`Processing row ${i} / ${filtered.length}`, 40 + (i / filtered.length) * 30);
    }
    const r = filtered[i];

    // Normalize keys
    const policyKey = r.POLICYKEY || r.policykey || r.POLICY_KEY || '';
    const custName = r.CUSTOMER_NAME || r.customer_name || r.CUST_NAME || r['CUST NAME'] || '';
    const policyClass = (r.CLASS || r.class || '').toString().toUpperCase();
    const premium = fixVal(r.PREMIUM || r.premium || r['GROSS PREMIUM']);
    const comm = fixVal(r.COMM || r.comm || r.COMMISSION);

    const regDate = parseDate(r.REGISTRATN_DT || r.registratn_dt || r['REG DATE']);
    const startDate = parseDate(r.START_DATE || r.start_date);
    let endDate = parseDate(r.END_DATE || r.end_date);

    if (!regDate || !startDate) continue;

    endDate = getEndDate(policyClass, startDate, endDate);
    if (!endDate) continue;

    const dateToUse = getDateToUse(startDate, endDate, valStart);
    const duration = useDuration(startDate, endDate, regDate, valStart, dateToUse);
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

    // Collect detail row
    detailRows.push({
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
    });
  }

  postProgress('Generating Excel Output...', 75);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);

  // --- Write "Calculation" sheet ---
  const calcSheet = wb.getWorksheet('Calculation');
  if (calcSheet) {
    // Cell E1 = Start Period, Cell G1 = Val Date
    calcSheet.getCell('E1').value = new Date(valStartStr);
    calcSheet.getCell('E1').numFmt = 'DD/MM/YYYY';
    calcSheet.getCell('H1').value = new Date(valEndStr);
    calcSheet.getCell('H1').numFmt = 'DD/MM/YYYY';

    // Data starts at row 3. Columns: A..P = policyKey, custName, startDate, endDate, premium, commission,
    // class, regDate, duration, exposedDays, earnedFrac, earnedPremium, unePeriod, unearnedPremium, dac, gwpYtd
    let rowNum = 3;
    for (const d of detailRows) {
      const row = calcSheet.getRow(rowNum);
      row.getCell(1).value = d.policyKey;
      row.getCell(2).value = d.custName;
      row.getCell(3).value = d.startDate;
      row.getCell(4).value = d.endDate;
      row.getCell(5).value = d.premium;
      row.getCell(6).value = d.commission;
      row.getCell(7).value = d.class;
      row.getCell(8).value = d.regDate;
      row.getCell(9).value = d.duration;
      row.getCell(10).value = d.exposedDays;
      row.getCell(11).value = d.earnedFrac;
      row.getCell(12).value = d.earnedPremium;
      row.getCell(13).value = d.unePeriod;
      row.getCell(14).value = d.unearnedPremium;
      row.getCell(15).value = d.dac;
      row.getCell(16).value = d.gwpYtd;
      row.commit();
      rowNum++;
    }
  }

  // --- Write "Summary" sheet ---
  const summarySheet = wb.getWorksheet('Summary');
  if (summarySheet) {
    let rowNum = 1;
    let totEarned = 0, totUnearned = 0, totDac = 0, totGwp = 0, totExp = 0;

    for (const [cls, s] of summaryMap.entries()) {
      const row = summarySheet.getRow(rowNum);
      row.getCell(1).value = cls;
      row.getCell(2).value = s.earnedPremium;
      row.getCell(3).value = s.unearnedPremium;
      row.getCell(4).value = s.dac;
      row.getCell(5).value = s.gwpYtd;
      row.getCell(6).value = s.exposure;
      row.commit();
      totEarned += s.earnedPremium;
      totUnearned += s.unearnedPremium;
      totDac += s.dac;
      totGwp += s.gwpYtd;
      totExp += s.exposure;
      rowNum++;
    }

    // Total row
    const totRow = summarySheet.getRow(rowNum);
    totRow.getCell(1).value = 'TOTAL';
    totRow.getCell(2).value = totEarned;
    totRow.getCell(3).value = totUnearned;
    totRow.getCell(4).value = totDac;
    totRow.getCell(5).value = totGwp;
    totRow.getCell(6).value = totExp;
    totRow.commit();
  }

  postProgress('Finalizing Excel File...', 90);
  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

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

  self.postMessage({ type: 'complete', blob, summary: summaryArray, detailRows });
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
