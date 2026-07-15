const fs = require('fs');
const path = require('path');
const { once } = require('events');
const { parentPort, workerData } = require('worker_threads');
const XLSX = require('xlsx');

async function closeStream(stream) {
  stream.end();
  await once(stream, 'finish');
}

async function appendSheetRows(sheet, sheetName, outputPath) {
  const reference = sheet['!ref'];
  if (!reference) return false;

  const range = XLSX.utils.decode_range(reference);
  if (range.e.r < 9) return false;

  const headers = [];
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 8, c: column })];
    headers[column] = String(cell?.v ?? '').trim();
  }

  const output = fs.createWriteStream(outputPath, { flags: 'a', encoding: 'utf8' });
  let contributedRows = false;

  try {
    for (let rowIndex = 9; rowIndex <= range.e.r; rowIndex += 1) {
      const record = {};
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

      if (!output.write(`${JSON.stringify(record)}\n`)) {
        await once(output, 'drain');
      }
      contributedRows = true;
    }
  } finally {
    await closeStream(output);
  }

  return contributedRows;
}

async function run() {
  const {
    filePath,
    fieldName,
    workingDir,
    separateRi,
    sheetNames
  } = workerData;

  const workbook = XLSX.readFile(filePath, {
    cellHTML: false,
    cellFormula: false,
    cellNF: false,
    cellStyles: false,
    cellText: false
  });
  const prefix = separateRi
    ? (fieldName === 'reinsuranceFiles' ? 'RI' : 'Gross')
    : '';
  const contributedSheets = [];

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const stateKey = prefix ? `${prefix}_${sheetName}` : sheetName;
    const outputPath = path.join(workingDir, `${stateKey}.jsonl`);
    if (await appendSheetRows(sheet, sheetName, outputPath)) {
      contributedSheets.push(stateKey);
    }
    delete workbook.Sheets[sheetName];
  }

  parentPort.postMessage({ success: true, contributedSheets });
}

run().catch(error => {
  parentPort.postMessage({
    success: false,
    error: error?.message || 'Could not read workbook'
  });
});
