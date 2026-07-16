/// <reference lib="webworker" />

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type {
  ParsedModelInput,
  ReserveSplitData,
  UploadMatch
} from '../components/DataProcessing/types';
import type { ProcessingSummary } from '../utils/processor';

type WorkbookCategory = 'lobFiles' | 'reinsuranceFiles';

interface LocalWorkbook {
  file: File;
  fieldName: WorkbookCategory;
}

interface StartMessage {
  type: 'start';
  files: LocalWorkbook[];
  modelInput: ParsedModelInput;
  reserveData: ReserveSplitData;
  grossMatches: UploadMatch[];
  riMatches: UploadMatch[];
}

interface OutputWorkbook {
  path: string;
  handle: FileSystemFileHandle;
}

function postProgress(
  status: string,
  progressPercent: number,
  log?: string,
  logType: 'info' | 'success' | 'error' = 'info'
) {
  self.postMessage({ type: 'progress', status, progressPercent, log, logType });
}

function outputBookType(fileName: string): XLSX.BookType {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'xlsm') return 'xlsm';
  if (extension === 'xlsb') return 'xlsb';
  if (extension === 'xls') return 'biff8';
  if (extension === 'xlsx') return 'xlsx';
  throw new Error('CSV files cannot contain the Modellinput and Close_Incremental worksheets required for data transfer.');
}

function matchingLob(item: LocalWorkbook, grossMatches: UploadMatch[], riMatches: UploadMatch[]) {
  const matches = item.fieldName === 'reinsuranceFiles' ? riMatches : grossMatches;
  return matches.find(match => match.fileName === item.file.name)?.lobName || null;
}

async function transformWorkbook(
  item: LocalWorkbook,
  lobName: string,
  modelInput: ParsedModelInput,
  reserveData: ReserveSplitData
) {
  const isRi = item.fieldName === 'reinsuranceFiles';
  const workbook = XLSX.read(await item.file.arrayBuffer(), {
    type: 'array',
    bookVBA: true,
    cellStyles: true,
    cellFormula: true,
    cellNF: true
  });

  const modelSheet = workbook.Sheets.Modellinput;
  if (modelSheet) {
    const dataList = isRi ? modelInput.riData : modelInput.grossData;
    const lobRecord = dataList.find(record =>
      Object.values(record).includes(lobName)
      || Object.values(record).some(value => typeof value === 'string' && value.includes(lobName))
    );
    if (lobRecord) {
      XLSX.utils.sheet_add_json(modelSheet, [lobRecord], { skipHeader: true, origin: 'A9' });
    }
  }

  const closeSheet = workbook.Sheets.Close_Incremental;
  if (closeSheet) {
    const reserveRows = isRi ? reserveData.ri : reserveData.gross;
    const reserveLob = reserveRows.find(row => row.lobName === lobName);
    if (reserveLob) {
      XLSX.utils.sheet_add_aoa(closeSheet, [[reserveLob.attrIBNR]], { origin: 'EX9' });
    }
  }

  return XLSX.write(workbook, {
    type: 'array',
    bookType: outputBookType(item.file.name),
    bookVBA: true,
    compression: false
  }) as ArrayBuffer;
}

async function run({ files, modelInput, reserveData, grossMatches, riMatches }: StartMessage) {
  if (!navigator.storage?.getDirectory) {
    throw new Error('This browser cannot create the temporary local workspace required for data processing.');
  }

  const root = await navigator.storage.getDirectory();
  const workspaceName = `actuarial-transfer-${crypto.randomUUID()}`;
  const workspace = await root.getDirectoryHandle(workspaceName, { create: true });

  try {
    const outputs: OutputWorkbook[] = [];
    const skippedFiles: { name: string; reason: string }[] = [];

    for (const [index, item] of files.entries()) {
      const fileNumber = index + 1;
      const status = `Processing workbook ${fileNumber}/${files.length}: ${item.file.name}`;
      postProgress(status, 5 + Math.round((index / files.length) * 75), status);

      try {
        const lobName = matchingLob(item, grossMatches, riMatches);
        if (!lobName) throw new Error('Could not determine the line of business from the validated file matches.');

        const outputBytes = await transformWorkbook(item, lobName, modelInput, reserveData);
        const handle = await workspace.getFileHandle(`${index}.workbook`, { create: true });
        const writable = await handle.createWritable();
        await writable.write(outputBytes);
        await writable.close();

        const folder = item.fieldName === 'reinsuranceFiles' ? 'RI' : 'Gross';
        outputs.push({ path: `${folder}/${item.file.name}`, handle });
        postProgress(status, 5 + Math.round((fileNumber / files.length) * 75), `Updated ${item.file.name}.`, 'success');
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Could not process workbook';
        skippedFiles.push({ name: item.file.name, reason });
        postProgress(status, 5 + Math.round((fileNumber / files.length) * 75), `Skipped ${item.file.name}: ${reason}`, 'error');
      }
    }

    if (outputs.length === 0) {
      throw new Error('None of the selected files could be processed.');
    }

    postProgress('Building ZIP package on this computer...', 82, 'Building the final ZIP locally...');
    const zip = new JSZip();
    for (const output of outputs) {
      zip.file(output.path, await output.handle.getFile());
    }
    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE', streamFiles: true },
      metadata => postProgress('Building ZIP package on this computer...', 82 + Math.round(metadata.percent * 0.15))
    );

    const summary: ProcessingSummary = {
      uploadedFileCount: files.length,
      processedFileCount: outputs.length,
      skippedFiles,
      sheetCount: 0,
      populatedSheetCount: 0,
      totalRows: 0,
      sheets: {}
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
      message: error instanceof Error ? error.message : 'Local data processing failed.'
    });
  });
};
