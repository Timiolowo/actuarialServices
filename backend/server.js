require('dotenv').config();

const express = require('express');
const { Worker } = require('worker_threads');
const { randomUUID } = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const os = require('os');
const path = require('path');
const readline = require('readline');
const JSZip = require('jszip');
const { processRevisedComposite } = require('./revisedCompositeLogic');
const { processDataSorting } = require('./dataSortingLogic');

const app = express();
app.set('trust proxy', 1);
const allowedOrigins = new Set(
  (process.env.APP_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed.');
    error.statusCode = 403;
    return callback(error);
  },
  exposedHeaders: ['X-Processing-Summary']
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false
}));

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xlsb']);
const PORT = process.env.PORT || 3001;
const JOB_TTL_MS = 60 * 60 * 1000;
const MAX_FILES_PER_JOB = 100;

const HELP_DESK_SYSTEM_PROMPT = `You are the Help Desk assistant for the Actuarial Services Reserves Console.

Product knowledge:
- Users select Group Life, Individual Life, Health Care, or Property & Casualty portfolios.
- Combine Sheet processes Gross and Reinsurance XLSX/XLSB workbooks locally in the browser and provides a ZIP download without uploading the workbooks.
- Data Processing is a four-step workflow: Parameters, Upload Data, Data Summary, and Review.
- Parameters requires a valuation year and month, opening-balance treatment, and a Reserve Split Template. The template is parsed from Modellinput and expected LOB sheets. Valuation-date mismatches must be fixed before continuing.
- Upload Data accepts XLS, XLSX, XLSB, and XLSM Gross and Reinsurance files or folders, matches them to lines of business, and transfers data locally in the browser.
- Data Summary separates Attritional IBNR, Large Loss IBNR, and Outstanding Claims (OCR), with prior-year, current-year, and total values.
- Review confirms configuration, file matches, reserve dates, and optional CSV verification results.
- Common problems include unsupported files, missing or misspelled sheet names, valuation-date mismatches, unmatched LOB files, empty Modellinput data, browser memory limits, and failed downloads.

Support behavior:
1. Identify the portfolio, workflow page, step, and exact error before making assumptions.
2. Give concise, ordered diagnostic steps and explain what each result means.
3. Ask for safe evidence such as the exact error text, worksheet names, file extension and size, browser console message, network status code, or processing log excerpt.
4. Never request policyholder, claimant, employee, medical, financial-account, or other confidential personal data. Tell users to redact sensitive workbook contents and screenshots.
5. Do not claim you opened a workbook, inspected logs, ran code, changed data, or fixed the system unless the user supplied that evidence or an actual tool result confirms it.
6. Distinguish IBNR from OCR clearly. Red color is reserved for genuine errors or failed verification, not ordinary reserve values.
7. If evidence is insufficient, say what cannot yet be determined and request the smallest useful diagnostic detail.
8. For actuarial interpretation, explain the interface and data categories but advise users to follow their organisation's approved methodology and controls.

Respond in clear Markdown. Start with the likely cause or next action, then provide steps.`;

const GROUP1_SHEETS = [
  'ACTUALS_FOR_VISUALIZATION', 'ACTUARIAL_AOM_IMPACT', 'CF_T1_PVFC_LIC_CLO',
  'CF_T1_PVFC_LIC_INCEXP_LIC_INCR', 'CF_T1_PVFC_LIC_INCLAIM_LIC_INCR', 'CURVE_ID_PARAM',
  'INITIALIZATION', 'MANDATORY_ACTUALS', 'MP_GOC', 'MP_GOC_SEG', 'OCI_OPTION_DERECOG',
  'CF_T1_PVFC_LIC_CLO_FADJ_PY', 'CF_T1_PVFC_LIC_OP', 'CF_T1_PVFC_LIC_TEXPVAR_PY'
];

const DERIVED_SHEET_GROUPS = [
  ['CF_T1_PVFC_LIC_CLO_FADJ_PY', 'CF_T1_PVFC_LIC_CLO_TADJ_PY', 'CF_T1_PVFC_LIC_DEREC', 'CF_T1_PVFC_LIC_EXPCLO_PY'],
  ['CF_T1_PVFC_LIC_OP', 'CF_T1_PVFC_LIC_OP_FADJ_PY', 'CF_T1_PVFC_LIC_OP_TADJ_PY'],
  ['CF_T1_PVFC_LIC_TEXPVAR_PY', 'CF_T1_PVFC_LIC_TASSCHG_PY', 'CF_T1_PVFC_LIC_FASSCHG_PY', 'CF_T1_PVFC_LIC_FEXPVAR_PY']
];

