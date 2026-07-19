const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Helper to parse dates like "30/06/2026" (DMY) or anything Excel gives
const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  // If it's a string, attempt to parse DD/MM/YYYY
  if (typeof val === 'string') {
    const parts = val.split(/[-/]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      // Determine if it was actually YYYY-MM-DD
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      return new Date(year, month, day);
    }
    return new Date(val); // fallback
  }
  // Excel serial date fallback
  if (typeof val === 'number') {
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  return null;
};

// Helper to clean column strings (mimicking the R clean_column)
const cleanString = (val) => {
  if (typeof val === 'string') {
    return val.trim().replace(/\s+/g, ' '); // Trim and replace multiple spaces
  }
  return val;
};

async function processDataSorting(currentMonthPath, previousMonthPath, finconPath, templatePath, outputPath) {
  // Read Data
  const currentMonthWb = XLSX.readFile(currentMonthPath, { cellDates: true });
  let currentData = XLSX.utils.sheet_to_json(currentMonthWb.Sheets[currentMonthWb.SheetNames[0]], { raw: true });

  const previousMonthWb = XLSX.readFile(previousMonthPath, { cellDates: true });
  let previousData = XLSX.utils.sheet_to_json(previousMonthWb.Sheets[previousMonthWb.SheetNames[0]], { raw: true });

  const finconWb = XLSX.readFile(finconPath, { cellDates: true });
  
  const templateWb = new ExcelJS.Workbook();
  await templateWb.xlsx.readFile(templatePath);

  // Helper to extract specific columns
  const extractCols = (data, cols) => data.map(row => cols.map(col => row[col] !== undefined ? row[col] : null));

  // Helper to write data to ExcelJS
  const writeDataToSheet = (sheetName, dataRows, startRow = 2, startCol = 1, append = false) => {
    let sheet = templateWb.getWorksheet(sheetName);
    if (!sheet && append) {
      sheet = templateWb.addWorksheet(sheetName);
    }
    if (!sheet) return;
    
    dataRows.forEach((row, rIdx) => {
      row.forEach((val, cIdx) => {
        if (val !== null && val !== undefined) {
          sheet.getCell(startRow + rIdx, startCol + cIdx).value = val;
        }
      });
    });
  };

  // Clean strings
  currentData = currentData.map(row => {
    const cleaned = {};
    for (const [key, val] of Object.entries(row)) {
      cleaned[key.trim()] = cleanString(val);
    }
    return cleaned;
  });

  previousData = previousData.map(row => {
    const cleaned = {};
    for (const [key, val] of Object.entries(row)) {
      cleaned[key.trim()] = cleanString(val);
    }
    return cleaned;
  });

  // Calculate Date and Month
  let reportDate = new Date(); // fallback
  // Use the REGISTRATN_DT from the first row of currentData to determine the target month
  if (currentData.length > 0) {
    const firstDate = parseDate(currentData[0]['REGISTRATN_DT']);
    if (firstDate) {
      reportDate = firstDate;
    }
  }
  const targetMonth = reportDate.getMonth();

  // Filter current data for the report month and split PRODUCT_NAME
  currentData = currentData.filter(row => {
    const regDt = parseDate(row['REGISTRATN_DT']);
    return regDt && regDt.getMonth() === targetMonth;
  }).map(row => {
    const prodName = row['PRODUCT_NAME'] || '';
    const parts = prodName.split('\\');
    row['CLASS'] = parts[0] ? parts[0].trim() : '';
    row['PRODUCT_NAME_CLEAN'] = parts[1] ? parts.slice(1).join('\\').trim() : '';
    return row;
  });

  // Discrepancy Checking
  const currentPremiumByMonth = {};
  currentData.forEach(row => {
    const dt = parseDate(row['REGISTRATN_DT']);
    if (dt) {
      const m = dt.getMonth();
      const p = parseFloat(row['PREMIUM']) || 0;
      currentPremiumByMonth[m] = (currentPremiumByMonth[m] || 0) + p;
    }
  });

  const previousPremiumByMonth = {};
  previousData.forEach(row => {
    const dt = parseDate(row['REGISTRATN_DT']);
    if (dt) {
      const m = dt.getMonth();
      const p = parseFloat(row['PREMIUM']) || 0;
      previousPremiumByMonth[m] = (previousPremiumByMonth[m] || 0) + p;
    }
  });

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const discrepancies = [];
  let totalDiscrepancyAmount = 0;
  for (let m = 0; m <= 11; m++) {
    const cm = currentPremiumByMonth[m] || 0;
    const pm = previousPremiumByMonth[m] || 0;
    const diff = pm - cm;
    if (Math.abs(diff) > 0.01) {
      totalDiscrepancyAmount += diff;
      discrepancies.push({
        month: monthNames[m],
        previousPremium: pm,
        currentPremium: cm,
        difference: diff
      });
    }
  }

  // Generate epData
  const epDataCols1 = ['POLICYKEY', 'START_DATE', 'END_DATE', 'PREMIUM', 'COMM'];
  const epDataCols2 = ['CLASS', 'UW_YEAR', 'REGISTRATN_DT'];
  const epData = currentData.map(row => {
    const p1 = epDataCols1.map(col => row[col]);
    p1.push(''); // UW_UNEXPIRED_PREM
    p1.push(''); // UW_UNEXPIRED_COMM
    p1.push(''); // SBU
    const p2 = epDataCols2.map(col => row[col]);
    return [...p1, ...p2];
  });
  
  // Headers for epData: POLICY_KEY, START_DATE, END_DATE, PREMIUM, COMM, UW_UNEXPIRED_PREM, UW_UNEXPIRED_COMM, SBU, CLASS, UW_YEAR, REGISTRATN_DT
  writeDataToSheet('epData', [['POLICY_KEY', 'START_DATE', 'END_DATE', 'PREMIUM', 'COMM', 'UW_UNEXPIRED_PREM', 'UW_UNEXPIRED_COMM', 'SBU', 'CLASS', 'UW_YEAR', 'REGISTRATN_DT']], 1, 1);
  writeDataToSheet('epData', epData, 2, 1);

  // Generate EpData_DB
  const secondEpDataCols1 = ['TRANSACTION_TYPE', 'POLICYNO', 'POLICYKEY', 'CLASS', 'PRODUCT_NAME_CLEAN', 'POLICY_ID', 'CUSTOMER_NO', 'CUSTOMER_NAME', 'ACCOUNT_TYPE', 'PREMIUM', 'SUM_INSURED', 'COMM', 'START_DATE', 'END_DATE', 'REGISTRATN_DT', 'SBU_CODE', 'SBU', 'OFFICE'];
  const secondEpDataCols2 = ['SUB_AGENT', 'UW_YEAR'];
  const epDataDbHeaders = ['TRANSACTION_TYPE', 'POLICYNO', 'POLICYKEY', 'CLASS', 'PRODUCT_NAME', 'POLICY_ID', 'CUSTOMER_NO', 'CUSTOMER_NAME', 'CUST_TYPE', 'PREMIUM', 'SUM_INSURED', 'COMM', 'START_DATE', 'END_DATE', 'REGISTRATN_DT', 'SBU_CODE', 'SBU', 'OFFICE', 'AGENT_NAME', 'SUB_AGENT', 'UW_YEAR'];
  
  const epDataDb = currentData.map(row => {
    const p1 = secondEpDataCols1.map(col => row[col]);
    p1.push(''); // AGENT_NAME
    const p2 = secondEpDataCols2.map(col => row[col]);
    return [...p1, ...p2];
  });

  const epDataDbSheet = templateWb.addWorksheet('EpData_DB');
  writeDataToSheet('EpData_DB', [epDataDbHeaders], 1, 1, true);
  writeDataToSheet('EpData_DB', epDataDb, 2, 1, true);

  // FINCON PROCESSING

  const getFinconSheet = (nameContains) => {
    const sheetName = finconWb.SheetNames.find(s => s.toLowerCase().includes(nameContains.toLowerCase()));
    if (!sheetName) return [];
    const data = XLSX.utils.sheet_to_json(finconWb.Sheets[sheetName], { raw: true, defval: null });
    return data.map(row => {
      const cleanRow = {};
      for (const [key, value] of Object.entries(row)) {
        cleanRow[key.trim()] = cleanString(value);
      }
      return cleanRow;
    });
  };

  const osNaira = getFinconSheet('Outstanding Claims All');
  const osFx = getFinconSheet('Outstanding Claims FX');
  
  const monthName = reportDate.toLocaleString('default', { month: 'long' });
  const yearStr = reportDate.getFullYear();
  const claimsPaidName = `Claims Paid ${monthName} ${yearStr} only`;
  const cpMonth = getFinconSheet(claimsPaidName) || getFinconSheet('Claims Paid');

  // osFx formatting
  if (osFx.length > 0) {
    const osFxCols = ['BRANCH', 'OFFICE', 'CLASS', 'PRODUCT_NAME', 'AXA PRODUCT', 'Attritional', 'CLM_KEY', 'POLICY_KEY', 'CUST_NO', 'CUST_NAME', 'CUST TYPE', 'CUST COUNTRY', 'AGENT_NO', 'AGENT_NAME', 'Currency', 'RESERVE_AMOUNT', 'PAID_AMOUNT', 'OS_AMOUNT', 'PREMIUM', 'SUM_INSURED', 'START_DT', 'END_DT', 'LOSS_DT', 'NOTIFICN_DT', 'REG_DT', 'HOLDING_DAYS', 'EVENT_DESC', 'CLAIM_STATUS', 'LOSS TYPE', 'RJECTION REASON', 'SENSITIVE LAIMS', 'ADJUSTER NAME', 'DRIVER NAME', 'COMMENT OS', 'EXCESS DESC', 'EXCESS1', 'EXCESS2', 'EXCESS3'];
    const osFxMapped = osFx.map(row => {
      const unique = `${row['CLM_KEY']}-${row['CUST_NAME']}-${row['POLICY_KEY']}`;
      return [unique, ...osFxCols.map(c => row[c])];
    });
    writeDataToSheet('Outstanding Claims - Foreign', osFxMapped, 2, 1);
  }

  // cpdb
  const cpdbCols = ["Branch", "Office", "Class", "Sub Class", "AXA PRODUCT", "Attritional", "Pol No", "Policy_id", "Policy Start Date", "Policy End Date", "Insured name", "Cust Type", "Cust Country", "Cust Category", "AGENT name", "SBU", "SBU PCNT", "Plate No", "Chasis No", "Claim No", "Claim Year", "Accident Date", "Reg Date", "Notif Date", "HOLDING_DAYS", "Loss Adjuster", "Loss Details", "Loss Nature", "Place of Loss - Area", "Place of Loss - LGA", "Pay/Rec Slip No", "Pay/Rec Slip Date", "Cuurency", "Last Reserve", "Paid Amount", "Payment_Type", "Paid To", "Remarks", "USER NAME", "Claims Status", "Policy Remarks", "Car Type", "Car Model", "Car Year", "Age", "Gender", "State", "Occupation", "RJECTION REASON", "DAMAGE ITEMS", "SENSITIVE LAIMS", "EXCESS DESC", "EXCESS1", "EXCESS2"];
  const cpdb = extractCols(cpMonth, cpdbCols);
  templateWb.addWorksheet('Claims_Paid');
  writeDataToSheet('Claims_Paid', [cpdbCols], 1, 1, true);
  writeDataToSheet('Claims_Paid', cpdb, 2, 1, true);

  // cpr (ClaimsPaidReserving)
  const cprCols = ["Class", "Claim No", "Insured name", "AXA PRODUCT", "Pol No", "Cust Category", "Loss Details", "Loss Nature", "Accident Date","Notif Date", "Reg Date", "Pay/Rec Slip Date", "SBU", "Paid Amount"];
  const cprHeaders = ["Class", "Claim No", "Insured name", "PRODUCT_NAME", "Pol No", "Cust Type", "Loss Details", "LOSS_NATURE", "Accident Date","Notif Date", "Reg Date", "Pay/Rec Slip Date", "SBU", "Paid Amount"];
  const cpr = extractCols(cpMonth, cprCols);
  templateWb.addWorksheet('ClaimsPaidReserving');
  writeDataToSheet('ClaimsPaidReserving', [cprHeaders], 1, 1, true);
  writeDataToSheet('ClaimsPaidReserving', cpr, 2, 1, true);

  // osngx
  const osngxCols = ["BRANCH", "OFFICE", "CLASS", "PRODUCT_NAME", "AXA PRODUCT", "CLM_KEY", "POLICY_KEY"];
  const osngx = extractCols(osNaira, osngxCols);
  const osngx1Cols = ["CUST_NO", "CUST_NAME", "CUST TYPE", "CUST COUNTRY", "AGENT_NO", "AGENT_NAME", "Currency", "RESERVE_AMOUNT", "PAID_AMOUNT", "OS_AMOUNT","PREMIUM", "SUM_INSURED", "START_DT", "END_DT", "LOSS_DT", "NOTIFICN_DT", "REG_DT", "EVENT_DESC", "CLAIM_STATUS", "LOSS TYPE", "RJECTION REASON", "SENSITIVE LAIMS", "ADJUSTER NAME", "EXCESS DESC", "EXCESS1", "EXCESS2"];
  const osngx1Headers = ["CUST_NO", "CUST_NAME", "CUST TYPE", "CUST COUNTRY", "AGENT_NO", "AGENT_NAME", "Currency", "RESERVE", "AMOUNT_PAID", "AMT_OUTSTANDING","PREMIUM", "SUM_INSURED", "START_DT", "END_DT", "LOSS_DT", "NOTIFICN_DT", "REG_DT", "EVENT_DESC", "CLAIM_STATUS", "LOSS TYPE", "RJECTION REASON", "SENSITIVE LAIMS", "ADJUSTER NAME", "EXCESS DESC", "EXCESS1", "EXCESS2"];
  const osngx1 = extractCols(osNaira, osngx1Cols);
  
  templateWb.addWorksheet('OsNaira');
  writeDataToSheet('OsNaira', [osngxCols], 1, 1, true);
  writeDataToSheet('OsNaira', osngx, 2, 1, true);
  writeDataToSheet('OsNaira', [osngx1Headers], 1, 11, true); // startCol = 11 for second part
  writeDataToSheet('OsNaira', osngx1, 2, 11, true);

  // osFxDB
  const osfxdbCols = ["BRANCH", "OFFICE", "CLASS", "PRODUCT_NAME", "AXA PRODUCT", "Attritional", "CLM_KEY", "POLICY_KEY"];
  const osfxdb = extractCols(osFx, osfxdbCols);
  const osfxdb1Cols = ["CUST_NO", "CUST_NAME", "CUST TYPE", "CUST COUNTRY", "AGENT_NO", "AGENT_NAME", "Currency", "RESERVE_AMOUNT", "PAID_AMOUNT", "OS_AMOUNT", "PREMIUM", "SUM_INSURED", "START_DT", "END_DT", "LOSS_DT", "NOTIFICN_DT", "REG_DT", "HOLDING_DAYS", "EVENT_DESC", "CLAIM_STATUS", "LOSS TYPE", "RJECTION REASON", "SENSITIVE LAIMS", "ADJUSTER NAME", "EXCESS DESC", "EXCESS1", "EXCESS2"];
  const osfxdb1 = extractCols(osFx, osfxdb1Cols);

  templateWb.addWorksheet('OsFx');
  writeDataToSheet('OsFx', [osfxdbCols], 1, 1, true);
  writeDataToSheet('OsFx', osfxdb, 2, 1, true);
  writeDataToSheet('OsFx', [osfxdb1Cols], 1, 10, true); // startCol = 10
  writeDataToSheet('OsFx', osfxdb1, 2, 10, true);

  // Save Workbook
  await templateWb.xlsx.writeFile(outputPath);

  const formattedFileName = `DATA SORTING ${monthName.toUpperCase()} ${yearStr}.xlsx`;

  return {
    discrepancies,
    totalDiscrepancyAmount,
    hasDiscrepancies: discrepancies.length > 0,
    fileName: formattedFileName,
    reportDate: reportDate.toISOString()
  };
}

module.exports = { processDataSorting };
