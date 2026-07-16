/// <reference lib="webworker" />

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  getSheetConfig
} from '../utils/processor';
import type { ProcessingSummary, SheetProcessingSummary } from '../utils/processor';

type WorkbookCategory = 'lobFiles' | 'reinsuranceFiles';

interface LocalWorkbook {
  file: File;
  fieldName: WorkbookCategory;
}

interface StartMessage {
  type: 'start';
  files: LocalWorkbook[];
  separateRi: boolean;
  portfolioId?: string;
}

interface SheetState {
  key: string;
  rawHandle: FileSystemFileHandle;
  csvHandle: FileSystemFileHandle;
  sourceFileCount: number;
}

const textEncoder = new TextEncoder();

function postProgress(status: string, progressPercent: number, log?: string, logType: 'info' | 'success' | 'error' = 'info') {
  self.postMessage({ type: 'progress', status, progressPercent, log, logType });
}

function isNumericLike(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return Number.isFinite(Number(value.trim()));
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function* readLines(file: File): AsyncGenerator<string> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let pending = '';

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) yield line;
    if (done) break;
  }

  if (pending) yield pending;
}

async function writeBuffered(
  writable: FileSystemWritableFileStream,
  chunks: string[]
) {
  if (chunks.length === 0) return;
  await writable.write(textEncoder.encode(chunks.join('')));
  chunks.length = 0;
}

async function extractSheet(
  sheet: XLSX.WorkSheet,
  sheetName: string,
  writable: FileSystemWritableFileStream
) {
  const reference = sheet['!ref'];
  if (!reference) return false;
  const range = XLSX.utils.decode_range(reference);
  if (range.e.r < 9) return false;

  const headers: string[] = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 8, c: column })];
    headers[column] = String(cell?.v ?? '').trim();
  }

  const chunks: string[] = [];
  let bufferedLength = 0;
  let contributedRows = false;

  for (let rowIndex = 9; rowIndex <= range.e.r; rowIndex += 1) {
    const record: Record<string, unknown> = {};
    let hasData = false;

    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const header = headers[column];
      if (!header) continue;
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
      const value = cell?.v ?? '';
      record[header] = value;
      if (value !== '') hasData = true;
    }

    if (!hasData) continue;
    if (sheetName === 'ACTUARIAL_AOM_IMPACT') {
      delete record['* MACRO_STEP_ID_DESCRIPTION'];
    }

    const line = `${JSON.stringify(record)}\n`;
    chunks.push(line);
    bufferedLength += line.length;
    contributedRows = true;

    if (bufferedLength >= 1024 * 1024) {
      await writeBuffered(writable, chunks);
      bufferedLength = 0;
    }
  }

  await writeBuffered(writable, chunks);
  return contributedRows;
}

async function extractWorkbook(
  item: LocalWorkbook,
  states: Map<string, SheetState>,
  writers: Map<string, FileSystemWritableFileStream>,
  separateRi: boolean,
  primarySheets: string[]
) {
  const workbook = XLSX.read(await item.file.arrayBuffer(), {
    type: 'array',
    sheets: primarySheets,
    cellHTML: false,
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
    cellText: false
  });
  const prefix = separateRi
    ? (item.fieldName === 'reinsuranceFiles' ? 'RI' : 'Gross')
    : '';

  for (const sheetName of primarySheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const key = prefix ? `${prefix}_${sheetName}` : sheetName;
    const writer = writers.get(key);
    const state = states.get(key);
    if (writer && state && await extractSheet(sheet, sheetName, writer)) {
      state.sourceFileCount += 1;
    }
    delete workbook.Sheets[sheetName];
  }
}

async function analyzeRawSheet(file: File) {
  const headers: string[] = [];
  const headerSet = new Set<string>();
  const stats = new Map<string, { populatedCount: number; numericCount: number }>();

  for await (const line of readLines(file)) {
    if (!line) continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    for (const [header, value] of Object.entries(row)) {
      if (!headerSet.has(header)) {
        headerSet.add(header);
        headers.push(header);
      }
      const headerStats = stats.get(header) || { populatedCount: 0, numericCount: 0 };
      if (value !== '' && value !== null && value !== undefined) {
        headerStats.populatedCount += 1;
        if (isNumericLike(value)) headerStats.numericCount += 1;
      }
      stats.set(header, headerStats);
    }
  }

  const numericHeaders = new Set<string>();
  headers.forEach((header, index) => {
    const headerStats = stats.get(header);
    if (index === 0 || !headerStats || headerStats.populatedCount === 0) return;
    if (headerStats.numericCount / headerStats.populatedCount > 0.9) {
      numericHeaders.add(header);
    }
  });

  return { headers, numericHeaders };
}

async function materializeCsv(state: SheetState): Promise<SheetProcessingSummary> {
  const rawFile = await state.rawHandle.getFile();
  const { headers, numericHeaders } = await analyzeRawSheet(rawFile);
  const output = await state.csvHandle.createWritable();

  if (headers.length === 0) {
    await output.close();
    return { rowCount: 0, columnCount: 0, emptyCells: 0, totalCells: 0, sourceFileCount: state.sourceFileCount };
  }

  await output.write(textEncoder.encode(`${headers.map(csvCell).join(',')}\n`));
  const chunks: string[] = [];
  let bufferedLength = 0;
  let rowCount = 0;
  let emptyCells = 0;

  for await (const line of readLines(rawFile)) {
    if (!line) continue;
    const row = JSON.parse(line) as Record<string, unknown>;
    rowCount += 1;
    const cells = headers.map(header => {
      let value = row[header];
      if (numericHeaders.has(header)) {
        value = isNumericLike(value) ? Number(value) : 0;
      }
      if (value === '' || value === null || value === undefined || value === 0 || value === '0') {
        emptyCells += 1;
      }
      return csvCell(value);
    });
    const csvLine = `${cells.join(',')}\n`;
    chunks.push(csvLine);
    bufferedLength += csvLine.length;
    if (bufferedLength >= 1024 * 1024) {
      await writeBuffered(output, chunks);
      bufferedLength = 0;
    }
  }

  await writeBuffered(output, chunks);
  await output.close();
  return {
    rowCount,
    columnCount: headers.length,
    emptyCells,
    totalCells: rowCount * headers.length,
    sourceFileCount: state.sourceFileCount
  };
}

