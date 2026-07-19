/// <reference lib="webworker" />

import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { parquetMetadataAsync, parquetRead, parquetSchema } from 'hyparquet';
import type { AsyncBuffer } from 'hyparquet';
import ExcelJS from 'exceljs';

export interface EpWorkerMessage {
  type: 'start' | 'progress' | 'complete' | 'error';
  files?: File[];
  file?: File;
  valStartStr?: string;
  valEndStr?: string;
  templateBuffer?: ArrayBuffer;
  progressPercent?: number;
  status?: string;
  summaryWorkbook?: Blob;
  calculationFile?: File;
  workspaceName?: string;
  summary?: SummaryRow[];
  detailRows?: DetailRow[];
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

interface SummaryTotals {
  earnedPremium: number;
  unearnedPremium: number;
  dac: number;
  gwpYtd: number;
  exposure: number;
}

interface SummaryRow extends SummaryTotals {
  class: string;
  total: number;
}

interface DetailRow {
  policyKey: unknown;
  custName: unknown;
  startDate: string;
  endDate: string;
  premium: number;
  commission: number;
  class: string;
  regDate: string;
  duration: number;
  exposedDays: number;
  earnedFrac: number;
  earnedPremium: number;
  unePeriod: number;
  unearnedPremium: number;
  dac: number;
  gwpYtd: number;
}

interface ProcessingContext {
  valStart: Date;
  valEnd: Date;
  columns: Map<string, string> | null;
  calculationWriter: BufferedCsvWriter;
  summaryMap: Map<string, SummaryTotals>;
  detailRows: DetailRow[];
  audit: ProcessingAudit;
  fileIndex: number;
  totalFiles: number;
}

const msPerDay = 1000 * 60 * 60 * 24;
const previewLimit = 1000;
const csvChunkSize = 1024 * 1024;
const parquetBatchSize = 10_000;
const textEncoder = new TextEncoder();

const calculationHeaders = [
  'POLICY KEY', 'CUST NAME', 'START DATE', 'END DATE', 'GROSS PREMIUM', 'COMMISSION',
  'CLASS', 'REG DATE', 'DURATION', 'EARNED PERIOD', 'EARNED FRAC', 'EARNED PREM',
  'UPR_PERIOD', 'UPR', 'DAC', 'GWP YTD'
];

const requiredColumnGroups = [
  { label: 'REGISTRATN_DT', aliases: ['REGISTRATN_DT', 'REG_DATE'] },
  { label: 'START_DATE', aliases: ['START_DATE'] },
  { label: 'END_DATE', aliases: ['END_DATE'] },
  { label: 'CLASS', aliases: ['CLASS'] },
  { label: 'PREMIUM', aliases: ['PREMIUM', 'GROSS_PREMIUM'] },
  { label: 'COMM', aliases: ['COMM', 'COMMISSION'] }
];

class BufferedCsvWriter {
  private chunks: string[] = [];
  private bufferedLength = 0;
  private readonly writable: FileSystemWritableFileStream;

  constructor(writable: FileSystemWritableFileStream) {
    this.writable = writable;
  }

  async writeRow(values: unknown[]) {
    const line = `${values.map(csvCell).join(',')}\n`;
    this.chunks.push(line);
    this.bufferedLength += line.length;
    if (this.bufferedLength >= csvChunkSize) await this.flush();
  }

  async flush() {
    if (this.chunks.length === 0) return;
    await this.writable.write(textEncoder.encode(this.chunks.join('')));
    this.chunks.length = 0;
    this.bufferedLength = 0;
  }

  async close() {
    await this.flush();
    await this.writable.close();
  }
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * msPerDay);
  }
  const isoMatch = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function getEndDate(policyClass: string, startDate: Date, endDate: Date | null): Date | null {
  if (policyClass === 'MARINE CARGO' && !endDate) {
    const targetMonth = startDate.getUTCMonth() + 6;
    const monthEnd = new Date(Date.UTC(startDate.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
    const sixMonthsLater = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      targetMonth,
      Math.min(startDate.getUTCDate(), monthEnd)
    ));
    return sixMonthsLater;
  }
  return endDate;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const parsed = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

function isoDate(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildColumnMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of headers) {
    const normalized = String(header).trim().toUpperCase().replace(/\s+/g, '_');
    map.set(normalized, header);
  }
  return map;
}

function validateColumns(columns: Map<string, string>) {
  for (const group of requiredColumnGroups) {
    const found = group.aliases.some(alias => columns.has(alias));
    if (!found) {
      throw new Error(`Missing required column. Expected one of: ${group.aliases.join(', ')}`);
    }
  }
}

