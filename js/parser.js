/**
 * DataParser — Data Parser Module
 *
 * Pure logic module for parsing raw text (CSV/TSV) and file objects
 * into structured data. Handles quoted fields, various delimiters,
 * and Excel file formats via SheetJS.
 *
 * Exposed as window.DataParser
 */
(function () {
  'use strict';

  /**
   * Parses a single line of CSV/TSV respecting quoted fields.
   * Handles fields containing delimiters, newlines, and escaped quotes.
   *
   * @param {string} text - The full text to parse
   * @param {string} delimiter - The delimiter character (',' or '\t')
   * @returns {string[][]} Array of rows, each row is an array of cell values
   */
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
          // Check for escaped quote (doubled quote "")
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentField += '"';
            i += 2;
          } else {
            // End of quoted field
            inQuotes = false;
            i++;
          }
        } else {
          currentField += char;
          i++;
        }
      } else {
        if (char === '"') {
          // Start of quoted field
          inQuotes = true;
          i++;
        } else if (char === delimiter) {
          currentRow.push(currentField);
          currentField = '';
          i++;
        } else if (char === '\r') {
          // Handle \r\n or standalone \r
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          if (i + 1 < text.length && text[i + 1] === '\n') {
            i += 2;
          } else {
            i++;
          }
        } else if (char === '\n') {
          currentRow.push(currentField);
          currentField = '';
          rows.push(currentRow);
          currentRow = [];
          i++;
        } else {
          currentField += char;
          i++;
        }
      }
    }

    // Push the last field and row if there's content
    if (currentField !== '' || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  }

  /**
   * Detects whether the text uses tabs (TSV / Excel paste) or commas (CSV).
   *
   * @param {string} text - Raw input text
   * @returns {string} The detected delimiter character
   */
  function detectDelimiter(text) {
    // Check first few lines for tabs
    const sampleLines = text.split(/\r?\n/).slice(0, 5);
    for (const line of sampleLines) {
      if (line.includes('\t')) {
        return '\t';
      }
    }
    return ',';
  }

  /**
   * Converts an array of arrays (first row = headers) into the standard
   * { headers, rows } format with trimmed values and empty-row filtering.
   *
   * @param {string[][]} rawRows - Array of arrays from the parser
   * @returns {{ headers: string[], rows: object[] }}
   */
  function buildDataset(rawRows) {
    if (!rawRows || rawRows.length === 0) {
      return { headers: [], rows: [] };
    }

    // First row is headers — trim each header
    const headers = rawRows[0].map(function (h) {
      return (h == null ? '' : String(h)).trim();
    });

    if (headers.length === 0 || headers.every(function (h) { return h === ''; })) {
      return { headers: [], rows: [] };
    }

    var rows = [];
    for (var r = 1; r < rawRows.length; r++) {
      var cells = rawRows[r];

      // Skip completely empty rows
      var isEmpty = true;
      for (var c = 0; c < cells.length; c++) {
        var val = (cells[c] == null ? '' : String(cells[c])).trim();
        if (val !== '') {
          isEmpty = false;
          break;
        }
      }
      if (isEmpty) {
        continue;
      }

      var rowObj = {};
      for (var h = 0; h < headers.length; h++) {
        var cellValue = h < cells.length ? cells[h] : '';
        rowObj[headers[h]] = (cellValue == null ? '' : String(cellValue)).trim();
      }
      rows.push(rowObj);
    }

    return { headers: headers, rows: rows };
  }

  // ─── Public API ──────────────────────────────────────────────

  var DataParser = {
    /**
     * Parses raw text (pasted from Excel or from a file) into structured data.
     *
     * Automatically detects the delimiter:
     * - If tabs are present → TSV (typical Excel paste)
     * - Otherwise → CSV
     *
     * Handles:
     * - Quoted fields containing commas, newlines, or quotes
     * - Doubled quotes (`""`) inside quoted fields
     * - Windows (`\r\n`) and Unix (`\n`) line endings
     * - Trailing newlines and empty rows
     * - Empty cells
     *
     * @param {string} text - Raw string input (CSV or TSV)
     * @returns {{ headers: string[], rows: object[] }}
     *   `headers` — array of column header strings (trimmed)
     *   `rows` — array of objects keyed by header names (values trimmed)
     *
     * @example
     * const result = DataParser.parse("Name\tAge\nAlice\t30\nBob\t25");
     * // { headers: ['Name', 'Age'], rows: [{ Name: 'Alice', Age: '30' }, ...] }
     */
    parse: function (text) {
      if (!text || typeof text !== 'string') {
        return { headers: [], rows: [] };
      }

      var trimmed = text.trim();
      if (trimmed === '') {
        return { headers: [], rows: [] };
      }

      var delimiter = detectDelimiter(trimmed);
      var rawRows = parseDelimited(trimmed, delimiter);
      return buildDataset(rawRows);
    },

    /**
     * Parses a File object into structured data.
     *
     * Supported file types:
     * - `.csv`, `.txt` — read as text, then parsed via `DataParser.parse()`
     * - `.xlsx`, `.xls` — read via SheetJS (`XLSX` global), first sheet converted
     *
     * @param {File} file - A File object from a file input or drag-and-drop
     * @returns {Promise<{ headers: string[], rows: object[] }>}
     *
     * @example
     * const input = document.getElementById('fileInput');
     * input.addEventListener('change', async (e) => {
     *   const data = await DataParser.parseFile(e.target.files[0]);
     *   console.log(data.headers, data.rows);
     * });
     */
    parseFile: function (file) {
      return new Promise(function (resolve, reject) {
        if (!file) {
          resolve({ headers: [], rows: [] });
          return;
        }

        var fileName = file.name.toLowerCase();
        var isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

        if (isExcel) {
          // Read as ArrayBuffer for SheetJS
          var reader = new FileReader();
          reader.onload = function (e) {
            try {
              if (typeof XLSX === 'undefined') {
                reject(new Error('SheetJS (XLSX) library is not loaded. Include it via CDN to read Excel files.'));
                return;
              }
              var data = new Uint8Array(e.target.result);
              var workbook = XLSX.read(data, { type: 'array' });
              var firstSheetName = workbook.SheetNames[0];
              if (!firstSheetName) {
                resolve({ headers: [], rows: [] });
                return;
              }
              var sheet = workbook.Sheets[firstSheetName];
              var rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
              resolve(buildDataset(rawRows));
            } catch (err) {
              reject(new Error('Failed to parse Excel file: ' + err.message));
            }
          };
          reader.onerror = function () {
            reject(new Error('Failed to read file: ' + file.name));
          };
          reader.readAsArrayBuffer(file);
        } else {
          // Read as text for CSV / TXT
          var reader = new FileReader();
          reader.onload = function (e) {
            try {
              resolve(DataParser.parse(e.target.result));
            } catch (err) {
              reject(new Error('Failed to parse text file: ' + err.message));
            }
          };
          reader.onerror = function () {
            reject(new Error('Failed to read file: ' + file.name));
          };
          reader.readAsText(file);
        }
      });
    },

    /**
     * Quickly extracts just the header row from pasted text without
     * performing a full parse of all data rows.
     *
     * @param {string} text - Raw string input (CSV or TSV)
     * @returns {string[]} Array of trimmed header strings
     *
     * @example
     * const headers = DataParser.detectHeaders("Id,Name,Email\n1,Alice,a@b.com");
     * // ['Id', 'Name', 'Email']
     */
    detectHeaders: function (text) {
      if (!text || typeof text !== 'string') {
        return [];
      }

      var trimmed = text.trim();
      if (trimmed === '') {
        return [];
      }

      var delimiter = detectDelimiter(trimmed);

      // We only need the first logical row. For robustness with quoted fields
      // that may span multiple lines, we parse the whole text but only take
      // the first row from the result.
      var rawRows = parseDelimited(trimmed, delimiter);
      if (rawRows.length === 0) {
        return [];
      }

      return rawRows[0].map(function (h) {
        return (h == null ? '' : String(h)).trim();
      });
    }
  };

  // Expose as global
  window.DataParser = DataParser;
})();