const INDIVIDUAL_LIFE_SHEETS = [
  'MP_GOC', 'MP_GOC_SEG', 'ACTUARIAL_AOM_IMPACT', 'INITIALIZATION', 'CURVE_ID_PARAM',
  'OCI_OPTION_DERECOG', 'MANDATORY_ACTUALS', 'ACTUALS_FOR_VISUALIZATION', 'COVERAGE_UNIT',
  'CF_T1_PVFC_LRC_OP', 'CF_T1_PVFC_LRC_OP_TADJ', 'CF_T1_PVFC_LRC_OP_FADJ',
  'CF_T1_PVFC_LRC_NB_POS', 'CF_T1_PVFC_LRC_EXPCLOIF', 'CF_T1_PVFC_LRC_EXPCLONB',
  'CF_T1_PVFC_LRC_DEREC', 'CF_T1_PVFC_LRC_CLO_TADJ', 'CF_T1_PVFC_LRC_CLO_FADJ',
  'CF_T1_PVFC_LRC_TEXPVAR', 'CF_T1_PVFC_LRC_FEXPVAR', 'CF_T1_PVFC_LRC_TASSCHG',
  'CF_T1_PVFC_LRC_FASSCHG', 'CF_T1_PVFC_LRC_CLO', 'CF_T1_PVFC_LIC_OP',
  'CF_T1_PVFC_LIC_OP_TADJ_PY', 'CF_T1_PVFC_LIC_OP_FADJ_PY', 'CF_T1_PVFC_LIC_EXPCLO_PY',
  'CF_T1_PVFC_LIC_DEREC', 'CF_T1_PVFC_LIC_CLO_TADJ_PY', 'CF_T1_PVFC_LIC_CLO_FADJ_PY',
  'CF_T1_PVFC_LIC_TEXPVAR_PY', 'CF_T1_PVFC_LIC_FEXPVAR_PY', 'CF_T1_PVFC_LIC_TASSCHG_PY',
  'CF_T1_PVFC_LIC_FASSCHG_PY', 'CF_T1_PVFC_LIC_INCLAIM_LIC_INCR',
  'CF_T1_PVFC_LIC_INCEXP_LIC_INCR', 'CF_T1_PVFC_LIC_CLO', 'CF_T1_ACQ_CF_LRC_OP_TADJ',
  'CF_T1_ACQ_CF_LRC_OP_FADJ', 'CF_T1_ACQ_CF_LRC_OP', 'CF_T1_ACQ_CF_LRC_NB',
  'CF_T1_ACQ_CF_LRC_EXPCLOIF', 'CF_T1_ACQ_CF_LRC_TEXPVAR', 'CF_T1_ACQ_CF_LRC_EXPCLONB',
  'CF_T1_ACQ_CF_LRC_DEREC', 'CF_T1_ACQ_CF_LRC_TASSCHG', 'CF_T1_ACQ_CF_LRC_FASSCHG',
  'CF_T1_ACQ_CF_LRC_CLO'
];

const INDIVIDUAL_LIFE_DERIVED_GROUPS = [];

const OUTPUT_SHEETS = [
  ...GROUP1_SHEETS,
  ...DERIVED_SHEET_GROUPS.flatMap(([_, ...derivedSheets]) => derivedSheets)
];

function getSheetConfigForPortfolio(portfolioId) {
  if (portfolioId === 'individual-life') {
    return {
      primarySheets: INDIVIDUAL_LIFE_SHEETS,
      derivedGroups: INDIVIDUAL_LIFE_DERIVED_GROUPS
    };
  }
  return {
    primarySheets: GROUP1_SHEETS,
    derivedGroups: DERIVED_SHEET_GROUPS
  };
}

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(
      SUPPORTED_EXTENSIONS.has(extension)
        ? null
        : new Error(`Unsupported file type: ${file.originalname}`),
      SUPPORTED_EXTENSIONS.has(extension)
    );
  }
});

const processingJobs = new Map();
const stagedUploads = new Map();

function isNumericLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return Number.isFinite(Number(value.trim()));
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createSheetState(baseDir, sheetName) {
  const rawPath = path.join(baseDir, `${sheetName}.jsonl`);
  fs.closeSync(fs.openSync(rawPath, 'a'));
  return {
    sheetName,
    rawPath,
    csvPath: null,
    sourceFileCount: 0
  };
}

function writeLine(stream, line) {
  return new Promise((resolve, reject) => {
    stream.write(line, error => (error ? reject(error) : resolve()));
  });
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end(error => (error ? reject(error) : resolve()));
  });
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {}
}

async function safeRemoveDir(dirPath) {
  if (!dirPath) return;
  try {
    await fsp.rm(dirPath, { recursive: true, force: true });
  } catch {}
}

