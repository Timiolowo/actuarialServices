import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { File } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
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
    return new File([this.bytes], this.name);
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

const messageChannels = [];
class TestMessageChannel extends globalThis.MessageChannel {
  constructor() {
    super();
    this.port1.unref();
    this.port2.unref();
    messageChannels.push(this);
  }
}

let resolveResult;
let rejectResult;
const resultPromise = new Promise((resolve, reject) => {
  resolveResult = resolve;
  rejectResult = reject;
});
globalThis.self = {
  importScripts() {},
  MessageChannel: TestMessageChannel,
  onmessage: null,
  postMessage(message) {
    if (message.type === 'complete') resolveResult(message);
    if (message.type === 'error') rejectResult(new Error(message.message));
  }
};

const vbaPayload = Uint8Array.from([11, 22, 33, 44, 55]);
const formats = [
  { extension: 'xlsx', bookType: 'xlsx' },
  { extension: 'xlsm', bookType: 'xlsm', vba: vbaPayload },
  { extension: 'xlsb', bookType: 'xlsb' }
];
const files = [];
const grossMatches = [];

for (const [index, format] of formats.entries()) {
  const lobName = `LOB-${index + 1}`;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['original']]), 'Modellinput');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['original']]), 'Close_Incremental');
  if (format.vba) workbook.vbaraw = format.vba;
  const bytes = XLSX.write(workbook, {
    type: 'array',
    bookType: format.bookType,
    bookVBA: true
  });
  const fileName = `engine-${index + 1}.${format.extension}`;
  files.push({ file: new File([bytes], fileName), fieldName: 'lobFiles' });
  grossMatches.push({
    id: fileName,
    fileName,
    lobName,
    section: 'Gross',
    matchCount: 1,
    matchedLabels: [lobName]
  });
}

const workerAsset = fs.readdirSync('dist/assets')
  .find(name => name.startsWith('transfer.worker-') && name.endsWith('.js'));
assert.ok(workerAsset, 'compiled transfer worker asset is missing');
await import(pathToFileURL(path.resolve('dist/assets', workerAsset)).href);
assert.equal(typeof self.onmessage, 'function');
self.onmessage({
  data: {
    type: 'start',
    files,
    modelInput: {
      grossHeaders: ['LOB', 'Value'],
      riHeaders: ['LOB', 'Value'],
      grossData: formats.map((_, index) => ({ LOB: `LOB-${index + 1}`, Value: 100 + index })),
      riData: []
    },
    reserveData: {
      gross: formats.map((_, index) => ({ lobName: `LOB-${index + 1}`, attrIBNR: 200 + index })),
      ri: [],
      errors: [],
      missingSheets: []
    },
    grossMatches,
    riMatches: []
  }
});

const result = await resultPromise;
assert.equal(result.summary.processedFileCount, 3);
assert.equal(result.summary.skippedFiles.length, 0);
const zip = await JSZip.loadAsync(await result.zipBlob.arrayBuffer());

for (const [index, format] of formats.entries()) {
  const entry = zip.file(`Gross/engine-${index + 1}.${format.extension}`);
  assert.ok(entry, `${format.extension.toUpperCase()} output is missing`);
  const bytes = await entry.async('uint8array');
  const workbook = XLSX.read(bytes, { type: 'array', bookVBA: true });
  assert.equal(workbook.Sheets.Modellinput.A9.v, `LOB-${index + 1}`);
  assert.equal(workbook.Sheets.Modellinput.B9.v, 100 + index);
  assert.equal(workbook.Sheets.Close_Incremental.EX9.v, 200 + index);
  if (format.vba) {
    assert.deepEqual(Array.from(workbook.vbaraw || []), Array.from(vbaPayload));
  }
}

for (const channel of messageChannels) {
  channel.port1.close();
  channel.port2.close();
}
console.log('Local transfer worker: XLSX, XLSM/VBA, and XLSB round trips passed');
process.exit(0);
