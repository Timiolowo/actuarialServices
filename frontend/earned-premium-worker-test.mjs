import assert from 'node:assert/strict';
import fs from 'node:fs';
import { File } from 'node:buffer';
import * as XLSX from 'xlsx';

class MemoryFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onload?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
}

globalThis.File = File;
globalThis.FileReader = MemoryFileReader;

let resolveResult;
let rejectResult;
const resultPromise = new Promise((resolve, reject) => {
  resolveResult = resolve;
  rejectResult = reject;
});

globalThis.self = {
  setImmediate: globalThis.setImmediate,
  clearImmediate: globalThis.clearImmediate,
  onmessage: null,
  postMessage(message) {
    if (message.type === 'complete') resolveResult(message);
    if (message.type === 'error') rejectResult(new Error(message.message));
  }
};

const inputRows = [
  {
    PolicyKey: 'NORMAL-1', 'Customer Name': 'Normal', Class: 'Motor',
    'Registratn Dt': '2025-01-10', 'Start Date': '2025-01-01', 'End Date': '2025-12-31',
    Premium: 365, Comm: 36.5
  },
  {
    PolicyKey: 'MARINE-1', 'Customer Name': 'Marine', Class: 'Marine Cargo',
    'Registratn Dt': '2025-08-01', 'Start Date': '2025-08-31', 'End Date': '',
    Premium: 1000, Comm: 100
  },
  {
    PolicyKey: 'FUTURE-1', 'Customer Name': 'Future', Class: 'Motor',
    'Registratn Dt': '2026-01-01', 'Start Date': '2025-01-01', 'End Date': '2025-12-31',
    Premium: 500, Comm: 50
  },
  {
    PolicyKey: 'BAD-PREMIUM', 'Customer Name': 'Invalid', Class: 'Motor',
    'Registratn Dt': '2025-02-01', 'Start Date': '2025-01-01', 'End Date': '2025-12-31',
    Premium: 'not-a-number', Comm: 50
  }
];

const inputWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(inputWorkbook, XLSX.utils.json_to_sheet(inputRows), 'Production');
const inputBytes = XLSX.write(inputWorkbook, { type: 'array', bookType: 'xlsx' });
const inputFile = new File([inputBytes], 'earned-premium-test.xlsx');

await import('./src/workers/earnedPremium.worker.ts');
assert.equal(typeof self.onmessage, 'function');

const templateBytes = fs.readFileSync('public/templates/Earned Premium Data.xlsx');
const templateBuffer = templateBytes.buffer.slice(
  templateBytes.byteOffset,
  templateBytes.byteOffset + templateBytes.byteLength
);

self.onmessage({
  data: {
    type: 'start',
    file: inputFile,
    valStartStr: '2025-01-01',
    valEndStr: '2025-12-31',
    templateBuffer
  }
});

const result = await resultPromise;
assert.deepEqual(result.audit, {
  totalRows: 4,
  calculatedRows: 2,
  reviewRows: 2,
  previewRows: 2,
  previewLimit: 1000,
  reasons: {
    'Registration date is after valuation date': 1,
    'Invalid premium': 1
  }
});

const marine = result.detailRows.find(row => row.policyKey === 'MARINE-1');
assert.ok(marine, 'Marine Cargo row was not calculated');
assert.equal(marine.endDate, '2026-02-27');

const outputWorkbook = XLSX.read(await result.blob.arrayBuffer(), { type: 'array' });
const calculationRows = XLSX.utils.sheet_to_json(outputWorkbook.Sheets.Calculation, { header: 1 });
assert.equal(calculationRows[2][0], 'NORMAL-1');
assert.equal(calculationRows[3][0], 'MARINE-1');

const reviewRows = XLSX.utils.sheet_to_json(outputWorkbook.Sheets.Review, { header: 1 });
assert.equal(reviewRows.length, 3);
assert.equal(reviewRows[1][1], 'FUTURE-1');
assert.equal(reviewRows[2][1], 'BAD-PREMIUM');

const summaryRows = XLSX.utils.sheet_to_json(outputWorkbook.Sheets['Summary Data'], { header: 1 });
assert.deepEqual(summaryRows.slice(1).map(row => row[0]), ['MARINE CARGO', 'MOTOR', 'TOTAL']);

console.log('Earned premium worker: calculations, Marine Cargo, and review audit passed');