async function analyzeRawSheet(rawPath) {
  const headers = [];
  const headerSet = new Set();
  const stats = new Map();

  const lineReader = readline.createInterface({
    input: fs.createReadStream(rawPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of lineReader) {
    if (!line) continue;
    const row = JSON.parse(line);

    for (const [header, value] of Object.entries(row)) {
      if (!headerSet.has(header)) {
        headerSet.add(header);
        headers.push(header);
      }

      if (!stats.has(header)) stats.set(header, { populatedCount: 0, numericCount: 0 });
      if (value !== '' && value !== null && value !== undefined) {
        const headerStats = stats.get(header);
        headerStats.populatedCount += 1;
        if (isNumericLike(value)) headerStats.numericCount += 1;
      }
    }
  }

  const numericHeaders = new Set();
  headers.forEach((header, index) => {
    const headerStats = stats.get(header);
    if (!headerStats || index === 0) return;
    if (headerStats.populatedCount > 0 && headerStats.numericCount / headerStats.populatedCount > 0.9) {
      numericHeaders.add(header);
    }
  });

  return { headers, numericHeaders };
}

async function materializeCsv(rawPath, csvPath, headers, numericHeaders) {
  if (headers.length === 0) {
    await fsp.writeFile(csvPath, '');
    return { rowCount: 0, columnCount: 0, emptyCells: 0, totalCells: 0 };
  }

  const output = fs.createWriteStream(csvPath, { encoding: 'utf8' });
  await writeLine(output, `${headers.map(csvCell).join(',')}\n`);

  let rowCount = 0;
  let emptyCells = 0;

  const lineReader = readline.createInterface({
    input: fs.createReadStream(rawPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of lineReader) {
    if (!line) continue;
    const row = JSON.parse(line);
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

    await writeLine(output, `${cells.join(',')}\n`);
  }

  await closeStream(output);

  return {
    rowCount,
    columnCount: headers.length,
    emptyCells,
    totalCells: rowCount * headers.length
  };
}

function createJob(fileCount) {
  const job = {
    id: randomUUID(),
    status: 'queued',
    currentStatus: 'Queued for processing.',
    progressPercent: 0,
    logs: [],
    uploadedFileCount: fileCount,
    processedFileCount: 0,
    summary: null,
    error: null,
    workingDir: null,
    zipPath: null,
    cleanupTimer: null,
    createdAt: new Date().toISOString()
  };

  processingJobs.set(job.id, job);
  scheduleJobCleanup(job);
  return job;
}

function appendJobLog(job, message, type = 'info') {
  job.logs.push({
    id: `${job.logs.length + 1}`,
    type,
    message,
    timestamp: new Date().toISOString()
  });
}

function updateJob(job, currentStatus, progressPercent) {
  job.currentStatus = currentStatus;
  job.progressPercent = progressPercent;
}

function scheduleJobCleanup(job) {
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => {
    cleanupJob(job.id).catch(error => {
      console.error(`Failed to clean up job ${job.id}:`, error);
    });
  }, JOB_TTL_MS);

  if (typeof job.cleanupTimer.unref === 'function') {
    job.cleanupTimer.unref();
  }
}

async function cleanupJob(jobId) {
  const job = processingJobs.get(jobId);
  if (!job) return;
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  await safeRemoveDir(job.workingDir);
  processingJobs.delete(jobId);
}

function scheduleStagedUploadCleanup(stagedUpload) {
  if (stagedUpload.cleanupTimer) clearTimeout(stagedUpload.cleanupTimer);
  stagedUpload.cleanupTimer = setTimeout(() => {
    cleanupStagedUpload(stagedUpload.id).catch(error => {
      console.error(`Failed to clean up staged upload ${stagedUpload.id}:`, error);
    });
  }, JOB_TTL_MS);

  if (typeof stagedUpload.cleanupTimer.unref === 'function') {
    stagedUpload.cleanupTimer.unref();
  }
}

async function cleanupStagedUpload(uploadId) {
  const stagedUpload = stagedUploads.get(uploadId);
  if (!stagedUpload) return;
  if (stagedUpload.cleanupTimer) clearTimeout(stagedUpload.cleanupTimer);
  stagedUploads.delete(uploadId);
  await Promise.all(stagedUpload.files.map(file => safeUnlink(file.path)));
}

function loadStagedUpload(req, res, next) {
  const stagedUpload = stagedUploads.get(req.params.uploadId);
  if (!stagedUpload) {
    return res.status(404).json({ error: 'Upload session not found or expired.' });
  }
  req.stagedUpload = stagedUpload;
  return next();
}

async function buildZipFile(zipPath, sourceSheets, separateRi, derivedGroups) {
  const zip = new JSZip();

  for (const [sheetKey, state] of sourceSheets.entries()) {
    let outPath = `${sheetKey}.csv`;
    if (separateRi) {
      if (sheetKey.startsWith('Gross_')) {
        outPath = `Gross/${sheetKey.replace('Gross_', '')}.csv`;
      } else if (sheetKey.startsWith('RI_')) {
        outPath = `RI/${sheetKey.replace('RI_', '')}.csv`;
      }
    }
    zip.file(outPath, fs.createReadStream(state.csvPath));
  }

  for (const [sourceSheet, ...derivedSheets] of derivedGroups) {
    const prefixes = separateRi ? ['Gross_', 'RI_'] : [''];
    for (const prefix of prefixes) {
      const sourceKey = `${prefix}${sourceSheet}`;
      if (!sourceSheets.has(sourceKey)) continue;
      const sourceState = sourceSheets.get(sourceKey);
      for (const sheetName of derivedSheets) {
        let outPath = `${sheetName}.csv`;
        if (separateRi) {
          outPath = prefix === 'Gross_' ? `Gross/${sheetName}.csv` : `RI/${sheetName}.csv`;
        }
        zip.file(outPath, fs.createReadStream(sourceState.csvPath));
      }
    }
  }

  await new Promise((resolve, reject) => {
    zip.generateNodeStream({
      type: 'nodebuffer',
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
      .on('error', reject)
      .pipe(fs.createWriteStream(zipPath))
      .on('error', reject)
      .on('finish', resolve);
  });
}

function extractWorkbookInWorker(file, workingDir, separateRi, sheetNames) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(path.join(__dirname, 'consolidationWorker.js'), {
      workerData: {
        filePath: file.path,
        fieldName: file.fieldname,
        workingDir,
        separateRi,
        sheetNames
      },
      execArgv: [],
      resourceLimits: {
        maxOldGenerationSizeMb: 384,
        stackSizeMb: 8
      }
    });

    worker.once('message', message => {
      settled = true;
      if (message.success) {
        resolve(message.contributedSheets || []);
      } else {
        reject(new Error(message.error || 'Could not read workbook'));
      }
    });
    worker.once('error', error => {
      settled = true;
      reject(new Error(error.code === 'ERR_WORKER_OUT_OF_MEMORY'
        ? 'Workbook exceeded the available processing memory.'
        : error.message));
    });
    worker.once('exit', code => {
      if (!settled) {
        reject(new Error(code === 0
          ? 'Workbook reader stopped before returning a result.'
          : `Workbook reader stopped with exit code ${code}.`));
      }
    });
  });
}

async function processJob(job, files) {
  const uploadedPaths = files.map(file => file.path).filter(Boolean);

  try {
    job.status = 'running';
    updateJob(job, `Reading 0/${files.length} workbooks...`, 2);
    appendJobLog(job, `Queued ${files.length} workbook(s) for backend processing.`);

    const workingDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'reserves-process-'));
    job.workingDir = workingDir;

    const sourceSheets = new Map();
    const addSheetState = (prefix, sheetName) => {
      const key = prefix ? `${prefix}_${sheetName}` : sheetName;
      if (!sourceSheets.has(key)) {
         sourceSheets.set(key, createSheetState(workingDir, key));
      }
      return sourceSheets.get(key);
    };

    const { primarySheets, derivedGroups } = getSheetConfigForPortfolio(job.portfolioId);
    const totalSheetTarget = primarySheets.length + derivedGroups.flat().length - derivedGroups.length;

    if (job.separateRi) {
      primarySheets.forEach(s => addSheetState('Gross', s));
      primarySheets.forEach(s => addSheetState('RI', s));
    } else {
      primarySheets.forEach(s => addSheetState('', s));
    }
    const skippedFiles = [];
    let processedFileCount = 0;

    for (const [fileIndex, file] of files.entries()) {
      try {
        updateJob(job, `Reading workbook ${fileIndex + 1}/${files.length}: ${file.originalname}`, Math.min(30, Math.round(((fileIndex + 1) / files.length) * 30)));
        appendJobLog(job, `Reading workbook ${fileIndex + 1}/${files.length}: ${file.originalname}`);

        const contributedSheets = await extractWorkbookInWorker(file, workingDir, job.separateRi, primarySheets);

        processedFileCount += 1;
        job.processedFileCount = processedFileCount;

        for (const stateKey of contributedSheets) {
          const state = sourceSheets.get(stateKey);
          if (state) state.sourceFileCount += 1;
        }
      } catch (error) {
        skippedFiles.push({ name: file.originalname, reason: error.message || 'Could not read workbook' });
        appendJobLog(job, `Skipped workbook: ${file.originalname} (${error.message || 'Could not read workbook'})`, 'error');
      } finally {
        await safeUnlink(file.path);
      }
    }

    if (processedFileCount === 0) {
      throw new Error('None of the uploaded files could be read as Excel workbooks.');
    }

    const sheets = {};
    let totalRows = 0;
    let completedOutputSheets = 0;

    for (const [sheetKey, state] of sourceSheets.entries()) {
      completedOutputSheets += 1;
      const targetCount = job.separateRi ? totalSheetTarget * 2 : totalSheetTarget;
      updateJob(job, `Processing sheet ${completedOutputSheets}/${targetCount}: ${sheetKey}`, 30 + Math.round((completedOutputSheets / targetCount) * 45));
      appendJobLog(job, `Processing sheet ${completedOutputSheets}/${targetCount}: ${sheetKey}`);

      const csvPath = path.join(workingDir, `${sheetKey}.csv`);
      const { headers, numericHeaders } = await analyzeRawSheet(state.rawPath);
      const summary = await materializeCsv(state.rawPath, csvPath, headers, numericHeaders);

      state.csvPath = csvPath;
      sheets[sheetKey] = { ...summary, sourceFileCount: state.sourceFileCount };
      totalRows += summary.rowCount;
    }

    for (const [sourceSheet, ...derivedSheets] of derivedGroups) {
      const prefixes = job.separateRi ? ['Gross_', 'RI_'] : [''];
      for (const prefix of prefixes) {
        const sourceKey = `${prefix}${sourceSheet}`;
        if (!sourceSheets.has(sourceKey)) continue;
        const sourceState = sourceSheets.get(sourceKey);
        for (const sheetName of derivedSheets) {
          const destKey = `${prefix}${sheetName}`;
          completedOutputSheets += 1;
          const targetCount = job.separateRi ? totalSheetTarget * 2 : totalSheetTarget;
          updateJob(job, `Processing sheet ${completedOutputSheets}/${targetCount}: ${sheetName}`, 30 + Math.round((completedOutputSheets / targetCount) * 45));
          appendJobLog(job, `Processing sheet ${completedOutputSheets}/${targetCount}: ${destKey}`);

          sheets[destKey] = { ...sheets[sourceKey], sourceFileCount: sourceState.sourceFileCount };
          totalRows += sheets[destKey].rowCount;
        }
      }
    }

    const summary = {
      uploadedFileCount: files.length,
      processedFileCount,
      skippedFiles,
      sheetCount: Object.keys(sheets).length,
      populatedSheetCount: Object.values(sheets).filter(sheet => sheet.rowCount > 0).length,
      totalRows,
      sheets
    };

    updateJob(job, 'Building compressed ZIP package...', 82);
    appendJobLog(job, 'Building compressed ZIP package...');

    const zipPath = path.join(workingDir, 'processed_sheets.zip');
    await buildZipFile(zipPath, sourceSheets, job.separateRi, derivedGroups);

    job.zipPath = zipPath;
    job.summary = summary;
    job.status = 'completed';
    updateJob(job, 'Consolidation completed successfully.', 100);
    appendJobLog(job, `${summary.processedFileCount} workbook(s) produced ${summary.sheetCount} CSV sheets and ${summary.totalRows.toLocaleString()} rows.`, 'success');
    if (summary.skippedFiles.length > 0) {
      appendJobLog(job, `${summary.skippedFiles.length} unreadable workbook(s) were skipped.`, 'error');
    }

    const zipStats = await fsp.stat(zipPath);
    appendJobLog(job, `Compressed ZIP ready (${(zipStats.size / 1024 / 1024).toFixed(2)} MB).`, 'success');
    scheduleJobCleanup(job);
  } catch (error) {
    await Promise.all(uploadedPaths.map(safeUnlink));
    job.status = 'failed';
    job.error = error.message || 'Internal server error';
    updateJob(job, `Unable to consolidate files: ${job.error}`, 0);
    appendJobLog(job, `Failed: ${job.error}`, 'error');
    console.error('Backend process error:', error);
    scheduleJobCleanup(job);
  }
}

