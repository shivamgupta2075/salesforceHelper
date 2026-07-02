(function () {
  'use strict';

  function escapeCSVField(value) {
    var str = value == null ? '' : String(value);
    if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function buildCSVString(headers, rows) {
    var lines = [];
    lines.push(headers.map(escapeCSVField).join(','));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = [];
      for (var h = 0; h < headers.length; h++) {
        cells.push(escapeCSVField(row[headers[h]]));
      }
      lines.push(cells.join(','));
    }
    return lines.join('\r\n');
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  var Exporter = {
    toCSV: function (headers, rows, filename) {
      var csvContent = '\uFEFF' + buildCSVString(headers, rows);
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      triggerDownload(blob, filename);
    },
    toExcel: function (sheetsData, filename) {
      if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');
      var workbook = XLSX.utils.book_new();
      for (var s = 0; s < sheetsData.length; s++) {
        var sheetDef = sheetsData[s];
        var aoa = [sheetDef.headers];
        for (var r = 0; r < sheetDef.rows.length; r++) {
          var row = sheetDef.rows[r];
          var rowArray = [];
          for (var h = 0; h < sheetDef.headers.length; h++) {
            rowArray.push(row[sheetDef.headers[h]] || '');
          }
          aoa.push(rowArray);
        }
        var sheet = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetDef.name);
      }
      XLSX.writeFile(workbook, filename);
    },
    formatChangedRecords: function (changedRecords, lookupColumnName) {
      var headers = [lookupColumnName, 'Field', 'Old Value', 'New Value'];
      var rows = [];
      for (var i = 0; i < changedRecords.length; i++) {
        var record = changedRecords[i];
        for (var d = 0; d < record.differences.length; d++) {
          var diff = record.differences[d];
          var row = {};
          row[lookupColumnName] = record.key;
          row['Field'] = diff.field;
          row['Old Value'] = diff.oldValue;
          row['New Value'] = diff.newValue;
          rows.push(row);
        }
      }
      return { headers: headers, rows: rows };
    },
    formatRecords: function (records, headers) {
      var rows = [];
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        var row = {};
        for (var h = 0; h < headers.length; h++) {
          row[headers[h]] = record[headers[h]] || '';
        }
        rows.push(row);
      }
      return { headers: headers, rows: rows };
    }
  };
  window.Exporter = Exporter;
})();