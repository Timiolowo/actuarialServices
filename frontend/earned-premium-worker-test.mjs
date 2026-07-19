import assert from 'node:assert/strict';
import fs from 'node:fs';
import { File } from 'node:buffer';
import * as XLSX from 'xlsx';

class MemoryFileHandle {
  constructor(name) {
    this.name = name;
    this.bytes = new Uint8Array();
  }

  async createWritable() {
    const chunks = [];
    return {
      write: async value => chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value)),
      close: async () => {
        const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const merged = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        this.bytes = merged;
      }
    };
  }

  async getFile() {
    return new File([this.bytes], this.name, { type: 'text/csv;charset=utf-8' });
  }
}

class MemoryDirectoryHandle {
  constructor() {
    this.files = new Map();
    this.directories = new Map();
  }

  async getFileHandle(name) {
    if (!this.files.has(name)) this.files.set(name, new MemoryFileHandle(name));
    return this.files.get(name);
  }

  async getDirectoryHandle(name) {
    if (!this.directories.has(name)) this.directories.set(name, new MemoryDirectoryHandle());
    return this.directories.get(name);
  }

  async removeEntry(name) {
    this.files.delete(name);
    this.directories.delete(name);
  }
}

class MemoryFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }

  readAsText(blob) {
    blob.text().then(result => {
      this.result = result;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch(error => this.onerror?.(error));
  }
}

globalThis.File = File;
globalThis.FileReader = MemoryFileReader;
const root = new MemoryDirectoryHandle();
Object.defineProperty(globalThis, 'navigator', {
  value: { storage: { getDirectory: async () => root } },
  configurable: true
});

let resolveResult;
let rejectResult;
globalThis.self = {
  setImmediate: globalThis.setImmediate,
  clearImmediate: globalThis.clearImmediate,
  onmessage: null,
  postMessage(message) {
    if (message.type === 'complete') resolveResult?.(message);
    if (message.type === 'error') rejectResult?.(new Error(message.message));
  }
};

await import('./src/workers/earnedPremium.worker.ts');
assert.equal(typeof self.onmessage, 'function');

const templateBytes = fs.readFileSync('public/templates/Earned Premium Template.xlsx');
const freshTemplateBuffer = () => templateBytes.buffer.slice(
  templateBytes.byteOffset,
  templateBytes.byteOffset + templateBytes.byteLength
);

function runWorker(file) {
  return new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
    self.onmessage({
      data: {
        type: 'start',
        file,
        valStartStr: '2025-01-01',
        valEndStr: '2025-12-31',
        templateBuffer: freshTemplateBuffer()
      }
    });
  });
}

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
  },
  {
    PolicyKey: 'BAD-END', 'Customer Name': 'End Before Start', Class: 'Motor',
    'Registratn Dt': '2025-06-01', 'Start Date': '2025-08-01', 'End Date': '2025-07-31',
    Premium: 500, Comm: 50
  },
  {
    PolicyKey: 'BAD-REG', 'Customer Name': 'Invalid Registration', Class: 'Motor',
    'Registratn Dt': 'not-a-date', 'Start Date': '2025-01-01', 'End Date': '2025-12-31',
    Premium: 500, Comm: 50
  },
  {
    PolicyKey: 'BAD-START', 'Customer Name': 'Invalid Start', Class: 'Motor',
    'Registratn Dt': '2025-01-01', 'Start Date': 'not-a-date', 'End Date': '2025-12-31',
    Premium: 500, Comm: 50
  }
];

const inputWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(inputWorkbook, XLSX.utils.json_to_sheet(inputRows), 'Production');
const inputBytes = XLSX.write(inputWorkbook, { type: 'array', bookType: 'xlsx' });
const result = await runWorker(new File([inputBytes], 'earned-premium-test.xlsx'));

assert.deepEqual(result.audit, {
  totalRows: 7,
  calculatedRows: 2,
  reviewRows: 5,
  previewRows: 2,
  previewLimit: 1000,
  reasons: {
    'Registration date is after valuation date': 1,
    'Invalid premium': 1,
    'End date is before calculation start date': 1,
    'Invalid registration date': 1,
    'Invalid start date': 1
  }
});

const marine = result.detailRows.find(row => row.policyKey === 'MARINE-1');
assert.ok(marine, 'Marine Cargo row was not calculated');
assert.equal(marine.endDate, '2026-02-27');

const calculationCsv = await result.calculationFile.text();
assert.equal(calculationCsv.trimEnd().split('\n').length, 3);
assert.match(calculationCsv, /NORMAL-1/);
assert.match(calculationCsv, /MARINE-1/);
assert.match(calculationCsv, /2026-02-27/);

assert.equal(result.reviewFile, undefined, 'Review CSV must not be generated');

const outputWorkbook = XLSX.read(await result.summaryWorkbook.arrayBuffer(), { type: 'array' });
assert.deepEqual(outputWorkbook.SheetNames, ['RESULT']);
const resultSheet = outputWorkbook.Sheets.RESULT;
assert.equal(resultSheet.D2.w, '01/01/2025');
assert.equal(resultSheet.G2.w, '31/12/2025');
assert.deepEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'H4'].map(cell => resultSheet[cell].v), [
  'CLASS', 'EARNED PREMIUM', 'UPR', 'DAC', 'GWP YTD', 'EXPOSURE'
]);
assert.equal(resultSheet.C5.v, 'MARINE CARGO');
assert.equal(resultSheet.C6.v, 'MOTOR');
assert.equal(resultSheet.C7.v, 'TOTAL');
assert.equal(resultSheet.C16.v, 'Finance Earned Premium', 'Existing finance section must be preserved');

if (process.env.EP_TEST_OUTPUT) {
  fs.writeFileSync(process.env.EP_TEST_OUTPUT, Buffer.from(await result.summaryWorkbook.arrayBuffer()));
}

const largeRowCount = 20_000;
const largeCsv = [
  'PolicyKey,Customer Name,Class,Registratn Dt,Start Date,End Date,Premium,Comm',
  ...Array.from({ length: largeRowCount }, (_, index) =>
    `POL-${index + 1},Customer ${index + 1},Motor,2025-01-01,2025-01-01,2025-12-31,365,36.5`
  )
].join('\n');
const largeResult = await runWorker(new File([largeCsv], 'earned-premium-large.csv', { type: 'text/csv' }));

assert.equal(largeResult.audit.totalRows, largeRowCount);
assert.equal(largeResult.audit.calculatedRows, largeRowCount);
assert.equal(largeResult.audit.reviewRows, 0);
assert.equal(largeResult.detailRows.length, 1000, 'Browser preview must stay bounded');
assert.equal((await largeResult.calculationFile.text()).trimEnd().split('\n').length, largeRowCount + 1);

const largeSummaryWorkbook = XLSX.read(await largeResult.summaryWorkbook.arrayBuffer(), { type: 'array' });
assert.deepEqual(largeSummaryWorkbook.SheetNames, ['RESULT']);
assert.equal(largeSummaryWorkbook.Sheets.RESULT.C5.v, 'MOTOR');
assert.equal(largeSummaryWorkbook.Sheets.RESULT.C6.v, 'TOTAL');

console.log('Earned premium worker: KPI audit, CSV streaming, bounded preview, and RESULT workbook passed');