async function processTransferJob(job, files) {
  const uploadedPaths = files.map(file => file.path).filter(Boolean);

  try {
    job.status = 'running';
    updateJob(job, `Starting Data Transfer...`, 2);
    appendJobLog(job, `Queued ${files.length} Calculation Engine(s) for data injection.`);

    const workingDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'reserves-transfer-'));
    job.workingDir = workingDir;

    let processedFileCount = 0;
    const skippedFiles = [];
    const zip = new JSZip();

    for (const [fileIndex, file] of files.entries()) {
      // Yield the event loop so the server can respond to status polls
      await new Promise(resolve => setTimeout(resolve, 10));

      try {
        updateJob(job, `Processing ${fileIndex + 1}/${files.length}: ${file.originalname}`, Math.round(((fileIndex + 1) / files.length) * 80));
        appendJobLog(job, `Reading ${file.originalname}...`);

        // Yield again so the status update is immediately available before the 20s blocking read
        await new Promise(resolve => setTimeout(resolve, 10));

        const isRi = file.fieldname === 'reinsuranceFiles';
        const matches = isRi ? job.riMatches : job.grossMatches;
        
        let lobName = null;
        if (matches) {
           const match = matches.find(m => m.fileName === file.originalname);
           if (match) lobName = match.lobName;
        }

        if (!lobName) {
           throw new Error('Could not determine LOB for this file from frontend matches.');
        }

        const outPath = path.join(workingDir, file.originalname);
        
        await new Promise((resolve, reject) => {
          const worker = new Worker(path.join(__dirname, 'transferWorker.js'), {
            workerData: {
              filePath: file.path,
              outPath,
              isRi,
              lobName,
              modelInput: job.modelInput,
              reserveData: job.reserveData
            }
          });
          
          worker.on('message', msg => {
            if (msg.success) {
              if (job.modelInput) appendJobLog(job, `Injected Modellinput data for LOB: ${lobName}`);
              if (job.reserveData) appendJobLog(job, `Injected Attritional IBNR into Close_Incremental...`);
              resolve();
            } else {
              reject(new Error(msg.error));
            }
          });
          
          worker.on('error', reject);
          worker.on('exit', code => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
          });
        });

        processedFileCount += 1;
        job.processedFileCount = processedFileCount;

        
        const folderPrefix = isRi ? 'RI/' : 'Gross/';
        zip.file(`${folderPrefix}${file.originalname}`, fs.createReadStream(outPath));

      } catch (error) {
        skippedFiles.push({ name: file.originalname, reason: error.message || 'Error' });
        appendJobLog(job, `Skipped ${file.originalname}: ${error.message}`, 'error');
      } finally {
        await safeUnlink(file.path);
      }
    }

    if (processedFileCount === 0) {
      throw new Error('No files were successfully processed.');
    }

    updateJob(job, 'Building compressed ZIP package...', 85);
    appendJobLog(job, 'Building compressed ZIP package...');

    const zipPath = path.join(workingDir, 'processed_transfer.zip');
    await new Promise((resolve, reject) => {
      zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } })
        .on('error', reject)
        .pipe(fs.createWriteStream(zipPath))
        .on('error', reject)
        .on('finish', resolve);
    });

    job.zipPath = zipPath;
    job.summary = {
      uploadedFileCount: files.length,
      processedFileCount,
      skippedFiles,
      sheetCount: 0,
      populatedSheetCount: 0,
      totalRows: 0,
      sheets: {}
    };
    job.status = 'completed';
    updateJob(job, 'Data Transfer completed successfully.', 100);
    appendJobLog(job, `${processedFileCount} calculation engine(s) were successfully updated.`, 'success');
    
    scheduleJobCleanup(job);
  } catch (error) {
    await Promise.all(uploadedPaths.map(safeUnlink));
    job.status = 'failed';
    job.error = error.message || 'Internal server error';
    updateJob(job, `Transfer failed: ${job.error}`, 0);
    appendJobLog(job, `Failed: ${job.error}`, 'error');
    scheduleJobCleanup(job);
  }
}


