/**
 * Exporter — Export Module
 *
 * Pure logic module for exporting comparison results to CSV and Excel formats.
 * Includes convenience formatters for preparing data for display and export.
 * Uses SheetJS (`XLSX` global) for Excel file generation.
 *
 * Exposed as window.Exporter
 */
(function () {
  'use strict';

  /**
   * Escapes and quotes a single CSV field value.
   * Fields containing commas, double quotes, or newlines are wrapped in quotes.
   * Internal double quotes are escaped by doubling them.
   *
   * @param {*} value - The cell value to format
   * @returns {string} CSV-safe field string
   */
  function escapeCSVField(value) {
    var str = value == null ? '' : String(value);
    if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1 || str.indexOf('\r') !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Builds a CSV string from headers and row data.
   *
   * @param {string[]} headers - Column headers
   * @param {object[]|Array[]} rows - Data rows (objects keyed by headers, or arrays)
   * @returns {string} Complete CSV string
   */
  function buildCSVString(headers, rows) {
    var lines = [];

    // Header row
    lines.push(headers.map(escapeCSVField).join(','));

    // Data rows
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = [];

      if (Array.isArray(row)) {
        // Row is an array of values
        for (var c = 0; c < headers.length; c++) {
          cells.push(escapeCSVField(c < row.length ? row[c] : ''));
        }
      } else {
        // Row is an object keyed by header names
        for (var h = 0; h < headers.length; h++) {
          var val = row[headers[h]];
          cells.push(escapeCSVField(val));
        }
      }

      lines.push(cells.join(','));
    }

    return lines.join('\r\n');
  }

  /**
   * Triggers a file download in the browser.
   *
   * @param {Blob} blob - The Blob to download
   * @param {string} filename - The download filename
   */
  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Public API ──────────────────────────────────────────────

  var Exporter = {
    /**
     * Exports data as a CSV file download.
     *
     * The generated CSV includes:
     * - UTF-8 BOM (`\uFEFF`) prefix for Excel compatibility
     * - Proper quoting of fields containing commas, quotes, or newlines
     * - Windows-style line endings (`\r\n`)
     *
     * @param {string[]} headers - Column header names
     * @param {object[]|Array[]} rows - Data rows as objects (keyed by headers) or arrays
     * @param {string} filename - Download filename (e.g., `'changed_records.csv'`)
     *
     * @example
     * Exporter.toCSV(
     *   ['Id', 'Name', 'Email'],
     *   [{ Id: '1', Name: 'Alice', Email: 'a@x.com' }],
     *   'export.csv'
     * );
     */
    toCSV: function (headers, rows, filename) {
      var csvContent = '\uFEFF' + buildCSVString(headers, rows);
      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      triggerDownload(blob, filename);
    },

    /**
     * Exports data as a multi-sheet Excel (.xlsx) file download.
     *
     * Requires the SheetJS library (`XLSX` global) to be loaded via CDN.
     * Each entry in `sheetsData` becomes a separate sheet in the workbook.
     *
     * @param {Array<{ name: string, headers: string[], rows: object[] }>} sheetsData
     *   Array of sheet definitions. Each contains:
     *   - `name` — sheet tab name
     *   - `headers` — column headers for this sheet
     *   - `rows` — data rows as objects keyed by header names
     * @param {string} filename - Download filename (e.g., `'comparison_results.xlsx'`)
     *
     * @throws {Error} If SheetJS (`XLSX`) is not loaded
     *
     * @example
     * Exporter.toExcel([
     *   { name: 'Matched', headers: ['Id','Name'], rows: [{ Id:'1', Name:'Alice' }] },
     *   { name: 'Changed', headers: ['Id','Field','Old','New'], rows: [...] }
     * ], 'results.xlsx');
     */
    toExcel: function (sheetsData, filename) {
      if (typeof XLSX === 'undefined') {
        throw new Error('SheetJS (XLSX) library is not loaded. Include it via CDN to export Excel files.');
      }

      var workbook = XLSX.utils.book_new();

      for (var s = 0; s < sheetsData.length; s++) {
        var sheetDef = sheetsData[s];
        var sheetName = sheetDef.name || ('Sheet' + (s + 1));
        var headers = sheetDef.headers || [];
        var rows = sheetDef.rows || [];

        // Build array of arrays: first row is headers, then data
        var aoa = [];
        aoa.push(headers);

        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var rowArray = [];
          for (var h = 0; h < headers.length; h++) {
            var val = row[headers[h]];
            rowArray.push(val == null ? '' : val);
          }
          aoa.push(rowArray);
        }

        var sheet = XLSX.utils.aoa_to_sheet(aoa);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      }

      XLSX.writeFile(workbook, filename);
    },

    /**
     * Formats the `changed` array from `Comparator.compare()` results into
     * a flat table structure suitable for display and export.
     *
     * Each difference in each changed record becomes its own row with columns:
     * `[lookupColumnName]`, `Field`, `Old Value`, `New Value`.
     *
     * @param {Array<{ key: string, differences: Array<{ field: string, oldValue: string, newValue: string }> }>} changedRecords
     *   The `changed` array from Comparator results
     * @param {string} lookupColumnName
     *   The display name for the lookup key column
     *
     * @returns {{ headers: string[], rows: object[] }}
     *   Flattened data ready for table rendering or CSV/Excel export
     *
     * @example
     * const formatted = Exporter.formatChangedRecords(result.changed, 'Id');
     * // formatted.headers → ['Id', 'Field', 'Old Value', 'New Value']
     * // formatted.rows → [{ Id: '001', Field: 'Email', 'Old Value': 'a@x.com', 'New Value': 'a@y.com' }]
     */
    formatChangedRecords: function (changedRecords, lookupColumnName) {
      var headers = [lookupColumnName, 'Field', 'Old Value', 'New Value'];
      var rows = [];

      for (var i = 0; i < changedRecords.length; i++) {
        var record = changedRecords[i];
        var diffs = record.differences;
        for (var d = 0; d < diffs.length; d++) {
          var diff = diffs[d];
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

    /**
     * Generic formatter that takes an array of record objects and a list of
     * headers, returning a clean `{ headers, rows }` structure ready for
     * CSV or Excel export.
     *
     * Missing fields in any record are filled with empty strings to ensure
     * consistent column alignment.
     *
     * @param {object[]} records - Array of record objects
     * @param {string[]} headers - Ordered list of header/column names
     *
     * @returns {{ headers: string[], rows: object[] }}
     *   Formatted data with guaranteed field presence
     *
     * @example
     * const formatted = Exporter.formatRecords(
     *   [{ Id: '1', Name: 'Alice' }, { Id: '2' }],
     *   ['Id', 'Name', 'Email']
     * );
     * // formatted.rows[1] → { Id: '2', Name: '', Email: '' }
     */
    formatRecords: function (records, headers) {
      var rows = [];

      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        var row = {};
        for (var h = 0; h < headers.length; h++) {
          var field = headers[h];
          row[field] = record[field] != null ? record[field] : '';
        }
        rows.push(row);
      }

      return { headers: headers, rows: rows };
    }
  };

  // Expose as global
  window.Exporter = Exporter;
})();
