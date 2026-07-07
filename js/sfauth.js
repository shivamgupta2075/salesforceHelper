/**
 * sfauth.js
 * Salesforce Auth + REST API Client Module
 *
 * Handles OAuth 2.0 User-Agent flow, manual token entry, session persistence,
 * and authenticated REST API calls (SOQL, user search, object listing) with
 * auto-pagination for query results.
 *
 * Exposed as window.SfAuth
 */
(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────

  var STORAGE_KEY_CONFIG  = 'sfhelper_config';
  var STORAGE_KEY_SESSION = 'sfhelper_session';

  var DEFAULT_API_VERSION = '61.0';

  // ─── Internal State ─────────────────────────────────────────────────────

  var _token        = null;   // access token
  var _instanceUrl  = null;   // e.g. https://na123.salesforce.com
  var _apiVersion   = DEFAULT_API_VERSION;
  var _oauthWindow  = null;   // reference to opened OAuth popup

  // ─── Helpers ────────────────────────────────────────────────────────────

  function buildRestUrl(path) {
    return _instanceUrl + '/services/data/v' + _apiVersion + '/' + path;
  }

  /**
   * Makes an authenticated GET request and returns parsed JSON.
   * Appends ?q=<encoded> for SOQL queries passed via queryString param.
   *
   * @param {string} path      — REST API path (without /services/data/vXX.X/)
   * @param {string} [queryString] — optional query string (URL-encoded by caller)
   * @returns {Promise<object>}
   */
  function authenticatedGet(path, queryString) {
    var url = buildRestUrl(path);
    if (queryString) {
      url += '?' + queryString;
    }

    return fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + _token,
        'Content-Type': 'application/json'
      }
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (body) {
          var errMsg = (body && body.length > 0 && body[0].message)
            ? body[0].message
            : ('HTTP ' + res.status + ' ' + res.statusText);
          throw new Error(errMsg);
        }).catch(function (parseErr) {
          if (parseErr instanceof SyntaxError) {
            throw new Error('HTTP ' + res.status + ' ' + res.statusText);
          }
          throw parseErr;
        });
      }
      return res.json();
    });
  }

  // ─── OAuth Polling ──────────────────────────────────────────────────────

  function pollForOAuthResult() {
    return new Promise(function (resolve, reject) {
      var timeout = setTimeout(function () {
        window.removeEventListener('message', listener);
        if (_oauthWindow && !_oauthWindow.closed) {
          _oauthWindow.close();
        }
        _oauthWindow = null;
        reject(new Error('OAuth login timed out (2 minutes). Please try again.'));
      }, 120000); // 2 minutes

      function listener(event) {
        try {
          var data = event.data;
          if (data && data.source === 'salesforce-helper-oauth' && data.accessToken) {
            clearTimeout(timeout);
            window.removeEventListener('message', listener);
            if (_oauthWindow && !_oauthWindow.closed) {
              _oauthWindow.close();
            }
            _oauthWindow = null;
            resolve({ accessToken: data.accessToken, instanceUrl: data.instanceUrl });
          }
        } catch (e) {
          // ignore cross-origin messages
        }
      }

      window.addEventListener('message', listener, false);

      // Also check sessionStorage fallback every 500ms in case postMessage fails
      var storageCheck = setInterval(function () {
        var token = sessionStorage.getItem('sfhelper_oauth_token');
        if (token) {
          var inst = sessionStorage.getItem('sfhelper_oauth_instance') || 'https://login.salesforce.com';
          sessionStorage.removeItem('sfhelper_oauth_token');
          sessionStorage.removeItem('sfhelper_oauth_instance');
          clearInterval(storageCheck);
          clearTimeout(timeout);
          window.removeEventListener('message', listener);
          if (_oauthWindow && !_oauthWindow.closed) {
            _oauthWindow.close();
          }
          _oauthWindow = null;
          resolve({ accessToken: token, instanceUrl: inst });
        }
      }, 500);

      // Clean up storage check on timeout
      var origTimeout = timeout;
      var origClear = clearTimeout.bind(null, timeout);
      // We need to clear interval on rejection too; handle via the timeout
      var rejectAndCleanup = function (err) {
        clearInterval(storageCheck);
        window.removeEventListener('message', listener);
        if (_oauthWindow && !_oauthWindow.closed) _oauthWindow.close();
        _oauthWindow = null;
        reject(err);
      };

      // Override timeout
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        rejectAndCleanup(new Error('OAuth login timed out (2 minutes). Please try again.'));
      }, 120000);
    });
  }

  // ─── Session Persistence ────────────────────────────────────────────────

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (raw) {
        var session = JSON.parse(raw);
        if (session.token && session.instanceUrl) {
          _token       = session.token;
          _instanceUrl = session.instanceUrl;
          return true;
        }
      }
    } catch (e) {
      // corrupted session data
    }
    return false;
  }

  function saveSession() {
    try {
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({
        token:       _token,
        instanceUrl: _instanceUrl,
        apiVersion:  _apiVersion
      }));
    } catch (e) {
      // sessionStorage unavailable
    }
  }

  function clearSession() {
    _token       = null;
    _instanceUrl = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY_SESSION);
    } catch (e) {
      // ignore
    }
  }

  // Load any persisted session on module init
  loadSession();

  // ─── Public API ─────────────────────────────────────────────────────────

  var SfAuth = {

    // ── Config ────────────────────────────────────────────────────────────

    /**
     * Returns the saved Connected App config from localStorage.
     * @returns {{ clientId: string, isSandbox: boolean }}
     */
    getConfig: function () {
      try {
        var raw = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (e) {
        // ignore
      }
      return { clientId: '', isSandbox: false };
    },

    /**
     * Saves the Connected App config to localStorage.
     * @param {string} clientId
     * @param {boolean} isSandbox
     */
    saveConfig: function (clientId, isSandbox) {
      try {
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({
          clientId:  clientId || '',
          isSandbox: !!isSandbox
        }));
      } catch (e) {
        // ignore
      }
    },

    // ── Session ───────────────────────────────────────────────────────────

    /** @returns {boolean} */
    isAuthenticated: function () {
      return !!_token && !!_instanceUrl;
    },

    /** @returns {string|null} */
    getToken: function () {
      return _token;
    },

    /** @returns {string|null} */
    getInstanceUrl: function () {
      return _instanceUrl;
    },

    // ── OAuth Connect ─────────────────────────────────────────────────────

    /**
     * Initiates the OAuth 2.0 User-Agent flow in a popup window.
     *
     * @param {string}  clientId   — Connected App consumer key
     * @param {boolean} isSandbox  — whether to use test.salesforce.com
     * @returns {Promise<{ accessToken: string, instanceUrl: string }>}
     */
    connect: function (clientId, isSandbox) {
      if (!clientId) {
        return Promise.reject(new Error('Client ID (Consumer Key) is required.'));
      }

      var loginBase = isSandbox
        ? 'https://test.salesforce.com'
        : 'https://login.salesforce.com';

      // Build the callback URL: same origin as the app, path /oauth_callback.html
      var callbackUrl = window.location.origin + '/oauth_callback.html';

      var authUrl =
        loginBase + '/services/oauth2/authorize' +
        '?response_type=token' +
        '&client_id=' + encodeURIComponent(clientId) +
        '&redirect_uri=' + encodeURIComponent(callbackUrl);

      // Open popup
      var width  = 600;
      var height = 700;
      var left   = window.screenX + (window.outerWidth  - width)  / 2;
      var top    = window.screenY + (window.outerHeight - height) / 2;
      var features =
        'width=' + width +
        ',height=' + height +
        ',left=' + left +
        ',top=' + top +
        ',toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes';

      _oauthWindow = window.open(authUrl, 'sfhelper_oauth', features);

      if (!_oauthWindow || _oauthWindow.closed) {
        throw new Error(
          'Popup blocked. Please allow popups for this site, or use the Manual Token option.'
        );
      }

      return pollForOAuthResult().then(function (result) {
        _token       = result.accessToken;
        _instanceUrl = result.instanceUrl;
        saveSession();
        return result;
      });
    },

    // ── Manual Token Connect ─────────────────────────────────────────────

    /**
     * Connects using a manually-entered access token and instance URL.
     *
     * @param {string} token       — Salesforce session ID / access token
     * @param {string} instanceUrl — e.g. https://na123.salesforce.com
     * @returns {Promise<boolean>}
     */
    connectManual: function (token, instanceUrl) {
      if (!token) {
        return Promise.reject(new Error('Access token is required.'));
      }
      if (!instanceUrl) {
        return Promise.reject(new Error('Instance URL is required.'));
      }

      // Validate by hitting the identity endpoint
      var tempInstance = instanceUrl.replace(/\/+$/, '');
      var url = tempInstance + '/services/data/v' + DEFAULT_API_VERSION + '/limits';

      return fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      }).then(function (res) {
        if (!res.ok) {
          throw new Error('Invalid token or instance URL. Server returned ' + res.status + '.');
        }
        _token       = token;
        _instanceUrl = tempInstance;
        saveSession();
        return true;
      });
    },

    // ── Disconnect ────────────────────────────────────────────────────────

    /** Clears the current session and returns to the connect panel. */
    disconnect: function () {
      clearSession();
    },

    // ── SOQL Query with Auto-Pagination ───────────────────────────────────

    /**
     * Executes a SOQL query and returns all records (auto-paginating through
     * `nextRecordsUrl` until the full result set is retrieved).
     *
     * @param {string} soql — The SOQL query string
     * @returns {Promise<object[]>} Flat array of record objects
     */
    query: function (soql) {
      if (!_token) {
        return Promise.reject(new Error('Not authenticated.'));
      }

      var allRecords = [];

      return authenticatedGet('query', 'q=' + encodeURIComponent(soql)).then(function processPage(data) {
        if (data.records && data.records.length > 0) {
          allRecords = allRecords.concat(data.records);
        }

        if (data.nextRecordsUrl) {
          // nextRecordsUrl is a full path like /services/data/v61.0/query/01g...
          var nextUrl = _instanceUrl + data.nextRecordsUrl;
          return fetch(nextUrl, {
            method: 'GET',
            headers: {
              'Authorization': 'Bearer ' + _token,
              'Content-Type': 'application/json'
            }
          }).then(function (res) {
            if (!res.ok) {
              throw new Error('Pagination failed: HTTP ' + res.status);
            }
            return res.json();
          }).then(processPage);
        }

        return allRecords;
      });
    },

    /**
     * Searches for users by name (debounced externally by the caller).
     *
     * @param {string} searchTerm
     * @returns {Promise<Array<{ id: string, name: string, username: string }>>}
     */
    searchUsers: function (searchTerm) {
      if (!_token) {
        return Promise.reject(new Error('Not authenticated.'));
      }
      if (!searchTerm || searchTerm.trim().length < 2) {
        return Promise.resolve([]);
      }

      var term = searchTerm.trim().replace(/'/g, "\\'");
      var soql =
        "SELECT Id, Name, Username, IsActive " +
        "FROM User " +
        "WHERE IsActive = true AND Name LIKE '%" + term + "%' " +
        "ORDER BY Name ASC LIMIT 25";

      return this.query(soql).then(function (records) {
        return records.map(function (r) {
          return {
            id:       r.Id,
            name:     r.Name,
            username: r.Username
          };
        });
      });
    },

    /**
     * Loads all accessible Salesforce objects (EntityDefinition) for the org.
     *
     * @returns {Promise<Array<{ name: string, label: string, qualifiedApiName: string }>>}
     */
    loadObjects: function () {
      if (!_token) {
        return Promise.reject(new Error('Not authenticated.'));
      }

      var soql =
        "SELECT QualifiedApiName, Label, DurableId " +
        "FROM EntityDefinition " +
        "WHERE IsQueryable = true AND IsCustomizable = true " +
        "ORDER BY QualifiedApiName ASC LIMIT 500";

      return this.query(soql).then(function (records) {
        return records.map(function (r) {
          return {
            name:             r.QualifiedApiName,
            label:            r.Label,
            qualifiedApiName: r.QualifiedApiName
          };
        });
      });
    }
  };

  // Expose as global
  window.SfAuth = SfAuth;
})();
