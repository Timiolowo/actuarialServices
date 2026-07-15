const { parentPort, workerData } = require('worker_threads');
const XLSX = require('xlsx');

try {
  const { filePath, outPath, isRi, lobName, modelInput, reserveData } = workerData;

  const workbook = XLSX.readFile(filePath, {
    cellStyles: true,
    cellFormula: true,
    cellNF: true
  });

  if (modelInput && workbook.SheetNames.includes('Modellinput')) {
    const modelSheet = workbook.Sheets['Modellinput'];
    const dataList = isRi ? modelInput.riData : modelInput.grossData;
    const lobRecord = dataList.find(d => Object.values(d).includes(lobName) || Object.values(d).some(v => typeof v === 'string' && v.includes(lobName)));
    
    if (lobRecord) {
      XLSX.utils.sheet_add_json(modelSheet, [lobRecord], { skipHeader: true, origin: 'A9' });
    }
  }

  if (reserveData && workbook.SheetNames.includes('Close_Incremental')) {
    const closeSheet = workbook.Sheets['Close_Incremental'];
    const reserveLob = reserveData.gross.find(l => l.lobName === lobName);
    if (reserveLob) {
      XLSX.utils.sheet_add_aoa(closeSheet, [[reserveLob.attrIBNR]], { origin: 'EX9' });
    }
  }

  XLSX.writeFile(workbook, outPath, { bookType: 'xlsb' });
  
  parentPort.postMessage({ success: true });
} catch (error) {
  parentPort.postMessage({ success: false, error: error.message });
}