app.post('/api/process/uploads', (req, res) => {
  const expectedFileCount = Number(req.body?.expectedFileCount);
  if (!Number.isInteger(expectedFileCount) || expectedFileCount < 1 || expectedFileCount > MAX_FILES_PER_JOB) {
    return res.status(400).json({
      error: `Select between 1 and ${MAX_FILES_PER_JOB} workbooks for one processing job.`
    });
  }

  const stagedUpload = {
    id: randomUUID(),
    expectedFileCount,
    files: [],
    separateRi: req.body?.separateRi === true,
    portfolioId: req.body?.portfolioId || '',
    modelInput: req.body?.modelInput || null,
    reserveData: req.body?.reserveData || null,
    grossMatches: req.body?.grossMatches || null,
    riMatches: req.body?.riMatches || null,
    cleanupTimer: null,
    createdAt: new Date().toISOString()
  };

  stagedUploads.set(stagedUpload.id, stagedUpload);
  scheduleStagedUploadCleanup(stagedUpload);
  return res.status(201).json({
    uploadId: stagedUpload.id,
    expectedFileCount: stagedUpload.expectedFileCount,
    uploadedFileCount: 0
  });
});

app.post(
  '/api/process/uploads/:uploadId/files',
  loadStagedUpload,
  upload.any(),
  async (req, res, next) => {
    const files = req.files || [];

    try {
      if (files.length !== 1) {
        await Promise.all(files.map(file => safeUnlink(file.path)));
        return res.status(400).json({ error: 'Upload one workbook at a time.' });
      }

      const [file] = files;
      if (!['lobFiles', 'reinsuranceFiles'].includes(file.fieldname)) {
        await safeUnlink(file.path);
        return res.status(400).json({ error: 'The workbook upload category is invalid.' });
      }

      if (req.stagedUpload.files.length >= req.stagedUpload.expectedFileCount) {
        await safeUnlink(file.path);
        return res.status(409).json({ error: 'All expected workbooks have already been uploaded.' });
      }

      req.stagedUpload.files.push(file);
      scheduleStagedUploadCleanup(req.stagedUpload);
      return res.status(201).json({
        uploadedFileCount: req.stagedUpload.files.length,
        expectedFileCount: req.stagedUpload.expectedFileCount,
        fileName: file.originalname
      });
    } catch (error) {
      await Promise.all(files.map(file => safeUnlink(file.path)));
      return next(error);
    }
  }
);

