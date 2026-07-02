/**
 * Comparator — Comparison Engine Module
 *
 * Pure logic module for comparing two parsed datasets by a lookup key.
 * Categorizes records as matched, changed, missing in DS1, or missing in DS2.
 * Handles case-insensitive keys, duplicates, and null/empty normalization.
 *
 * Exposed as window.Comparator
 */
(function () {
  'use strict';

  /**
   * Normalizes a lookup key for case-insensitive, whitespace-trimmed comparison.
   *
   * @param {*} value - The raw value from the dataset
   * @returns {string} Normalized lowercase trimmed string
   */
  function normalizeKey(value) {
    if (value == null) return '';
    return String(value).trim().toLowerCase();
  }

  /**
   * Normalizes a cell value for field comparison.
   * Treats null, undefined, and pure-whitespace as empty string.
   *
   * @param {*} value - The raw cell value
   * @returns {string} Normalized trimmed string
   */
  function normalizeValue(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  /**
   * Finds the common fields between two header arrays, optionally excluding
   * the lookup columns.
   *
   * @param {string[]} headers1 - Headers from dataset 1
   * @param {string[]} headers2 - Headers from dataset 2
   * @param {string} lookupCol1 - Lookup column name in dataset 1
   * @param {string} lookupCol2 - Lookup column name in dataset 2
   * @returns {string[]} Array of common field names (excluding lookup columns)
   */
  function findCommonFields(headers1, headers2, lookupCol1, lookupCol2) {
    var set2 = {};
    for (var i = 0; i < headers2.length; i++) {
      set2[headers2[i]] = true;
    }

    var common = [];
    for (var j = 0; j < headers1.length; j++) {
      var h = headers1[j];
      if (set2[h] && h !== lookupCol1 && h !== lookupCol2) {
        common.push(h);
      }
    }
    return common;
  }

  // ─── Public API ──────────────────────────────────────────────

  var Comparator = {
    /**
     * Compares two datasets by matching records on a configurable lookup column
     * and comparing specified (or all common) fields.
     *
     * **Algorithm:**
     * 1. Build a Map from dataset1 keyed by normalized `lookupColumn1` values (last occurrence wins on duplicates).
     * 2. Build a Map from dataset2 keyed by normalized `lookupColumn2` values (last occurrence wins on duplicates).
     * 3. Iterate dataset2 keys:
     *    - If key exists in dataset1 → compare `compareFields`:
     *      - All match → `matched`
     *      - Any differ → `changed` (with per-field diff details)
     *    - If key missing from dataset1 → `missingInDs1` (new record)
     * 4. Iterate dataset1 keys not in dataset2 → `missingInDs2`
     * 5. Compute summary statistics including match percentage.
     *
     * **Edge cases handled:**
     * - Case-insensitive, trimmed lookup keys
     * - Duplicate keys (last occurrence used)
     * - null/undefined/empty normalized to empty string for comparison
     * - Empty `compareFields` → auto-detect all common fields (excluding lookup columns)
     *
     * @param {{ headers: string[], rows: object[] }} dataset1
     *   The old/reference dataset
     * @param {{ headers: string[], rows: object[] }} dataset2
     *   The new/updated dataset
     * @param {{ lookupColumn1: string, lookupColumn2: string, compareFields: string[] }} config
     *   `lookupColumn1` — column name in dataset1 used as the lookup key
     *   `lookupColumn2` — column name in dataset2 used as the lookup key
     *   `compareFields` — specific fields to compare; if empty, all common fields are compared
     *
     * @returns {{
     *   summary: {
     *     totalDs1: number,
     *     totalDs2: number,
     *     matchedCount: number,
     *     changedCount: number,
     *     missingInDs1Count: number,
     *     missingInDs2Count: number,
     *     matchPercentage: number
     *   },
     *   matched: Array<{ key: string }>,
     *   changed: Array<{ key: string, differences: Array<{ field: string, oldValue: string, newValue: string }> }>,
     *   missingInDs1: Array<{ key: string }>,
     *   missingInDs2: Array<{ key: string }>
     * }}
     *
     * @example
     * const result = Comparator.compare(
     *   { headers: ['Id','Name','Email'], rows: [{ Id:'1', Name:'Alice', Email:'a@x.com' }] },
     *   { headers: ['Id','Name','Email'], rows: [{ Id:'1', Name:'Alice', Email:'a@y.com' }] },
     *   { lookupColumn1: 'Id', lookupColumn2: 'Id', compareFields: ['Name', 'Email'] }
     * );
     * // result.changed[0].differences → [{ field: 'Email', oldValue: 'a@x.com', newValue: 'a@y.com' }]
     */
    compare: function (dataset1, dataset2, config) {
      var lookupCol1 = config.lookupColumn1;
      var lookupCol2 = config.lookupColumn2;
      var compareFields = config.compareFields;

      // If compareFields is empty or not provided, auto-detect common fields
      if (!compareFields || compareFields.length === 0) {
        compareFields = findCommonFields(
          dataset1.headers,
          dataset2.headers,
          lookupCol1,
          lookupCol2
        );
      }

      // Build lookup maps (last occurrence wins for duplicates)
      var map1 = {};          // normalizedKey → row object
      var map1OrigKey = {};   // normalizedKey → original (untrimmed/uncased) key value
      for (var i = 0; i < dataset1.rows.length; i++) {
        var row1 = dataset1.rows[i];
        var rawKey1 = row1[lookupCol1];
        var nk1 = normalizeKey(rawKey1);
        if (nk1 === '') continue;
        map1[nk1] = row1;
        map1OrigKey[nk1] = normalizeValue(rawKey1);
      }

      var map2 = {};
      var map2OrigKey = {};
      var map2Order = [];     // preserve insertion order of unique keys
      for (var j = 0; j < dataset2.rows.length; j++) {
        var row2 = dataset2.rows[j];
        var rawKey2 = row2[lookupCol2];
        var nk2 = normalizeKey(rawKey2);
        if (nk2 === '') continue;
        if (!map2.hasOwnProperty(nk2)) {
          map2Order.push(nk2);
        }
        map2[nk2] = row2;
        map2OrigKey[nk2] = normalizeValue(rawKey2);
      }

      // Result containers
      var matched = [];
      var changed = [];
      var missingInDs1 = [];
      var missingInDs2 = [];

      // Iterate dataset2 keys
      for (var k = 0; k < map2Order.length; k++) {
        var key = map2Order[k];
        var ds2Row = map2[key];
        var displayKey = map2OrigKey[key];

        if (map1.hasOwnProperty(key)) {
          // Record exists in both — compare fields
          var ds1Row = map1[key];
          var differences = [];

          for (var f = 0; f < compareFields.length; f++) {
            var field = compareFields[f];
            var oldVal = normalizeValue(ds1Row[field]);
            var newVal = normalizeValue(ds2Row[field]);
            if (oldVal !== newVal) {
              differences.push({
                field: field,
                oldValue: oldVal,
                newValue: newVal
              });
            }
          }

          if (differences.length === 0) {
            // All compared fields match
            var matchedRecord = { key: displayKey };
            for (var mf = 0; mf < compareFields.length; mf++) {
              matchedRecord[compareFields[mf]] = normalizeValue(ds2Row[compareFields[mf]]);
            }
            matched.push(matchedRecord);
          } else {
            changed.push({
              key: displayKey,
              differences: differences
            });
          }
        } else {
          // Key in DS2 but not in DS1 → new record
          var newRecord = { key: displayKey };
          for (var nf = 0; nf < compareFields.length; nf++) {
            newRecord[compareFields[nf]] = normalizeValue(ds2Row[compareFields[nf]]);
          }
          missingInDs1.push(newRecord);
        }
      }

      // Records in DS1 but not in DS2
      var map1Keys = Object.keys(map1);
      for (var m = 0; m < map1Keys.length; m++) {
        var k1 = map1Keys[m];
        if (!map2.hasOwnProperty(k1)) {
          var ds1MissingRow = map1[k1];
          var missingRecord = { key: map1OrigKey[k1] };
          for (var mf2 = 0; mf2 < compareFields.length; mf2++) {
            missingRecord[compareFields[mf2]] = normalizeValue(ds1MissingRow[compareFields[mf2]]);
          }
          missingInDs2.push(missingRecord);
        }
      }

      // Compute summary
      var totalDs1 = dataset1.rows.length;
      var totalDs2 = dataset2.rows.length;
      var matchedCount = matched.length;
      var changedCount = changed.length;
      var missingInDs1Count = missingInDs1.length;
      var missingInDs2Count = missingInDs2.length;
      var maxTotal = Math.max(totalDs1, totalDs2);
      var matchPercentage = maxTotal > 0
        ? Math.round((matchedCount / maxTotal) * 1000) / 10
        : 0;

      return {
        summary: {
          totalDs1: totalDs1,
          totalDs2: totalDs2,
          matchedCount: matchedCount,
          changedCount: changedCount,
          missingInDs1Count: missingInDs1Count,
          missingInDs2Count: missingInDs2Count,
          matchPercentage: matchPercentage
        },
        matched: matched,
        changed: changed,
        missingInDs1: missingInDs1,
        missingInDs2: missingInDs2
      };
    }
  };

  // Expose as global
  window.Comparator = Comparator;
})();