function postProgress(status: string, progressPercent: number) {
  self.postMessage({ type: 'progress', status, progressPercent });
}

async function processRow(row: Record<string, unknown>, context: ProcessingContext) {
  context.audit.totalRows += 1;
  const cols = context.columns!;

  const getCol = (aliases: string[]) => {
    for (const alias of aliases) {
      const header = cols.get(alias);
      if (header && row[header] !== undefined && row[header] !== null) return row[header];
    }
    return null;
  };

  const regDateRaw = getCol(requiredColumnGroups[0].aliases);
  const startDateRaw = getCol(requiredColumnGroups[1].aliases);
  const endDateRaw = getCol(requiredColumnGroups[2].aliases);
  const classRaw = getCol(requiredColumnGroups[3].aliases);
  const premiumRaw = getCol(requiredColumnGroups[4].aliases);
  const commRaw = getCol(requiredColumnGroups[5].aliases);

  const policyKey = getCol(['POLICYKEY', 'POLICY_KEY']) || '';
  const custName = getCol(['CUSTOMER_NAME', 'CUST_NAME']) || '';

  const regDate = parseDate(regDateRaw);
  const startDate = parseDate(startDateRaw);
  let endDate = parseDate(endDateRaw);
  const policyClass = String(classRaw || 'Unknown').trim();
  const premium = normalizeNumber(premiumRaw);
  const commission = normalizeNumber(commRaw);

  endDate = getEndDate(policyClass, startDate!, endDate);

  if (!regDate || !startDate || !endDate) {
    context.audit.reviewRows += 1;
    context.audit.reasons['Missing or invalid dates'] = (context.audit.reasons['Missing or invalid dates'] || 0) + 1;
    return;
  }

  if (endDate < startDate) {
    context.audit.reviewRows += 1;
    context.audit.reasons['End date before start date'] = (context.audit.reasons['End date before start date'] || 0) + 1;
    return;
  }

  if (premium === 0) {
    context.audit.reviewRows += 1;
    context.audit.reasons['Zero premium'] = (context.audit.reasons['Zero premium'] || 0) + 1;
    return;
  }

  const duration = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);
  if (duration <= 0) {
    context.audit.reviewRows += 1;
    context.audit.reasons['Zero or negative duration'] = (context.audit.reasons['Zero or negative duration'] || 0) + 1;
    return;
  }

  const vEndOffset = context.valEnd.getTime() + msPerDay;

  let exposure = 0;
  if (vEndOffset > startDate.getTime()) {
    const activeEnd = Math.min(endDate.getTime(), vEndOffset);
    exposure = Math.round((activeEnd - startDate.getTime()) / msPerDay);
  }

  const earnedFrac = Math.min(1, Math.max(0, exposure / duration));
  const earnedPremium = premium * earnedFrac;
  
  const uprPeriod = Math.max(0, duration - exposure);
  const unearnedPremium = premium - earnedPremium;

  let dac = 0;
  if (regDate.getTime() >= context.valStart.getTime() && regDate.getTime() < vEndOffset) {
    dac = commission * (unearnedPremium / premium);
  }

  let gwp = 0;
  if (regDate.getTime() >= context.valStart.getTime() && regDate.getTime() < vEndOffset) {
    gwp = premium;
  }

  if (!context.summaryMap.has(policyClass)) {
    context.summaryMap.set(policyClass, { earnedPremium: 0, unearnedPremium: 0, dac: 0, gwpYtd: 0, exposure: 0 });
  }
  const summary = context.summaryMap.get(policyClass)!;
  summary.earnedPremium += earnedPremium;
  summary.unearnedPremium += unearnedPremium;
  summary.dac += dac;
  summary.gwpYtd += gwp;
  summary.exposure += earnedFrac;

  const detail: DetailRow = {
    policyKey,
    custName,
    startDate: isoDate(startDate),
    endDate: isoDate(endDate),
    premium,
    commission,
    class: policyClass,
    regDate: isoDate(regDate),
    duration,
    exposedDays: exposure,
    earnedFrac,
    earnedPremium,
    unePeriod: uprPeriod,
    unearnedPremium,
    dac,
    gwpYtd: gwp
  };

  await context.calculationWriter.writeRow([
    detail.policyKey, detail.custName, detail.startDate, detail.endDate,
    detail.premium, detail.commission, detail.class, detail.regDate,
    detail.duration, detail.exposedDays, detail.earnedFrac, detail.earnedPremium,
    detail.unePeriod, detail.unearnedPremium, detail.dac, detail.gwpYtd
  ]);

  context.audit.calculatedRows += 1;
  if (context.detailRows.length < previewLimit) context.detailRows.push(detail);
}