app.  post('/api/process/uploads/:uploadId/start',
  loadStagedUpload,
  (req, res) => {
    const stagedUpload = req.stagedUpload;
    if (stagedUpload.files.length !== stagedUpload.expectedFileCount) {
      return res.status(409).json({
        error: `Uploaded ${stagedUpload.files.length} of ${stagedUpload.expectedFileCount} expected workbooks.`
      });
    }

    if (stagedUpload.cleanupTimer) clearTimeout(stagedUpload.cleanupTimer);
    stagedUploads.delete(stagedUpload.id);

    const job = createJob(stagedUpload.files.length);
    job.separateRi = stagedUpload.separateRi;
    job.portfolioId = stagedUpload.portfolioId || '';
    job.modelInput = stagedUpload.modelInput;
    job.reserveData = stagedUpload.reserveData;
    job.grossMatches = stagedUpload.grossMatches;
    job.riMatches = stagedUpload.riMatches;

    if (job.modelInput) {
      setImmediate(() => {
        processTransferJob(job, stagedUpload.files);
      });
    } else {
      setImmediate(() => {
        processJob(job, stagedUpload.files);
      });
    }

    return res.status(202).json({
      jobId: job.id,
      status: job.status,
      currentStatus: job.currentStatus,
      progressPercent: job.progressPercent
    });
  }
);

