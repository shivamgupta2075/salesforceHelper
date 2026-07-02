(function () {
  'use strict';

  function normalizeKey(value) {
    if (value == null) return '';
    return String(value).trim().toLowerCase();
  }

  function normalizeValue(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  var Comparator = {
    compare: function (dataset1, dataset2, config) {
      var lookupCol1 = config.lookupColumn1;
      var lookupCol2 = config.lookupColumn2;
      var compareFields = config.compareFields || [];

      var map1 = {}, map1OrigKey = {};
      for (var i = 0; i < dataset1.rows.length; i++) {
        var row1 = dataset1.rows[i];
        var nk1 = normalizeKey(row1[lookupCol1]);
        if (nk1 === '') continue;
        map1[nk1] = row1;
        map1OrigKey[nk1] = normalizeValue(row1[lookupCol1]);
      }

      var map2 = {}, map2OrigKey = {}, map2Order = [];
      for (var j = 0; j < dataset2.rows.length; j++) {
        var row2 = dataset2.rows[j];
        var nk2 = normalizeKey(row2[lookupCol2]);
        if (nk2 === '') continue;
        if (!map2.hasOwnProperty(nk2)) map2Order.push(nk2);
        map2[nk2] = row2;
        map2OrigKey[nk2] = normalizeValue(row2[lookupCol2]);
      }

      var matched = [], changed = [], missingInDs1 = [], missingInDs2 = [];

      for (var k = 0; k < map2Order.length; k++) {
        var key = map2Order[k];
        var ds2Row = map2[key];
        var displayKey = map2OrigKey[key];
        if (map1.hasOwnProperty(key)) {
          var ds1Row = map1[key];
          var differences = [];
          for (var f = 0; f < compareFields.length; f++) {
            var field = compareFields[f];
            var oldVal = normalizeValue(ds1Row[field]);
            var newVal = normalizeValue(ds2Row[field]);
            if (oldVal !== newVal) {
              differences.push({ field: field, oldValue: oldVal, newValue: newVal });
            }
          }
          if (differences.length === 0) {
            matched.push({ key: displayKey });
          } else {
            changed.push({ key: displayKey, differences: differences });
          }
        } else {
          missingInDs1.push({ key: displayKey });
        }
      }

      var map1Keys = Object.keys(map1);
      for (var m = 0; m < map1Keys.length; m++) {
        if (!map2.hasOwnProperty(map1Keys[m])) {
          missingInDs2.push({ key: map1OrigKey[map1Keys[m]] });
        }
      }

      return {
        summary: {
          totalDs1: dataset1.rows.length,
          totalDs2: dataset2.rows.length,
          matchedCount: matched.length,
          changedCount: changed.length,
          missingInDs1Count: missingInDs1.length,
          missingInDs2Count: missingInDs2.length
        },
        matched: matched,
        changed: changed,
        missingInDs1: missingInDs1,
        missingInDs2: missingInDs2
      };
    }
  };
  window.Comparator = Comparator;
})();