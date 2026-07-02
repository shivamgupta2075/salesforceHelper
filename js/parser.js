(function () {
  'use strict';

  function parseDelimited(text, delimiter) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentField += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          currentField += char;
          i++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
        } else if (char === delimiter) {
          currentRow.push(currentField);
          currentField = '';
          i++;
        } else if (char === '\r' || char === '\n') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
            i += 2;
          } else {
            i++;
          }
        } else {
          currentField += char;
          i++;
        }
      }
    }
    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }
    return rows;
  }

  function detectDelimiter(text) {
    const sampleLines = text.split(/\r?\n/).slice(0, 5);
    for (const line of sampleLines) {
      if (line.includes('\t')) return '\t';
    }
    return ',';
  }

  function buildDataset(rawRows) {
    if (!rawRows || rawRows.length === 0) return { headers: [], rows: [] };
    const headers = rawRows[0].map(h => (h == null ? '' : String(h)).trim());
    if (headers.length === 0) return { headers: [], rows: [] };
    var rows = [];
    for (var r = 1; r < rawRows.length; r++) {
      var cells = rawRows[r];
      var isEmpty = true;
      for (var c = 0; c < cells.length; c++) {
        if ((cells[c] == null ? '' : String(cells[c])).trim() !== '') {
          isEmpty = false;
          break;
        }
      }
      if (isEmpty) continue;
      var rowObj = {};
      for (var h = 0; h < headers.length; h++) {
        var cellValue = h < cells.length ? cells[h] : '';
        rowObj[headers[h]] = (cellValue == null ? '' : String(cellValue)).trim();
      }
      rows.push(rowObj);
    }
    return { headers: headers, rows: rows };
  }

  var DataParser = {
    parse: function (text) {
      if (!text || typeof text !== 'string') return { headers: [], rows: [] };
      var trimmed = text.trim();
      if (trimmed === '') return { headers: [], rows: [] };
      var delimiter = detectDelimiter(trimmed);
      var rawRows = parseDelimited(trimmed, delimiter);
      return buildDataset(rawRows);
    },
    parseFile: function (file) {
      return new Promise(function (resolve, reject) {
        if (!file) { resolve({ headers: [], rows: [] }); return; }
        var fileName = file.name.toLowerCase();
        var isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
        if (isExcel) {
          var reader = new FileReader();
          reader.onload = function (e) {
            try {
              if (typeof XLSX === 'undefined') reject(new Error('SheetJS not loaded'));
              var data = new Uint8Array(e.target.result);
              var workbook = XLSX.read(data, { type: 'array' });
              var firstSheetName = workbook.SheetNames[0];
              if (!firstSheetName) { resolve({ headers: [], rows: [] }); return; }
              var sheet = workbook.Sheets[firstSheetName];
              var rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
              resolve(buildDataset(rawRows));
            } catch (err) { reject(err); }
          };
          reader.readAsArrayBuffer(file);
        } else {
          var reader = new FileReader();
          reader.onload = function (e) { resolve(DataParser.parse(e.target.result)); };
          reader.readAsText(file);
        }
      });
    }
  };
  window.DataParser = DataParser;
})();