app.delete(
  '/api/process/uploads/:uploadId',
  loadStagedUpload,
  async (req, res, next) => {
    try {
      await cleanupStagedUpload(req.params.uploadId);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  }
);

app.post('/api/process', upload.any(), (req, res) => {
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: 'Please upload at least one XLSX or XLSB file.' });
  }

  const job = createJob(files.length);
  job.separateRi = req.body.separateRi === 'true';
  job.portfolioId = req.body.portfolioId || '';

  if (req.body.modelInput) {
    job.modelInput = JSON.parse(req.body.modelInput);
    job.reserveData = req.body.reserveData ? JSON.parse(req.body.reserveData) : null;
    job.grossMatches = req.body.grossMatches ? JSON.parse(req.body.grossMatches) : null;
    job.riMatches = req.body.riMatches ? JSON.parse(req.body.riMatches) : null;
    
    setImmediate(() => {
      processTransferJob(job, files);
    });
  } else {
    setImmediate(() => {
      processJob(job, files);
    });
  }

  return res.status(202).json({
    jobId: job.id,
    status: job.status,
    currentStatus: job.currentStatus,
    progressPercent: job.progressPercent
  });
});

app.post('/api/process/revised-composite', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a FINCON Report Excel file.' });
  }

  try {
    const finconPath = req.file.path;
    const templatePath = path.join(__dirname, 'templates', 'Revised Composite Template.xlsx');
    const outputPath = path.join(os.tmpdir(), `Revised_Composite_${Date.now()}.xlsx`);

    const rates = {
      USD: req.body.usdRate || 0,
      GBP: req.body.gbpRate || 0,
      EUR: req.body.eurRate || 0
    };

    let sheetMapping = {};
    if (req.body.sheetMapping) {
      try {
        sheetMapping = JSON.parse(req.body.sheetMapping);
      } catch (e) {
        console.warn('Invalid sheetMapping JSON');
      }
    }

    const result = await processRevisedComposite(finconPath, templatePath, outputPath, rates, sheetMapping);

    const downloadId = Date.now().toString();
    processingJobs.set(downloadId, {
      outputPath,
      finconPath,
      type: 'revised-composite',
      fileName: result.fileName || 'Revised_Composite.xlsx'
    });

    res.json({
      summary: result,
      downloadId
    });
  } catch (error) {
    console.error('Revised composite processing error:', error);
    res.status(500).json({ error: 'Failed to process revised composite.' });
  }
});

