/**
 * sfperms.js
 * Salesforce Object Permissions Viewer — CLI Token Engine & UI Controller
 * Dedicated for GitHub Live Static Sites without Org modifications.
 *
 * Exposed as window.SfPerms
 */
(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────────

  var _state = {
    objects:          [],
    selectedUserId:   null,
    selectedUserLabel: '',
    selectedObjects:  [],
    analysisResults:  [],
    sourceMap:        {},
    fieldPermsCache:  {}
  };

  var _searchTimer = null;

  // ─── Helpers ────────────────────────────────────────────────────────────

  function toast(msg, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(function () {
      el.style.transform = 'translateX(0)';
      el.style.opacity = '1';
    });
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(100%)';
      setTimeout(function () { el.remove(); }, 300);
    }, 3500);
  }

  // ─── Analysis Engine ────────────────────────────────────────────────────

  function loadSourceMap(userId) {
    var soql =
      "SELECT PermissionSetId, PermissionSet.Label, PermissionSet.Name, " +
      "PermissionSet.PermissionSetGroupId, " +
      "PermissionSet.PermissionSetGroup.MasterLabel, " +
      "PermissionSet.Profile.Name " +
      "FROM PermissionSetAssignment " +
      "WHERE AssigneeId = '" + userId + "'";

    return SfAuth.query(soql).then(function (records) {
      var map = {};
      for (var i = 0; i < records.length; i++) {
        var rec = records[i];
        var psId = rec.PermissionSetId;
        var type, label;

        if (rec.PermissionSet && rec.PermissionSet.Profile && rec.PermissionSet.Profile.Name) {
          type = 'Profile';
          label = rec.PermissionSet.Profile.Name;
        } else if (rec.PermissionSet && rec.PermissionSet.PermissionSetGroupId) {
          type = 'PermissionSetGroup';
          var groupName = (rec.PermissionSet.PermissionSetGroup && rec.PermissionSet.PermissionSetGroup.MasterLabel)
            ? rec.PermissionSet.PermissionSetGroup.MasterLabel
            : rec.PermissionSet.Label;
          label = groupName;
        } else {
          type = 'PermissionSet';
          label = rec.PermissionSet ? rec.PermissionSet.Label : 'Unknown';
        }

        map[psId] = {
          type:        type,
          label:       label,
          name:        rec.PermissionSet ? rec.PermissionSet.Name : '',
          groupLabel:  type === 'PermissionSetGroup'
            ? (rec.PermissionSet && rec.PermissionSet.Label ? rec.PermissionSet.Label : '')
            : ''
        };
      }
      _state.sourceMap = map;
      return map;
    });
  }

  function fetchObjectPerms(objectNames, permSetIds) {
    if (permSetIds.length === 0 || objectNames.length === 0) {
      return Promise.resolve([]);
    }

    var escapedObjs = objectNames.map(function (n) { return "'" + n + "'"; }).join(',');
    var escapedIds  = permSetIds.map(function (n) { return "'" + n + "'"; }).join(',');

    var soql =
      "SELECT SObjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, " +
      "PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords, ParentId " +
      "FROM ObjectPermissions " +
      "WHERE ParentId IN (" + escapedIds + ") " +
      "AND SObjectType IN (" + escapedObjs + ")";

    return SfAuth.query(soql);
  }

  function fetchTabAccess(permSetIds) {
    if (permSetIds.length === 0) {
      return Promise.resolve([]);
    }

    var escapedIds = permSetIds.map(function (n) { return "'" + n + "'"; }).join(',');

    var soql =
      "SELECT SetupEntityId, ParentId " +
      "FROM SetupEntityAccess " +
      "WHERE SetupEntityType = 'TabDefinition' " +
      "AND ParentId IN (" + escapedIds + ")";

    return SfAuth.query(soql).then(function (records) {
      return records.map(function (r) {
        var entityId = r.SetupEntityId || '';
        var objectName = '';
        if (entityId.indexOf('standard-') === 0) {
          objectName = entityId.substring('standard-'.length);
        }
        return {
          setupEntityId: entityId,
          parentId:      r.ParentId,
          objectName:    objectName
        };
      });
    });
  }

  function fetchFieldPerms(objectName, permSetIds) {
    if (permSetIds.length === 0) {
      return Promise.resolve([]);
    }

    var escapedIds = permSetIds.map(function (n) { return "'" + n + "'"; }).join(',');

    var soql =
      "SELECT Field, PermissionsRead, PermissionsEdit, ParentId " +
      "FROM FieldPermissions " +
      "WHERE SObjectType = '" + objectName + "' " +
      "AND ParentId IN (" + escapedIds + ")";

    return SfAuth.query(soql).then(function (records) {
      return records.map(function (r) {
        return {
          field:     r.Field,
          permSetId: r.ParentId,
          readable:  r.PermissionsRead,
          editable:  r.PermissionsEdit
        };
      });
    });
  }

  function analyzePermissions(userId, objectNames) {
    var permSetIds = Object.keys(_state.sourceMap);

    return fetchObjectPerms(objectNames, permSetIds).then(function (objPerms) {
      return fetchTabAccess(permSetIds).then(function (tabAccess) {
        var results = {};

        for (var o = 0; o < objectNames.length; o++) {
          results[objectNames[o]] = {
            objectName:  objectNames[o],
            objectLabel: '',
            crudSources: [],
            tabVisible:  false,
            tabSources:  []
          };
        }

        for (var i = 0; i < objPerms.length; i++) {
          var op   = objPerms[i];
          var obj  = op.SObjectType;
          var psId = op.ParentId;
          if (!results[obj]) continue;
          results[obj].crudSources.push({
            permSetId: psId,
            read:      op.PermissionsRead,
            create:    op.PermissionsCreate,
            edit:      op.PermissionsEdit,
            delete:    op.PermissionsDelete,
            viewAll:   op.PermissionsViewAllRecords,
            modifyAll: op.PermissionsModifyAllRecords
          });
        }

        for (var t = 0; t < tabAccess.length; t++) {
          var ta = tabAccess[t];
          var mappedObj = ta.objectName;
          if (mappedObj) {
            var matchedObj = null;
            for (var objKey in results) {
              if (results.hasOwnProperty(objKey) && objKey.toLowerCase() === mappedObj.toLowerCase()) {
                matchedObj = objKey;
                break;
              }
            }
            if (matchedObj && results[matchedObj]) {
              results[matchedObj].tabVisible = true;
              results[matchedObj].tabSources.push({ permSetId: ta.parentId });
            }
          }
        }

        var resultArray = [];
        for (var r in results) {
          if (results.hasOwnProperty(r)) {
            resultArray.push(results[r]);
          }
        }

        resultArray.sort(function (a, b) {
          return a.objectName.localeCompare(b.objectName);
        });

        _state.analysisResults = resultArray;
        return resultArray;
      });
    });
  }

  // ─── UI Controller ──────────────────────────────────────────────────────

  function init() {
    cacheDOMElements();
    bindEvents();
    checkAuthState();
  }

  var _el = {};

  function cacheDOMElements() {
    _el.connectPanel        = document.getElementById('sfpConnectPanel');
    _el.mainPanel           = document.getElementById('sfpMainPanel');
    _el.manualTokenInput    = document.getElementById('sfpManualToken');
    _el.manualInstanceInput = document.getElementById('sfpManualInstance');
    _el.btnManualConnect    = document.getElementById('sfpBtnManualConnect');
    _el.authBarUser         = document.getElementById('sfpAuthBarUser');
    _el.authBarInstance     = document.getElementById('sfpAuthBarInstance');
    _el.btnDisconnect       = document.getElementById('sfpBtnDisconnect');
    _el.userSearch          = document.getElementById('sfpUserSearch');
    _el.userResults         = document.getElementById('sfpUserResults');
    _el.selectedUser        = document.getElementById('sfpSelectedUser');
    _el.objectFilter        = document.getElementById('sfpObjectFilter');
    _el.objectList          = document.getElementById('sfpObjectList');
    _el.selectAllObjs       = document.getElementById('sfpSelectAllObjs');
    _el.deselectAllObjs     = document.getElementById('sfpDeselectAllObjs');
    _el.btnAnalyze          = document.getElementById('sfpBtnAnalyze');
    _el.resultsContainer    = document.getElementById('sfpResultsContainer');
    _el.resultsHeader       = document.getElementById('sfpResultsHeader');
    _el.resultsGrid         = document.getElementById('sfpResultsGrid');
    _el.btnExportCsv        = document.getElementById('sfpExportCsv');
    _el.btnExportExcel      = document.getElementById('sfpExportExcel');
  }

  function bindEvents() {
    if (!_el.btnManualConnect) return;

    _el.btnManualConnect.addEventListener('click', handleManualConnect);
    _el.btnDisconnect.addEventListener('click', handleDisconnect);
    
    _el.manualTokenInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleManualConnect();
    });
    
    _el.userSearch.addEventListener('input', function () {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(handleUserSearch, 400);
    });
    
    _el.objectFilter.addEventListener('input', filterObjectList);
    _el.selectAllObjs.addEventListener('click', function () { toggleAllObjects(true); });
    _el.deselectAllObjs.addEventListener('click', function () { toggleAllObjects(false); });
    _el.btnAnalyze.addEventListener('click', handleAnalyze);
    _el.btnExportCsv.addEventListener('click', exportCSV);
    _el.btnExportExcel.addEventListener('click', exportExcel);
  }

  // ─── Auth State ─────────────────────────────────────────────────────────

  function checkAuthState() {
    if (window.SfAuth && SfAuth.isAuthenticated && SfAuth.isAuthenticated()) {
      showMainPanel();
      loadObjectList();
      updateAuthBar();
    } else {
      showConnectPanel();
    }
  }

  function showConnectPanel() {
    _el.connectPanel.classList.remove('hidden');
    _el.mainPanel.classList.add('hidden');
  }

  function showMainPanel() {
    _el.connectPanel.classList.add('hidden');
    _el.mainPanel.classList.remove('hidden');
  }

  function updateAuthBar() {
    var instanceUrl = (window.SfAuth && SfAuth.getInstanceUrl) ? SfAuth.getInstanceUrl() : '';
    _el.authBarInstance.textContent = instanceUrl ? instanceUrl.replace(/https?:\/\//, '').replace(/\/+$/, '') : 'CLI Session';
    _el.authBarUser.textContent = 'Active Org Connected';
  }

  // ─── CLI Connection Handler ──────────────────────────────────────────────

  function handleManualConnect() {
    var token       = _el.manualTokenInput.value.trim();
    var instanceUrl = _el.manualInstanceInput.value.trim();
    if (!token || !instanceUrl) {
      toast('Please provide both the access token and instance URL.', 'error');
      return;
    }
    
    _el.btnManualConnect.disabled = true;
    _el.btnManualConnect.textContent = 'Connecting via REST API…';

    window.SfAuth.connectManual(token, instanceUrl).then(function () {
      toast('Org synchronized successfully via CLI Token!', 'success');
      showMainPanel();
      updateAuthBar();
      loadObjectList();
    }).catch(function (err) {
      toast('REST Connection failed: ' + err.message, 'error');
    }).finally(function () {
      _el.btnManualConnect.disabled = false;
      _el.btnManualConnect.textContent = 'Connect to Salesforce Org';
    });
  }

  function handleDisconnect() {
    if (window.SfAuth && SfAuth.disconnect) SfAuth.disconnect();
    _state = {
      objects: [], selectedUserId: null, selectedUserLabel: '',
      selectedObjects: [], analysisResults: [], sourceMap: {}, fieldPermsCache: {}
    };
    clearResults();
    _el.userSearch.value = '';
    _el.userResults.innerHTML = '';
    _el.selectedUser.textContent = 'No user selected';
    _el.objectList.innerHTML = '<p class="text-tertiary text-sm" style="padding:1rem;">Please connect to a Salesforce org first.</p>';
    showConnectPanel();
    toast('Disconnected safely.', 'info');
  }

  // ─── Object List Loading ────────────────────────────────────────────────

  function loadObjectList() {
    _el.objectList.innerHTML = '<p class="text-tertiary text-sm" style="padding:0.5rem;">Loading objects metadata…</p>';
    window.SfAuth.loadObjects().then(function (objects) {
      _state.objects = objects;
      renderObjectList(objects);
    }).catch(function (err) {
      _el.objectList.innerHTML = '<p class="text-sm" style="color:var(--color-error);padding:0.5rem;">Failed to load objects: ' + err.message + '</p>';
    });
  }

  function renderObjectList(objects) {
    _el.objectList.innerHTML = '';
    objects.forEach(function (obj) {
      var label = document.createElement('label');
      label.className = 'sfp-obj-check';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = obj.name;
      checkbox.dataset.label = obj.label;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(obj.label + ' (' + obj.name + ')'));
      _el.objectList.appendChild(label);
    });
  }

  function filterObjectList() {
    var query = _el.objectFilter.value.toLowerCase();
    var labels = _el.objectList.querySelectorAll('.sfp-obj-check');
    labels.forEach(function (label) {
      var text = label.textContent.toLowerCase();
      label.style.display = text.indexOf(query) !== -1 ? '' : 'none';
    });
  }

  function toggleAllObjects(selected) {
    var checkboxes = _el.objectList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(function (cb) {
      cb.checked = selected;
    });
  }

  function getSelectedObjects() {
    var checkboxes = _el.objectList.querySelectorAll('input[type="checkbox"]:checked');
    var selected = [];
    checkboxes.forEach(function (cb) {
      selected.push({ name: cb.value, label: cb.dataset.label || cb.value });
    });
    return selected;
  }

  // ─── User Search ────────────────────────────────────────────────────────

  function handleUserSearch() {
    var term = _el.userSearch.value.trim();
    if (term.length < 2) {
      _el.userResults.innerHTML = '';
      return;
    }
    _el.userResults.innerHTML = '<p class="text-sm text-tertiary" style="padding:0.5rem;">Searching Org Users…</p>';
    window.SfAuth.searchUsers(term).then(function (users) {
      renderUserResults(users);
    }).catch(function (err) {
      _el.userResults.innerHTML = '<p class="text-sm" style="color:var(--color-error);padding:0.5rem;">Search error: ' + err.message + '</p>';
    });
  }

  function renderUserResults(users) {
    _el.userResults.innerHTML = '';
    if (users.length === 0) {
      _el.userResults.innerHTML = '<p class="text-sm text-tertiary" style="padding:0.5rem;">No active users found.</p>';
      return;
    }
    users.forEach(function (user) {
      var div = document.createElement('div');
      div.className = 'sfp-user-result';
      var nameSpan = document.createElement('span');
      nameSpan.className = 'sfp-user-name';
      nameSpan.textContent = user.name;
      var usernameSpan = document.createElement('span');
      usernameSpan.className = 'sfp-user-username';
      usernameSpan.textContent = user.username;
      div.appendChild(nameSpan);
      div.appendChild(usernameSpan);
      div.addEventListener('click', function () {
        _state.selectedUserId = user.id;
        _state.selectedUserLabel = user.name;
        _el.selectedUser.textContent = user.name + ' (' + user.username + ')';
        _el.userResults.innerHTML = '';
        _el.userSearch.value = user.name;
      });
      _el.userResults.appendChild(div);
    });
  }

  // ─── Analyze & Matrix Builder ───────────────────────────────────────────

  function handleAnalyze() {
    if (!_state.selectedUserId) {
      toast('Please search and select a target user first.', 'error');
      return;
    }
    var selectedObjs = getSelectedObjects();
    if (selectedObjs.length === 0) {
      toast('Please check at least one object from the sidebar list.', 'error');
      return;
    }

    _el.btnAnalyze.disabled = true;
    _el.btnAnalyze.textContent = 'Loading Assignments…';

    loadSourceMap(_state.selectedUserId)
      .then(function () {
        _el.btnAnalyze.textContent = 'Parsing Matrices…';
        var names = selectedObjs.map(function (o) { return o.name; });
        return analyzePermissions(_state.selectedUserId, names);
      })
      .then(function (results) {
        var permSetIds = Object.keys(_state.sourceMap);
        var flsPromises = results.map(function (res) {
          return fetchFieldPerms(res.objectName, permSetIds).then(function (fields) {
            _state.fieldPermsCache[res.objectName] = fields;
          });
        });
        return Promise.all(flsPromises);
      })
      .then(function () {
        renderResultsGrid();
        toast('Permissions evaluated successfully!', 'success');
      })
      .catch(function (err) {
        toast('Evaluation error: ' + err.message, 'error');
      })
      .finally(function () {
        _el.btnAnalyze.disabled = false;
        _el.btnAnalyze.textContent = 'Analyze Permissions';
      });
  }

  function clearResults() {
    _el.resultsContainer.classList.add('hidden');
    _el.resultsGrid.innerHTML = '';
  }

  function renderResultsGrid() {
    _el.resultsGrid.innerHTML = '';
    _el.resultsContainer.classList.remove('hidden');

    if (_state.analysisResults.length === 0) {
      _el.resultsGrid.innerHTML = '<p class="text-tertiary p-4">No records found matching criteria.</p>';
      return;
    }

    _state.analysisResults.forEach(function (res) {
      var card = document.createElement('div');
      card.className = 'glass-panel p-5 sfp-object-card';

      var summary = { read: false, create: false, edit: false, 'delete': false, viewAll: false, modifyAll: false };
      
      res.crudSources.forEach(function (src) {
        if (src.read) summary.read = true;
        if (src.create) summary.create = true;
        if (src.edit) summary.edit = true;
        if (src.delete) summary.delete = true;
        if (src.viewAll) summary.viewAll = true;
        if (src.modifyAll) summary.modifyAll = true;
      });

      var html = '<div class="flex-between mb-4">' +
                 '<div><h4 class="font-600 font-lg text-primary">' + res.objectName + '</h4>' +
                 '<p class="text-sm text-muted mt-1">Tab Visibility: ' + 
                 (res.tabVisible ? '<span class="text-success font-500">Visible</span>' : '<span class="text-danger font-500">Hidden</span>') + 
                 '</p></div></div>';

      html += '<div class="sfp-matrix-grid">';
      var matrixKeys = ['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'];
      var matrixLabels = ['READ', 'CREATE', 'EDIT', 'DELETE', 'VIEW ALL', 'MODIFY ALL'];

      matrixKeys.forEach(function (key, idx) {
        var isGranted = summary[key];
        var accurateSources = [];
        res.crudSources.forEach(function (src) {
          if (src[key]) {
            var srcMeta = _state.sourceMap[src.permSetId];
            if (srcMeta) {
              accurateSources.push('[' + srcMeta.type + '] ' + srcMeta.label);
            }
          }
        });
        
        var tooltip = accurateSources.length > 0 ? accurateSources.join('\n') : 'No grant source found';

        html += '<div class="sfp-matrix-cell ' + (isGranted ? 'active' : '') + '" title="' + tooltip + '">' +
                '<span class="font-600 font-xs cell-label">' + matrixLabels[idx] + '</span>' +
                '<span class="cell-status font-500">' + (isGranted ? 'Granted' : 'Denied') + '</span>' +
                '</div>';
      });
      html += '</div>';

      var fieldPerms = _state.fieldPermsCache[res.objectName] || [];
      if (fieldPerms.length > 0) {
        var rolledFields = {};
        fieldPerms.forEach(function (f) {
          if (!rolledFields[f.field]) {
            rolledFields[f.field] = { name: f.field, r: false, e: false };
          }
          if (f.readable) rolledFields[f.field].r = true;
          if (f.editable) rolledFields[f.field].e = true;
        });

        var rolledList = Object.keys(rolledFields).map(function (k) { return rolledFields[k]; });

        html += '<div class="mt-4">' +
                '<details class="sfp-fls-details">' +
                '<summary class="font-500 text-sm text-accent cursor-pointer">View Field-Level Security (' + rolledList.length + ' fields)</summary>' +
                '<div class="sfp-fls-table-wrapper mt-3">' +
                '<table class="sfp-fls-table"><thead><tr><th>Field API Name</th><th>Read</th><th>Edit</th></tr></thead><tbody>';
        
        rolledList.forEach(function (f) {
          html += '<tr><td>' + f.name.replace(/^[^\.]+\./, '') + '</td>' +
                  '<td>' + (f.r ? '✅' : '❌') + '</td>' +
                  '<td>' + (f.e ? '✅' : '❌') + '</td></tr>';
        });
        
        html += '</tbody></table></div></details></div>';
      }

      card.innerHTML = html;
      _el.resultsGrid.appendChild(card);
    });
  }

  // ─── Export Pipeline ────────────────────────────────────────────────────

  function csvEscape(val) {
    var str = val == null ? '' : String(val);
    if (str.indexOf(',') !== -1 || str.indexOf('\"') !== -1 || str.indexOf('\n') !== -1 || str.indexOf('\r') !== -1) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function exportCSV() {
    if (_state.analysisResults.length === 0) {
      toast('No analysis data ready for export.', 'error');
      return;
    }

    var lines = [['Object Name', 'Permission Type', 'Access Status', 'Assigned Source Assignments']];

    _state.analysisResults.forEach(function (res) {
      var keys = ['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'];
      var labels = ['Read', 'Create', 'Edit', 'Delete', 'View All Records', 'Modify All Records'];

      keys.forEach(function (key, idx) {
        var accurateSources = [];
        var status = 'Denied';
        
        res.crudSources.forEach(function (src) {
          if (src[key]) {
            status = 'Granted';
            var srcMeta = _state.sourceMap[src.permSetId];
            if (srcMeta) accurateSources.push('[' + srcMeta.type + '] ' + srcMeta.label);
          }
        });

        lines.push([
          res.objectName,
          labels[idx],
          status,
          accurateSources.join(' | ')
        ]);
      });

      var tabSources = res.tabSources.map(function (ts) {
        var meta = _state.sourceMap[ts.permSetId];
        return meta ? '[' + meta.type + '] ' + meta.label : ts.permSetId;
      });
      lines.push([
        res.objectName,
        'Tab Visibility',
        res.tabVisible ? 'Visible' : 'Hidden',
        tabSources.join(' | ')
      ]);
    });

    var csvContent = lines.map(function (row) { return row.map(csvEscape).join(','); }).join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'salesforce_permissions_matrix.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('CSV downloaded successfully!', 'success');
  }

  function exportExcel() {
    if (_state.analysisResults.length === 0) {
      toast('No data to export.', 'error');
      return;
    }
    if (!window.XLSX) {
      toast('SheetJS Engine missing.', 'error');
      return;
    }

    var wb = XLSX.utils.book_new();
    var summaryRows = [['Object Name', 'Read', 'Create', 'Edit', 'Delete', 'View All', 'Modify All', 'Tab Visible']];

    _state.analysisResults.forEach(function (res) {
      var summary = { read: false, create: false, edit: false, 'delete': false, viewAll: false, modifyAll: false };
      res.crudSources.forEach(function (src) {
        if (src.read) summary.read = true;
        if (src.create) summary.create = true;
        if (src.edit) summary.edit = true;
        if (src.delete) summary.delete = true;
        if (src.viewAll) summary.viewAll = true;
        if (src.modifyAll) summary.modifyAll = true;
      });

      summaryRows.push([
        res.objectName,
        summary.read ? 'Yes' : 'No',
        summary.create ? 'Yes' : 'No',
        summary.edit ? 'Yes' : 'No',
        summary.delete ? 'Yes' : 'No',
        summary.viewAll ? 'Yes' : 'No',
        summary.modifyAll ? 'Yes' : 'No',
        res.tabVisible ? 'Yes' : 'No'
      ]);
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Object Summary');

    _state.analysisResults.forEach(function (res) {
      var fieldPerms = _state.fieldPermsCache[res.objectName] || [];
      if (fieldPerms.length > 0) {
        var rolledFields = {};
        fieldPerms.forEach(function (f) {
          if (!rolledFields[f.field]) rolledFields[f.field] = { name: f.field, r: false, e: false };
          if (f.readable) rolledFields[f.field].r = true;
          if (f.editable) rolledFields[f.field].e = true;
        });

        var flsRows = [['Field API Name', 'Readable', 'Editable']];
        Object.keys(rolledFields).forEach(function (k) {
          var f = rolledFields[k];
          flsRows.push([f.name.replace(/^[^\.]+\./, ''), f.r ? 'Yes' : 'No', f.e ? 'Yes' : 'No']);
        });

        var sheetName = res.objectName.substring(0, 30);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(flsRows), sheetName);
      }
    });

    XLSX.writeFile(wb, 'salesforce_permissions_matrix.xlsx');
    toast('Excel Workbook generated successfully!', 'success');
  }

  // Global Binding
  window.SfPerms = { init: init };

})();