function setAndValidateHeaders(headers: string[], context: ProcessingContext) {
  if (context.columns) return;
  context.columns = buildColumnMap(headers);
  validateColumns(context.columns);
}

async function processCsv(file: File, context: ProcessingContext) {
  await new Promise<void>((resolve, reject) => {
    let pending = Promise.resolve();
    let settled = false;

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      chunkSize: csvChunkSize,
      chunk(results, parser) {
        parser.pause();
        pending = pending.then(async () => {
          setAndValidateHeaders(results.meta.fields || Object.keys(results.data[0] || {}), context);
          for (const row of results.data) await processRow(row, context);
          const percent = results.meta.cursor && file.size ? Math.min(1, results.meta.cursor / file.size) : 0;
          const globalPercent = 20 + ((context.fileIndex + percent) / context.totalFiles) * 55;
          postProgress(`Calculating CSV file ${context.fileIndex + 1}/${context.totalFiles} row ${context.audit.totalRows.toLocaleString()}...`, globalPercent);
          parser.resume();
        }).catch(error => {
          if (!settled) {
            settled = true;
            parser.abort();
            reject(error);
          }
        });
      },
      complete() {
        pending.then(() => {
          if (!settled) {
            settled = true;
            if (!context.columns) throw new Error('No rows found in the uploaded file.');
            resolve();
          }
        }).catch(reject);
      },
      error(error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    });
  });
}

async function processParquet(file: File, context: ProcessingContext) {
  const asyncBuffer: AsyncBuffer = {
    byteLength: file.size,
    slice: (start, end) => file.slice(start, end).arrayBuffer()
  };
  const metadata = await parquetMetadataAsync(asyncBuffer);
  const schema = parquetSchema(metadata);
  const headers = schema.children.map(child => child.element.name);
  setAndValidateHeaders(headers, context);

  const totalRows = Number(metadata.num_rows);
  for (let rowStart = 0; rowStart < totalRows; rowStart += parquetBatchSize) {
    const rowEnd = Math.min(totalRows, rowStart + parquetBatchSize);
    let batch: Record<string, unknown>[] = [];
    await parquetRead({
      file: asyncBuffer,
      metadata,
      rowStart,
      rowEnd,
      rowFormat: 'object',
      onComplete: rows => { batch = rows; }
    });
    for (let index = 0; index < batch.length; index += 1) {
      await processRow(batch[index], context);
      batch[index] = {};
    }
    batch.length = 0;
    const globalPercent = 20 + ((context.fileIndex + (rowEnd / totalRows)) / context.totalFiles) * 55;
    postProgress(`Calculating Parquet file ${context.fileIndex + 1}/${context.totalFiles} row ${rowEnd.toLocaleString()}...`, globalPercent);
  }
}

async function processExcel(file: File, context: ProcessingContext) {
  let inputBuffer: ArrayBuffer | null = await file.arrayBuffer();
  const workbook = XLSX.read(inputBuffer, { type: 'array' });
  inputBuffer = null;

  let validSheetName: string | null = null;
  let headers: string[] = [];
  let range: XLSX.Range | null = null;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet['!ref'];
    if (!ref) continue;
    const r = XLSX.utils.decode_range(ref);
    const tempHeaders: string[] = [];
    for (let column = r.s.c; column <= r.e.c; column += 1) {
      tempHeaders.push(String(sheet[XLSX.utils.encode_cell({ r: r.s.r, c: column })]?.v ?? ''));
    }
    
    const tempColumns = buildColumnMap(tempHeaders);
    let isValid = true;
    for (const group of requiredColumnGroups) {
      if (!group.aliases.some(alias => tempColumns.has(alias))) {
        isValid = false;
        break;
      }
    }
    
    if (isValid) {
      validSheetName = sheetName;
      headers = tempHeaders;
      range = r;
      break;
    }
  }

  if (!validSheetName || !range) {
    throw new Error('Could not find any sheet containing the required data columns.');
  }

  const sheet = workbook.Sheets[validSheetName];
  setAndValidateHeaders(headers, context);

  for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
    const row: Record<string, unknown> = {};
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      row[headers[column - range.s.c]] = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })]?.v;
    }
    await processRow(row, context);
    if ((rowIndex - range.s.r) % 5000 === 0) {
      const progress = (rowIndex - range.s.r) / Math.max(1, range.e.r - range.s.r);
      const globalPercent = 20 + ((context.fileIndex + progress) / context.totalFiles) * 55;
      postProgress(`Calculating Excel file ${context.fileIndex + 1}/${context.totalFiles} row ${(rowIndex - range.s.r).toLocaleString()}...`, globalPercent);
    }
  }
}