app.get('/api/process/download-composite/:id', (req, res) => {
  const job = processingJobs.get(req.params.id);
  if (!job || job.type !== 'revised-composite') {
    return res.status(404).json({ error: 'Download not found or expired.' });
  }

  res.download(job.outputPath, job.fileName || 'Revised_Composite.xlsx', (err) => {
    if (err) console.error('Error downloading revised composite:', err);
    // Cleanup
    fs.unlink(job.finconPath, () => {});
    fs.unlink(job.outputPath, () => {});
    processingJobs.delete(req.params.id);
  });
});

app.post('/api/process/data-sorting', upload.fields([
  { name: 'fincon', maxCount: 1 },
  { name: 'currentMonth', maxCount: 1 },
  { name: 'previousMonth', maxCount: 1 }
]), async (req, res) => {
  if (!req.files || !req.files.fincon || !req.files.currentMonth || !req.files.previousMonth) {
    return res.status(400).json({ error: 'Please upload all three required files: Fincon, Current Month, and Previous Month.' });
  }

  try {
    const finconPath = req.files.fincon[0].path;
    const currentMonthPath = req.files.currentMonth[0].path;
    const previousMonthPath = req.files.previousMonth[0].path;

    const templatePath = path.join(__dirname, 'templates', 'DataSorting.xlsx');
    const outputPath = path.join(os.tmpdir(), `Data_Sorting_${Date.now()}.xlsx`);

    const result = await processDataSorting(currentMonthPath, previousMonthPath, finconPath, templatePath, outputPath);

    const downloadId = Date.now().toString();
    processingJobs.set(downloadId, {
      outputPath,
      finconPath,
      currentMonthPath,
      previousMonthPath,
      type: 'data-sorting',
      fileName: result.fileName || 'Data_Sorting.xlsx'
    });

    res.json({
      summary: result,
      downloadId
    });
  } catch (error) {
    console.error('Data sorting processing error:', error);
    res.status(500).json({ error: 'Failed to process data sorting.' });
  }
});

app.get('/api/process/download-data-sorting/:id', (req, res) => {
  const job = processingJobs.get(req.params.id);
  if (!job || job.type !== 'data-sorting') {
    return res.status(404).json({ error: 'Download not found or expired.' });
  }

  res.download(job.outputPath, job.fileName || 'Data_Sorting.xlsx', (err) => {
    if (err) console.error('Error downloading data sorting file:', err);
    // Cleanup
    fs.unlink(job.finconPath, () => {});
    fs.unlink(job.currentMonthPath, () => {});
    fs.unlink(job.previousMonthPath, () => {});
    fs.unlink(job.outputPath, () => {});
    processingJobs.delete(req.params.id);
  });
});

app.get('/api/process/:jobId/status', (req, res) => {
  const job = processingJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Processing job not found or expired.' });
  }

  return res.json({
    jobId: job.id,
    status: job.status,
    currentStatus: job.currentStatus,
    progressPercent: job.progressPercent,
    processedFileCount: job.processedFileCount,
    uploadedFileCount: job.uploadedFileCount,
    logs: job.logs,
    summary: job.summary,
    error: job.error
  });
});

app.get('/api/process/:jobId/download', (req, res) => {
  const job = processingJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Processing job not found or expired.' });
  }

  if (job.status !== 'completed' || !job.zipPath || !job.summary) {
    return res.status(409).json({ error: 'Processing job is not ready for download yet.' });
  }

  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="processed_sheets.zip"',
    'X-Processing-Summary': Buffer.from(JSON.stringify(job.summary)).toString('base64url')
  });

  const zipStream = fs.createReadStream(job.zipPath);
  zipStream.on('error', error => {
    console.error('ZIP stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream ZIP file.' });
    } else {
      res.destroy(error);
    }
  });

  zipStream.pipe(res);
});

app.post('/api/help-chat', async (req, res, next) => {
  try {
    if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
      return res.status(503).json({
        error: 'The Help Desk assistant is not configured. Set AI_GATEWAY_API_KEY on the backend server.'
      });
    }

    const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'At least one chat message is required.' });
    }

    const { convertToModelMessages, streamText } = await import('ai');
    const modelMessages = await convertToModelMessages(messages.slice(-30));
    const result = streamText({
      model: process.env.HELP_DESK_MODEL || 'openai/gpt-5.4',
      system: HELP_DESK_SYSTEM_PROMPT,
      messages: modelMessages,
      temperature: 0.2
    });

    return result.pipeUIMessageStreamToResponse(res, {
      onError: error => {
        console.error('Help Desk assistant error:', error);
        return 'The Help Desk assistant could not complete that response. Please try again or share the error with support.';
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Each workbook must be 50 MB or smaller.' });
  }
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400;
  const message = statusCode >= 500 ? 'The service is temporarily unavailable.' : (error.message || 'Request failed.');
  return res.status(statusCode).json({ error: message });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server is running on port ${PORT}`);
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing backend before starting another one.`);
    process.exit(1);
  }
  throw error;
});
