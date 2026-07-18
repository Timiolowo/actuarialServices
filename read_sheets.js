const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/timilehinlafe/Documents/Projects/ActuarialServices/Reserves Split Template.xlsx');
console.log("Reserves Split Template sheets:", wb.SheetNames);
