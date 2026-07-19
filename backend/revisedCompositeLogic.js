const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function processRevisedComposite(finconFilePath, templateFilePath, outputFilePath, rates, sheetMapping = {}) {
  const finconWb = XLSX.readFile(finconFilePath, { cellDates: true });
  
  const templateWb = new ExcelJS.Workbook();
  await templateWb.xlsx.readFile(templateFilePath);

  const getSheetData = (sheetKey) => {
    const sheetName = sheetMapping[sheetKey];
    if (!sheetName || !finconWb.Sheets[sheetName]) return [];
    const rawData = XLSX.utils.sheet_to_json(finconWb.Sheets[sheetName], { raw: true, defval: null });
    return rawData.map(row => {
      const cleanRow = {};
      for (const [key, value] of Object.entries(row)) {
        cleanRow[key.trim()] = value;
      }
      return cleanRow;
    });
  };

  const osAll = getSheetData('osAll');
  const osAllSbu = getSheetData('osAllSbu');
  const osFx = getSheetData('osFx');
  const osFxSbu = getSheetData('osFxSbu');
  const cpMonth = getSheetData('cpMonth');
  const cpYtd = getSheetData('cpYtd');

  // Helper to extract specific columns
  const extractCols = (data, cols) => data.map(row => cols.map(col => row[col] !== undefined ? row[col] : null));

  // Helper to write data to ExcelJS preserving formatting
  const writeDataToSheet = (sheetName, dataRows, startRow = 2, startCol = 1) => {
    const sheet = templateWb.getWorksheet(sheetName);
    if (!sheet) return;
    
    dataRows.forEach((row, rIdx) => {
      row.forEach((val, cIdx) => {
        if (val !== null && val !== undefined) {
          // Use 1-based indexing for rows and columns in exceljs
          sheet.getCell(startRow + rIdx, startCol + cIdx).value = val;
        }
      });
    });
  };

  // 1. Outstanding Claims - Naira
  if (templateWb.getWorksheet('Outstanding Claims - Naira')) {
    const sheetName = 'Outstanding Claims - Naira';
    
    // osNaira1: cols A (1)
    const osNaira1Cols = ['BRANCH', 'OFFICE', 'CLASS', 'AXA PRODUCT', 'Attritional', 'CLM_KEY', 'CUST_NAME', 'PRODUCT_NAME', 'POLICY_KEY', 'CUST TYPE'];
    const osNaira1 = extractCols(osAll, osNaira1Cols);
    writeDataToSheet(sheetName, osNaira1, 2, 1);

    // osNaira2: cols L (12)
    const osNaira2 = osAll.map(row => [
      row['EVENT_DESC'] !== undefined ? row['EVENT_DESC'] : null,
      row['LOSS_DT'] !== undefined ? row['LOSS_DT'] : null,
      row['LOSS_DT'] ? new Date(row['LOSS_DT']).getFullYear() : null // LOSS_YEAR
    ]);
    writeDataToSheet(sheetName, osNaira2, 2, 12);

    // osNaira3: cols O (15)
    const osNaira3Cols = ['NOTIFICN_DT', 'REG_DT', 'CUST_NO', 'CUST COUNTRY', 'AGENT_NO', 'AGENT_NAME', 'Currency', 'RESERVE_AMOUNT', 'PAID_AMOUNT', 'OS_AMOUNT', 'PREMIUM', 'SUM_INSURED', 'START_DT', 'END_DT', 'HOLDING_DAYS', 'CLAIM_STATUS', 'LOSS TYPE', 'RJECTION REASON', 'SENSITIVE LAIMS', 'ADJUSTER NAME', 'DRIVER NAME', 'COMMENT OS', 'EXCESS DESC', 'EXCESS1', 'EXCESS2', 'EXCESS3'];
    const osNaira3 = extractCols(osAll, osNaira3Cols);
    writeDataToSheet(sheetName, osNaira3, 2, 15);

    // Exchange Rates at AX1 (col 50)
    const rateData = [
      ['USD', Number(rates.USD) || 0],
      ['POUND STERLING', Number(rates.GBP) || 0],
      ['EURO', Number(rates.EUR) || 0]
    ];
    writeDataToSheet(sheetName, rateData, 1, 50);
  }

  // 2. Outstanding Claims All (SBU)
  if (templateWb.getWorksheet('Outstanding Claims All (SBU)')) {
    const keys = osAllSbu.length > 0 ? Object.keys(osAllSbu[0]) : [];
    const data = extractCols(osAllSbu, keys);
    writeDataToSheet('Outstanding Claims All (SBU)', data, 2, 1);
  }

  // 3. Outstanding Claims - Foreign
  if (templateWb.getWorksheet('Outstanding Claims - Foreign')) {
    const fxCols = ['BRANCH', 'OFFICE', 'CLASS', 'PRODUCT_NAME', 'AXA PRODUCT', 'Attritional', 'CLM_KEY', 'POLICY_KEY', 'CUST_NO', 'CUST_NAME', 'CUST TYPE', 'CUST COUNTRY', 'AGENT_NO', 'AGENT_NAME', 'Currency', 'RESERVE_AMOUNT', 'PAID_AMOUNT', 'OS_AMOUNT', 'PREMIUM', 'SUM_INSURED', 'START_DT', 'END_DT', 'LOSS_DT', 'NOTIFICN_DT', 'REG_DT', 'HOLDING_DAYS', 'EVENT_DESC', 'CLAIM_STATUS', 'LOSS TYPE', 'RJECTION REASON', 'SENSITIVE LAIMS', 'ADJUSTER NAME', 'DRIVER NAME', 'COMMENT OS', 'EXCESS DESC', 'EXCESS1', 'EXCESS2', 'EXCESS3'];
    const data = osFx.map(row => {
      const unique = `${row['CLM_KEY']}-${row['CUST_NAME']}-${row['POLICY_KEY']}`;
      const mapped = fxCols.map(col => row[col] !== undefined ? row[col] : null);
      return [unique, ...mapped];
    });
    writeDataToSheet('Outstanding Claims - Foreign', data, 2, 1);
  }

  // 4. Outstanding Claims Foreign(SBU)
  if (templateWb.getWorksheet('Outstanding Claims Foreign(SBU)')) {
    const keys = osFxSbu.length > 0 ? Object.keys(osFxSbu[0]) : [];
    const data = extractCols(osFxSbu, keys);
    writeDataToSheet('Outstanding Claims Foreign(SBU)', data, 2, 1);
  }

  // 5. Claims Paid - Month Only
  if (templateWb.getWorksheet('Claims Paid - Month Only')) {
    const cpMonthCols = ['Claim No', 'Insured name', 'AXA PRODUCT', 'Pol No', 'Cust Category', 'Loss Details', 'Loss Nature', 'Accident Date', 'Notif Date', 'Reg Date', 'Pay/Rec Slip Date', 'SBU', 'Paid Amount', 'Branch', 'Office', 'Class', 'Sub Class', 'Attritional', 'Policy_id', 'Policy Start Date', 'Policy End Date', 'Cust Type', 'Cust Country', 'AGENT name', 'SBU PCNT', 'Plate No', 'Chasis No', 'Claim Year', 'HOLDING_DAYS', 'Loss Adjuster', 'Place of Loss - Area', 'Place of Loss - LGA', 'Pay/Rec Slip No', 'Cuurency', 'Last Reserve', 'Payment_Type', 'Paid To', 'Remarks', 'USER NAME', 'Claims Status', 'Policy Remarks', 'Car Type', 'Car Model', 'Car Year', 'Age', 'Gender', 'State', 'Occupation', 'RJECTION REASON', 'DAMAGE ITEMS', 'SENSITIVE LAIMS', 'DRIVER NAME', 'EXCESS DESC', 'EXCESS1', 'EXCESS2'];
    const data = extractCols(cpMonth, cpMonthCols);
    writeDataToSheet('Claims Paid - Month Only', data, 2, 1);
  }

  // 6. Claims Paid - YTD
  if (templateWb.getWorksheet('Claims Paid - YTD')) {
    const cpYtdCols = ['Branch', 'Office', 'Class', 'Sub Class', 'AXA PRODUCT', 'NACE CODE', 'NACE DESC', 'Attritional', 'Pol No', 'Policy_id', 'Policy Start Date', 'Policy End Date', 'Insured name', 'Cust Type', 'Cust Country', 'Cust Category', 'AGENT name', 'SBU', 'SBU PCNT', 'Plate No', 'Chasis No', 'Claim No', 'Claim Year', 'Accident Date', 'Reg Date', 'Notif Date', 'HOLDING_DAYS', 'Loss Adjuster', 'Loss Details', 'Loss Nature', 'Place of Loss - Area', 'Place of Loss - LGA', 'Pay/Rec Slip No', 'Pay/Rec Slip Date', 'Cuurency', 'Last Reserve', 'Paid Amount', 'Payment_Type', 'Paid To', 'Remarks', 'USER NAME', 'Claims Status', 'Policy Remarks', 'Car Type', 'Car Model', 'Car Year', 'Age', 'Gender', 'State', 'Occupation', 'RJECTION REASON', 'DAMAGE ITEMS', 'SENSITIVE LAIMS', 'DRIVER NAME', 'EXCESS DESC', 'EXCESS1', 'EXCESS2'];
    const data = extractCols(cpYtd, cpYtdCols);
    writeDataToSheet('Claims Paid - YTD', data, 2, 1);
  }

  // 7. Paid Model Data
  if (templateWb.getWorksheet('Paid Model Data')) {
    const cpModelCols = ['Claim No', 'Insured name', 'Sub Class', 'Pol No', 'Cust Category', 'Loss Details', 'Loss Nature', 'Accident Date', 'Notif Date', 'Reg Date', 'Pay/Rec Slip Date', 'SBU', 'Paid Amount', 'Class'];
    const data = extractCols(cpYtd, cpModelCols);
    writeDataToSheet('Paid Model Data', data, 2, 1);
  }

  // 8. OSC Currency Conversion & OS Model Data / HY_OSModel
  const fxMap = {};
  for (const row of osFx) {
    const unique = `${row['CLM_KEY']}-${row['CUST_NAME']}-${row['POLICY_KEY']}`;
    fxMap[unique] = {
      Currency: row['Currency'],
      fx_Amount: row['OS_AMOUNT'] // AMT_OUTSTANDING is OS_AMOUNT in Fincon
    };
  }

  const parseAmt = (val) => {
    if (val == null) return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  // Clean outstanding from osAll
  let modelOutstanding = [];
  for (const row of osAll) {
    const unique = `${row['CLM_KEY']}-${row['CUST_NAME']}-${row['POLICY_KEY']}`;
    let currency = fxMap[unique] ? fxMap[unique].Currency : 'Naira';
    let fxAmount = fxMap[unique] ? fxMap[unique].fx_Amount : 1;
    if (fxMap[unique] === undefined) {
      currency = 'Naira';
      fxAmount = 1;
    }

    let item = {
      CLM_KEY: row['CLM_KEY'],
      CUST_NAME: row['CUST_NAME'],
      PRODUCT_NAME: row['PRODUCT_NAME'],
      POLICY_KEY: row['POLICY_KEY'],
      'CUST TYPE': row['CUST TYPE'],
      AMT_OUTSTANDING: parseAmt(row['OS_AMOUNT']),
      EVENT_DESC: row['EVENT_DESC'],
      LOSS_DT: row['LOSS_DT'],
      NOTIFICN_DT: row['NOTIFICN_DT'],
      REG_DT: row['REG_DT'],
      SBU: row['SBU'],
      CLAIM_STATUS: row['CLAIM_STATUS'],
      CLASS: row['CLASS'],
      Amount: parseAmt(row['OS_AMOUNT']),
      Currency: currency,
      fx_Amount: parseAmt(fxAmount),
      Unique: unique,
      RESERVE: parseAmt(row['RESERVE_AMOUNT']),
      AMOUNT_PAID: parseAmt(row['PAID_AMOUNT'])
    };
    modelOutstanding.push(item);
  }

  // Split specific policies
  const splitPolicies = ['OIG7-20/L/C', 'CAR8-21/L/C'];
  let cJoin = [];
  modelOutstanding = modelOutstanding.filter(row => {
    if (splitPolicies.includes(row.CLM_KEY)) {
      const p1 = { ...row, AMT_OUTSTANDING: 6000000, fx_Amount: 0, Currency: 'Naira' };
      const p1a = { ...row, AMT_OUTSTANDING: row.AMT_OUTSTANDING - 6000000 };
      cJoin.push(p1, p1a);
      return false; // remove from original
    }
    return true;
  });

  modelOutstanding = [...modelOutstanding, ...cJoin];

  // Apply rates
  modelOutstanding.forEach(row => {
    let rate = null;
    if (row.Currency && row.Currency.includes('Dollar')) rate = Number(rates.USD);
    else if (row.Currency && row.Currency.includes('Pound')) rate = Number(rates.GBP);
    else if (row.Currency && row.Currency.includes('Euro')) rate = Number(rates.EUR);
    else if (row.Currency === 'U.S Dollars') rate = Number(rates.USD);
    else if (row.Currency === 'Pound Sterling') rate = Number(rates.GBP);
    else if (row.Currency === 'Euro') rate = Number(rates.EUR);
    
    row.rate = rate;
    if (row.Currency === 'Naira') {
      row.AMT_OUTSTANDING = row.Amount;
    } else if (rate != null && row.fx_Amount === 0) {
      row.AMT_OUTSTANDING = row.Amount;
    } else if (rate != null) {
      row.AMT_OUTSTANDING = row.fx_Amount * rate;
    }
  });

  if (templateWb.getWorksheet('OS Model Data')) {
    const osModelCols = ['CLM_KEY', 'CUST_NAME', 'PRODUCT_NAME', 'POLICY_KEY', 'CUST TYPE', 'AMT_OUTSTANDING', 'EVENT_DESC', 'LOSS_DT', 'NOTIFICN_DT', 'REG_DT', 'SBU', 'CLAIM_STATUS', 'CLASS'];
    const data = extractCols(modelOutstanding, osModelCols);
    writeDataToSheet('OS Model Data', data, 2, 1);
  }

  // Model_osc2 Logic
  const mmMap = {}; // Group RESERVE and AMOUNT_PAID by Unique
  for (const row of osAll) {
    const unique = `${row['CLM_KEY']}-${row['CUST_NAME']}-${row['POLICY_KEY']}`;
    if (!mmMap[unique]) mmMap[unique] = { RESERVE: 0, AMOUNT_PAID: 0 };
    mmMap[unique].RESERVE += parseAmt(row['RESERVE_AMOUNT']);
    mmMap[unique].AMOUNT_PAID += parseAmt(row['PAID_AMOUNT']);
  }

  let date = new Date();
  date.setDate(1);
  date.setHours(-1); // Last day of previous month
  const val_date = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const classSummaryMap = {};

  const modelOsc2 = modelOutstanding.map(row => {
    const reserve = mmMap[row.Unique] ? mmMap[row.Unique].RESERVE : 0;
    const paid = mmMap[row.Unique] ? mmMap[row.Unique].AMOUNT_PAID : 0;
    const expected = reserve - paid;
    const diff = expected - row.AMT_OUTSTANDING;
    
    const cls = row.CLASS || 'Unknown';
    if (!classSummaryMap[cls]) {
      classSummaryMap[cls] = { class: cls, expected: 0, outstanding: 0, difference: 0 };
    }
    classSummaryMap[cls].expected += expected;
    classSummaryMap[cls].outstanding += row.AMT_OUTSTANDING;
    classSummaryMap[cls].difference += diff;

    return [
      row.CLM_KEY,
      row.CUST_NAME,
      row.EVENT_DESC,
      row.CLASS,
      row.POLICY_KEY,
      reserve,
      paid,
      row.AMT_OUTSTANDING,
      row.LOSS_DT,
      row.NOTIFICN_DT,
      row.REG_DT,
      '', // Branch
      val_date // ACCOUNTING_DATE
    ];
  });

  if (templateWb.getWorksheet('HY_OSModel')) {
    writeDataToSheet('HY_OSModel', modelOsc2, 2, 1);
  }

  await templateWb.xlsx.writeFile(outputFilePath);
  
  const classSummaryArray = Object.values(classSummaryMap);
  classSummaryArray.sort((a, b) => a.class.localeCompare(b.class));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const formattedFileName = `Revised Composite data sorting ${monthNames[val_date.getMonth()]} ${val_date.getFullYear()}.xlsx`;

  return {
    classSummary: classSummaryArray,
    fileName: formattedFileName
  };
}

module.exports = { processRevisedComposite };