function outputPath(sheetKey: string, separateRi: boolean) {
  if (!separateRi) return `${sheetKey}.csv`;
  if (sheetKey.startsWith('Gross_')) return `Gross/${sheetKey.slice('Gross_'.length)}.csv`;
  return `RI/${sheetKey.slice('RI_'.length)}.csv`;
}

async function run({ files, separateRi, portfolioId }: StartMessage) {
  if (!navigator.storage?.getDirectory) {
    throw new Error('This browser cannot create the temporary local workspace required for workbook processing.');
  }

  const { primarySheets, derivedGroups } = getSheetConfig(portfolioId || '');

  const root = await navigator.storage.getDirectory();
  const workspaceName = `actuarial-combine-${crypto.randomUUID()}`;
  const workspace = await root.getDirectoryHandle(workspaceName, { create: true });

  try {
    const prefixes = separateRi ? ['Gross', 'RI'] : [''];
    const states = new Map<string, SheetState>();
    const writers = new Map<string, FileSystemWritableFileStream>();

    for (const prefix of prefixes) {
      for (const sheetName of primarySheets) {
        const key = prefix ? `${prefix}_${sheetName}` : sheetName;
        const rawHandle = await workspace.getFileHandle(`${key}.jsonl`, { create: true });
        const csvHandle = await workspace.getFileHandle(`${key}.csv`, { create: true });
        states.set(key, { key, rawHandle, csvHandle, sourceFileCount: 0 });
        writers.set(key, await rawHandle.createWritable());
      }
    }

    const skippedFiles: { name: string; reason: string }[] = [];
    let processedFileCount = 0;

    for (const [index, item] of files.entries()) {
      const fileNumber = index + 1;
      const status = `Reading workbook ${fileNumber}/${files.length}: ${item.file.name}`;
      postProgress(status, 5 + Math.round((fileNumber / files.length) * 45), status);
      try {
        await extractWorkbook(item, states, writers, separateRi, primarySheets);
        processedFileCount += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Could not read workbook';
        skippedFiles.push({ name: item.file.name, reason });
        postProgress(status, 5 + Math.round((fileNumber / files.length) * 45), `Skipped ${item.file.name}: ${reason}`, 'error');
      }
    }

    await Promise.all(Array.from(writers.values(), writer => writer.close()));
    if (processedFileCount === 0) {
      throw new Error('None of the selected files could be read as Excel workbooks.');
    }

    const sheets: Record<string, SheetProcessingSummary> = {};
    const sourceEntries = Array.from(states.entries());
    let totalRows = 0;

    for (const [index, [key, state]] of sourceEntries.entries()) {
      const status = `Creating CSV ${index + 1}/${sourceEntries.length}: ${key}`;
      postProgress(status, 50 + Math.round(((index + 1) / sourceEntries.length) * 30), status);
      sheets[key] = await materializeCsv(state);
      totalRows += sheets[key].rowCount;
    }

    for (const group of derivedGroups) {
      const [sourceSheet, ...derivedSheets] = group;
      for (const prefix of separateRi ? ['Gross_', 'RI_'] : ['']) {
        const sourceKey = `${prefix}${sourceSheet}`;
        const sourceSummary = sheets[sourceKey];
        if (!sourceSummary) continue;
        for (const sheetName of derivedSheets) {
          const key = `${prefix}${sheetName}`;
          sheets[key] = { ...sourceSummary };
          totalRows += sourceSummary.rowCount;
        }
      }
    }

    postProgress('Building ZIP package on this computer...', 84, 'Building compressed ZIP package locally...');
    const zip = new JSZip();
    const csvFiles = new Map<string, File>();
    for (const [key, state] of states) {
      const csvFile = await state.csvHandle.getFile();
      csvFiles.set(key, csvFile);
      zip.file(outputPath(key, separateRi), csvFile);
    }

    for (const group of derivedGroups) {
      const [sourceSheet, ...derivedSheets] = group;
      for (const prefix of separateRi ? ['Gross_', 'RI_'] : ['']) {
        const sourceKey = `${prefix}${sourceSheet}`;
        const sourceFile = csvFiles.get(sourceKey);
        if (!sourceFile) continue;
        for (const sheetName of derivedSheets) {
          zip.file(outputPath(`${prefix}${sheetName}`, separateRi), sourceFile);
        }
      }
    }

    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      metadata => postProgress('Building ZIP package on this computer...', 84 + Math.round(metadata.percent * 0.11))
    );
    const summary: ProcessingSummary = {
      uploadedFileCount: files.length,
      processedFileCount,
      skippedFiles,
      sheetCount: Object.keys(sheets).length,
      populatedSheetCount: Object.values(sheets).filter(sheet => sheet.rowCount > 0).length,
      totalRows,
      sheets
    };

    self.postMessage({ type: 'complete', zipBlob, summary });
  } finally {
    await root.removeEntry(workspaceName, { recursive: true }).catch(() => undefined);
  }
}

self.onmessage = (event: MessageEvent<StartMessage>) => {
  if (event.data.type !== 'start') return;
  run(event.data).catch(error => {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Local workbook processing failed.'
    });
  });
};