function makeSummaryRows(summaryMap: Map<string, SummaryTotals>): SummaryRow[] {
  return Array.from(summaryMap.entries()).map(([policyClass, totals]) => ({
    class: policyClass,
    ...totals,
    total: totals.earnedPremium + totals.unearnedPremium + totals.dac + totals.gwpYtd
  }));
}

async function buildSummaryWorkbook(templateBuffer: ArrayBuffer, valStartStr: string, valEndStr: string, summaryRows: SummaryRow[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const resultSheet = workbook.getWorksheet('RESULT');
  if (!resultSheet) throw new Error('RESULT sheet not found in the template.');

  resultSheet.getCell('D2').value = new Date(valStartStr);
  resultSheet.getCell('D2').numFmt = 'DD/MM/YYYY';
  resultSheet.getCell('G2').value = new Date(valEndStr);
  resultSheet.getCell('G2').numFmt = 'DD/MM/YYYY';

  const extraRows = Math.max(0, summaryRows.length - 9);
  if (extraRows > 0) {
    resultSheet.spliceRows(16, 0, ...Array.from({ length: extraRows }, () => []));
  }
  
  summaryRows.forEach((row, index) => {
    const targetRow = resultSheet.getRow(index + 5);
    targetRow.values = [null, null, row.class, row.earnedPremium, row.unearnedPremium, row.dac, row.gwpYtd, row.exposure];
  });

  const output = await workbook.xlsx.writeBuffer();
  return new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function run(files: File[], valStartStr: string, valEndStr: string, templateBuffer: ArrayBuffer) {
  if (!navigator.storage?.getDirectory) {
    throw new Error('This browser cannot create the temporary local files required for low-memory processing.');
  }
  const valStart = parseDate(valStartStr);
  const valEnd = parseDate(valEndStr);
  if (!valStart || !valEnd) throw new Error('Invalid dates.');

  const root = await navigator.storage.getDirectory();
  const workspaceName = `earned-premium-${crypto.randomUUID()}`;
  const workspace = await root.getDirectoryHandle(workspaceName, { create: true });
  const calculationHandle = await workspace.getFileHandle(`Earned_Premium_Calculation_${valEndStr}.csv`, { create: true });
  const calculationWriter = new BufferedCsvWriter(await calculationHandle.createWritable());
  
    let keepWorkspaceForDownloads = false;

    try {
      await calculationWriter.writeRow(calculationHeaders);
      const context: ProcessingContext = {
        valStart,
        valEnd,
        columns: null,
        calculationWriter,
        summaryMap: new Map(),
        detailRows: [],
        audit: { totalRows: 0, calculatedRows: 0, reviewRows: 0, previewRows: 0, previewLimit, reasons: {} },
        fileIndex: 0,
        totalFiles: files.length
      };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        context.fileIndex = i;
        context.columns = null;
        
        const lowerName = file.name.toLowerCase();
        postProgress(`Reading ${file.name}...`, 10 + (i / files.length) * 10);
        if (lowerName.endsWith('.csv')) await processCsv(file, context);
        else if (lowerName.endsWith('.parquet')) await processParquet(file, context);
        else await processExcel(file, context);
      }

      context.audit.previewRows = context.detailRows.length;
      await calculationWriter.close();

      postProgress('Creating the summary workbook...', 85);
      const summaryRows = makeSummaryRows(context.summaryMap);
      const summaryWorkbook = await buildSummaryWorkbook(templateBuffer, valStartStr, valEndStr, summaryRows);
      const calculationFile = await calculationHandle.getFile();

      self.postMessage({
        type: 'complete',
        summaryWorkbook,
        calculationFile,
        workspaceName,
        summary: summaryRows,
        detailRows: context.detailRows,
        audit: context.audit
      });
      keepWorkspaceForDownloads = true;
    } finally {
      if (!keepWorkspaceForDownloads) {
        await root.removeEntry(workspaceName, { recursive: true }).catch(() => undefined);
      }
    }
}

self.onmessage = (event: MessageEvent<EpWorkerMessage>) => {
  if (event.data.type !== 'start') return;
  const { files, file, valStartStr, valEndStr, templateBuffer } = event.data;
  const filesToProcess = files || (file ? [file] : []);
  if (filesToProcess.length === 0 || !valStartStr || !valEndStr || !templateBuffer) return;
  run(filesToProcess, valStartStr, valEndStr, templateBuffer).catch(error => {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Earned premium processing failed.'
    });
  });
};
