import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { File } from 'node:buffer';
import { pathToFileURL } from 'node:url';
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

const messageChannel = globalThis.MessageChannel;

let resolveResult;
let rejectResult;
const resultPromise = new Promise((resolve, reject) => {
  resolveResult = resolve;
  rejectResult = reject;
});
globalThis.self = {
  importScripts() {},
  MessageChannel: messageChannel,
  onmessage: null,
  postMessage(message) {
    if (message.type === 'complete') resolveResult(message);
    if (message.type === 'error') rejectResult(new Error(message.message));
  }
};

const rows = [['metadata']];
while (rows.length < 8) rows.push([]);
rows.push(['Policy', 'Amount']);
rows.push(['A-1', 125]);
rows.push(['A-2', 250]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'ACTUALS_FOR_VISUALIZATION');
const workbookBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
const inputFile = new File([workbookBytes], 'local-test.xlsx');

const workerAsset = fs.readdirSync('dist/assets').find(name => name.startsWith('combine.worker-') && name.endsWith('.js'));
assert.ok(workerAsset, 'compiled worker asset is missing');
await import(pathToFileURL(path.resolve('dist/assets', workerAsset)).href);
assert.equal(typeof self.onmessage, 'function');
self.onmessage({
  data: {
    type: 'start',
    files: [{ file: inputFile, fieldName: 'lobFiles' }],
    separateRi: false
  }
});

const result = await resultPromise;
assert.equal(result.summary.processedFileCount, 1);
assert.equal(result.summary.sheets.ACTUALS_FOR_VISUALIZATION.rowCount, 2);
assert.equal(result.summary.sheets.ACTUALS_FOR_VISUALIZATION.sourceFileCount, 1);
assert.ok(result.zipBlob.size > 0);
console.log('Compiled local worker: 2 rows and ZIP completed');
