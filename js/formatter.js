/**
 * formatter.js
 * Handles the logic for the SOQL Data Formatter tab
 */

(function() {
    'use strict';

    const Formatter = {
        state: {
            rawData: null, // { headers: [], rows: [] }
            selectedColumns: new Set(),
            processedResult: [], // Array of formatted strings
            debounceTimer: null
        },

        elements: {},

        init() {
            this.cacheElements();
            this.bindEvents();
        },

        cacheElements() {
            this.elements = {
                input: document.getElementById('inputFmt'),
                dropzone: document.getElementById('dropzoneFmt'),
                badge: document.getElementById('badgeFmt'),
                clearBtn: document.getElementById('clearFmt'),
                workspace: document.getElementById('formatter-workspace'),
                columnsContainer: document.getElementById('fmtColumns'),
                chkHeaders: document.getElementById('fmtIncludeHeaders'),
                chkAlign: document.getElementById('fmtAlignColumns'),
                colDelimiter: document.getElementById('fmtColDelimiter'),
                
                // Controls
                wrapper: document.getElementById('fmtWrapper'),
                wrapperCustom: document.getElementById('fmtWrapperCustom'),
                wrapStart: document.getElementById('fmtWrapStart'),
                wrapEnd: document.getElementById('fmtWrapEnd'),
                
                separator: document.getElementById('fmtSeparator'),
                separatorCustom: document.getElementById('fmtSeparatorCustom'),
                sepText: document.getElementById('fmtSepText'),
                
                rmPrefix: document.getElementById('fmtRemovePrefix'),
                rmSuffix: document.getElementById('fmtRemoveSuffix'),
                rmFirstN: document.getElementById('fmtRemoveFirstN'),
                rmLastN: document.getElementById('fmtRemoveLastN'),
                replaceFind: document.getElementById('fmtReplaceFind'),
                replaceWith: document.getElementById('fmtReplaceWith'),
                
                chkTrim: document.getElementById('fmtTrim'),
                chkRmSpaces: document.getElementById('fmtRemoveSpaces'),
                chkRmBlank: document.getElementById('fmtRemoveBlank'),
                chkRmDupes: document.getElementById('fmtRemoveDupes'),
                chkRmSpecial: document.getElementById('fmtRemoveSpecial'),
                
                casing: document.getElementById('fmtCasing'),
                sort: document.getElementById('fmtSort'),
                
                // Output
                output: document.getElementById('fmtOutput'),
                previewNote: document.getElementById('fmtPreviewNote'),
                btnCopy: document.getElementById('fmtCopyBtn'),
                btnCopyExcel: document.getElementById('fmtCopyExcelBtn'),
                btnCsv: document.getElementById('fmtExportCsv'),
                btnTxt: document.getElementById('fmtExportTxt'),
                btnExcel: document.getElementById('fmtExportExcel')
            };
        },

        bindEvents() {
            // Input Handling
            this.elements.input.addEventListener('input', () => {
                const text = this.elements.input.value;
                if (text.trim()) {
                    try {
                        const data = DataParser.parse(text);
                        this.handleDataLoaded(data);
                    } catch (e) {
                        console.error('Formatter parse error', e);
                    }
                }
            });

            this.elements.clearBtn.addEventListener('click', () => this.clearData());

            // Drag and Drop
            this.elements.dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.elements.dropzone.classList.add('drag-over');
            });
            this.elements.dropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                this.elements.dropzone.classList.remove('drag-over');
            });
            this.elements.dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.elements.dropzone.classList.remove('drag-over');
                if (e.dataTransfer.files.length > 0) {
                    DataParser.parseFile(e.dataTransfer.files[0]).then(data => {
                        this.handleDataLoaded(data);
                    });
                }
            });

            // Control change listeners (Reactivity)
            const controls = [
                this.elements.wrapper, this.elements.wrapStart, this.elements.wrapEnd,
                this.elements.separator, this.elements.sepText,
                this.elements.rmPrefix, this.elements.rmSuffix,
                this.elements.rmFirstN, this.elements.rmLastN,
                this.elements.replaceFind, this.elements.replaceWith,
                this.elements.chkTrim, this.elements.chkRmSpaces,
                this.elements.chkRmBlank, this.elements.chkRmDupes,
                this.elements.chkRmSpecial, this.elements.casing, this.elements.sort,
                this.elements.chkHeaders, this.elements.chkAlign, this.elements.colDelimiter
            ];

            controls.forEach(ctrl => {
                if(ctrl) ctrl.addEventListener('input', () => this.triggerProcess());
            });

            // Toggles for Custom Inputs
            this.elements.wrapper.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    this.elements.wrapperCustom.classList.remove('hidden');
                } else {
                    this.elements.wrapperCustom.classList.add('hidden');
                }
            });

            this.elements.separator.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    this.elements.separatorCustom.classList.remove('hidden');
                } else {
                    this.elements.separatorCustom.classList.add('hidden');
                }
            });

            // Exports
            this.elements.btnCopy.addEventListener('click', () => this.copyToClipboard());
            this.elements.btnCopyExcel.addEventListener('click', () => this.copyForExcel());
            this.elements.btnTxt.addEventListener('click', () => this.downloadFile('txt'));
            this.elements.btnCsv.addEventListener('click', () => this.downloadFile('csv'));
            this.elements.btnExcel.addEventListener('click', () => this.downloadExcel());
        },

        handleDataLoaded(data) {
            if (!data || data.rows.length === 0) return;
            
            this.state.rawData = data;
            
            // UI Updates
            this.elements.badge.textContent = `${data.rows.length} rows detected`;
            this.elements.badge.parentElement.classList.remove('hidden');
            // Keep the input visible so user can see pasted data, just add clear button
            this.elements.clearBtn.classList.remove('hidden');
            this.elements.workspace.classList.remove('hidden');
            
            this.renderColumns(data.headers);
            this.triggerProcess();
        },

        clearData() {
            this.state.rawData = null;
            this.state.selectedColumns.clear();
            this.elements.input.value = '';
            this.elements.badge.parentElement.classList.add('hidden');
            this.elements.clearBtn.classList.add('hidden');
            this.elements.workspace.classList.add('hidden');
            this.elements.columnsContainer.innerHTML = '';
            this.elements.output.value = '';
        },

        renderColumns(headers) {
            this.elements.columnsContainer.innerHTML = '';
            this.state.selectedColumns.clear();
            
            // Auto-select first column
            if (headers.length > 0) {
                this.state.selectedColumns.add(headers[0]);
            }

            headers.forEach(header => {
                const label = document.createElement('label');
                label.className = 'checkbox-item';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = header;
                checkbox.checked = this.state.selectedColumns.has(header);
                
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.state.selectedColumns.add(header);
                    } else {
                        this.state.selectedColumns.delete(header);
                    }
                    this.triggerProcess();
                });

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(header));
                this.elements.columnsContainer.appendChild(label);
            });
        },

        triggerProcess() {
            clearTimeout(this.state.debounceTimer);
            this.state.debounceTimer = setTimeout(() => {
                this.processData();
            }, 150); // 150ms debounce for performance
        },

        processData() {
            if (!this.state.rawData) return;

            const cols = Array.from(this.state.selectedColumns);
            if (cols.length === 0) {
                this.elements.output.value = 'Please select at least one column.';
                return;
            }

            const config = this.getCleanupConfig();
            
            // 1. Extraction with alignment
            let extracted = [];
            
            // Calculate column max widths if alignment is checked
            const colWidths = {};
            if (config.alignColumns) {
                cols.forEach(c => {
                    let maxLen = c.length; // Include header in calculation
                    for (let i = 0; i < this.state.rawData.rows.length; i++) {
                        const valStr = (this.state.rawData.rows[i][c] || '').toString();
                        if (valStr.length > maxLen) {
                            maxLen = valStr.length;
                        }
                    }
                    colWidths[c] = maxLen;
                });
            }
            
            // Optional: Include Headers
            if (config.includeHeaders) {
                if (config.alignColumns) {
                    const paddedHeaders = cols.map(c => c.padEnd(colWidths[c], ' '));
                    extracted.push(paddedHeaders.join(config.colDelimiter));
                } else {
                    extracted.push(cols.join(config.colDelimiter));
                }
            }
            
            for (let i = 0; i < this.state.rawData.rows.length; i++) {
                const row = this.state.rawData.rows[i];
                let val = '';
                if (config.alignColumns) {
                    val = cols.map(c => {
                        const str = (row[c] || '').toString();
                        return str.padEnd(colWidths[c], ' ');
                    }).join(config.colDelimiter);
                } else {
                    val = cols.map(c => row[c] || '').join(config.colDelimiter);
                }
                extracted.push(val);
            }

            // 2. Cleanup Pipeline
            let processed = [];
            
            for (let i = 0; i < extracted.length; i++) {
                let val = extracted[i];
                
                if (config.trim) val = val.trim();
                if (config.rmSpaces) val = val.replace(/\s+/g, '');
                if (config.rmSpecial) val = val.replace(/[^a-zA-Z0-9 _-]/g, '');
                
                if (config.rmPrefix && val.startsWith(config.rmPrefix)) {
                    val = val.substring(config.rmPrefix.length);
                }
                if (config.rmSuffix && val.endsWith(config.rmSuffix)) {
                    val = val.substring(0, val.length - config.rmSuffix.length);
                }
                
                if (config.rmFirstN > 0) val = val.substring(config.rmFirstN);
                if (config.rmLastN > 0) val = val.substring(0, val.length - config.rmLastN);
                
                if (config.replaceFind) {
                    // Global replace
                    val = val.split(config.replaceFind).join(config.replaceWith);
                }
                
                if (config.casing === 'upper') val = val.toUpperCase();
                if (config.casing === 'lower') val = val.toLowerCase();
                
                // Exclude blank rows if checked
                if (config.rmBlank && val.length === 0) continue;
                
                processed.push(val);
            }

            // 3. Remove Duplicates
            if (config.rmDupes) {
                processed = [...new Set(processed)];
            }

            // 4. Sorting
            if (config.sort === 'asc') {
                processed.sort((a, b) => a.localeCompare(b));
            } else if (config.sort === 'desc') {
                processed.sort((a, b) => b.localeCompare(a));
            } else if (config.sort === 'reverse') {
                processed.reverse();
            }

            this.state.processedResult = processed;

            // 5. Render Preview (Limit to 5000 rows to prevent DOM freeze)
            this.renderPreview();
        },

        getCleanupConfig() {
            return {
                trim: this.elements.chkTrim.checked,
                rmSpaces: this.elements.chkRmSpaces.checked,
                rmBlank: this.elements.chkRmBlank.checked,
                rmDupes: this.elements.chkRmDupes.checked,
                rmSpecial: this.elements.chkRmSpecial.checked,
                rmPrefix: this.elements.rmPrefix.value,
                rmSuffix: this.elements.rmSuffix.value,
                rmFirstN: parseInt(this.elements.rmFirstN.value) || 0,
                rmLastN: parseInt(this.elements.rmLastN.value) || 0,
                replaceFind: this.elements.replaceFind.value,
                replaceWith: this.elements.replaceWith.value,
                casing: this.elements.casing.value,
                sort: this.elements.sort.value,
                wrapper: this.elements.wrapper.value,
                wrapStart: this.elements.wrapStart.value,
                wrapEnd: this.elements.wrapEnd.value,
                separator: this.elements.separator.value,
                sepText: this.elements.sepText.value,
                includeHeaders: this.elements.chkHeaders.checked,
                alignColumns: this.elements.chkAlign.checked,
                colDelimiter: this.elements.colDelimiter.value || ' '
            };
        },

        buildFinalString(limit = null) {
            const config = this.getCleanupConfig();
            let data = this.state.processedResult;
            
            if (limit && data.length > limit) {
                data = data.slice(0, limit);
                this.elements.previewNote.textContent = `Showing preview of ${limit.toLocaleString()} / ${this.state.processedResult.length.toLocaleString()} rows`;
            } else {
                this.elements.previewNote.textContent = `${this.state.processedResult.length.toLocaleString()} rows`;
            }

            // Apply Wrappers
            let wrappedData = data;
            
            if (config.wrapper === 'soql') {
                wrappedData = data.map(v => `'${v}'`);
            } else if (config.wrapper === 'single') {
                wrappedData = data.map(v => `'${v}'`);
            } else if (config.wrapper === 'double') {
                wrappedData = data.map(v => `"${v}"`);
            } else if (config.wrapper === 'custom') {
                wrappedData = data.map(v => `${config.wrapStart}${v}${config.wrapEnd}`);
            }

            // Apply Separator
            let sep = '\n';
            if (config.separator === 'comma') sep = ',';
            else if (config.separator === 'semicolon') sep = ';';
            else if (config.separator === 'space') sep = ' ';
            else if (config.separator === 'custom') sep = config.sepText;
            
            let finalString = wrappedData.join(sep);
            
            // SOQL Special Formatting
            if (config.wrapper === 'soql') {
                if (config.separator === 'newline') {
                    finalString = `(\n${wrappedData.join(',\n')}\n)`;
                } else {
                    finalString = `(${wrappedData.join(',')})`;
                }
            }

            return finalString;
        },

        renderPreview() {
            // Render max 5000 rows to DOM
            const previewText = this.buildFinalString(5000);
            this.elements.output.value = previewText;
        },

        copyToClipboard() {
            if (this.state.processedResult.length === 0) return;
            const fullText = this.buildFinalString(); // No limit
            navigator.clipboard.writeText(fullText).then(() => {
                if (window.showToast) window.showToast('Copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Copy failed', err);
            });
        },
        
        copyForExcel() {
            if (!this.state.rawData || this.state.processedResult.length === 0) return;
            const cols = Array.from(this.state.selectedColumns);
            const config = this.getCleanupConfig();
            
            let htmlRows = [];
            let tsvRows = [];
            
            if (config.includeHeaders) {
                tsvRows.push(cols.join('\t'));
                htmlRows.push('<tr>' + cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('') + '</tr>');
            }
            
            let processedRows = [];
            for (let i = 0; i < this.state.rawData.rows.length; i++) {
                const row = this.state.rawData.rows[i];
                let cells = cols.map(c => {
                    let val = (row[c] || '').toString();
                    if (config.trim) val = val.trim();
                    if (config.rmSpaces) val = val.replace(/\s+/g, '');
                    if (config.rmSpecial) val = val.replace(/[^a-zA-Z0-9 _-]/g, '');
                    if (config.casing === 'upper') val = val.toUpperCase();
                    if (config.casing === 'lower') val = val.toLowerCase();
                    if (config.rmPrefix && val.startsWith(config.rmPrefix)) val = val.substring(config.rmPrefix.length);
                    if (config.rmSuffix && val.endsWith(config.rmSuffix)) val = val.substring(0, val.length - config.rmSuffix.length);
                    if (config.replaceFind) val = val.split(config.replaceFind).join(config.replaceWith);
                    return val;
                });
                
                if (config.rmBlank && cells.join('').length === 0) continue;
                processedRows.push(cells);
            }
            
            if (config.rmDupes) {
                const seen = new Set();
                processedRows = processedRows.filter(cells => {
                    const str = cells.join('\t');
                    if (seen.has(str)) return false;
                    seen.add(str);
                    return true;
                });
            }
            
            if (config.sort === 'asc') {
                processedRows.sort((a,b) => a[0].localeCompare(b[0]));
            } else if (config.sort === 'desc') {
                processedRows.sort((a,b) => b[0].localeCompare(a[0]));
            } else if (config.sort === 'reverse') {
                processedRows.reverse();
            }

            processedRows.forEach(cells => {
                tsvRows.push(cells.join('\t'));
                htmlRows.push('<tr>' + cells.map(c => `<td>${this.escapeHtml(c)}</td>`).join('') + '</tr>');
            });

            const htmlContent = `<table>${htmlRows.join('')}</table>`;
            const textContent = tsvRows.join('\n');

            if (navigator.clipboard && navigator.clipboard.write) {
                const blobHtml = new Blob([htmlContent], { type: 'text/html' });
                const blobText = new Blob([textContent], { type: 'text/plain' });
                
                navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': blobHtml,
                        'text/plain': blobText
                    })
                ]).then(() => {
                    if (window.showToast) window.showToast('Copied for Excel!', 'success');
                }).catch(err => {
                    console.error('HTML Copy failed, falling back to text', err);
                    this.fallbackCopy(textContent);
                });
            } else {
                this.fallbackCopy(textContent);
            }
        },

        escapeHtml(unsafe) {
            return (unsafe || '').toString()
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        },

        fallbackCopy(text) {
            navigator.clipboard.writeText(text).then(() => {
                if (window.showToast) window.showToast('Copied for Excel (Text Mode)!', 'success');
            }).catch(err => console.error('Fallback copy failed', err));
        },

        downloadFile(type) {
            if (this.state.processedResult.length === 0) return;
            const fullText = this.buildFinalString(); // No limit
            
            const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `formatted_data.${type}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            if (window.showToast) window.showToast(`Downloaded ${type.toUpperCase()}`, 'success');
        },
        
        downloadExcel() {
            if (!window.Exporter || !window.Exporter.toExcel) {
                if (window.showToast) window.showToast('Excel exporter not found', 'error');
                return;
            }
            
            if (this.state.processedResult.length === 0) return;
            const fullText = this.buildFinalString();
            
            // Since this is processed text, we'll export it as a single-column Excel sheet
            const rows = fullText.split('\n').map(line => {
                return { 'Formatted Output': line };
            });
            
            const sheetsData = [{
                name: 'Formatted Data',
                headers: ['Formatted Output'],
                rows: rows
            }];
            
            window.Exporter.toExcel(sheetsData, 'formatted_data.xlsx');
            if (window.showToast) window.showToast('Downloaded EXCEL', 'success');
        }
    };

    window.Formatter = Formatter;
})();
