(function() {
    'use strict';
    const Formatter = {
        state: { rawData: null, selectedColumns: new Set(), processedResult: [], debounceTimer: null },
        elements: {},
        init() { this.cacheElements(); this.bindEvents(); },
        cacheElements() {
            this.elements = {
                input: document.getElementById('inputFmt'),
                dropzone: document.getElementById('dropzoneFmt'),
                badge: document.getElementById('badgeFmt'),
                clearBtn: document.getElementById('clearFmt'),
                workspace: document.getElementById('formatter-workspace'),
                output: document.getElementById('fmtOutput'),
                btnCopy: document.getElementById('fmtCopyBtn'),
                btnExcel: document.getElementById('fmtExportExcel')
            };
        },
        bindEvents() {
            this.elements.input.addEventListener('input', () => {
                const text = this.elements.input.value;
                if (text.trim()) {
                    try { this.handleDataLoaded(DataParser.parse(text)); }
                    catch (e) { console.error(e); }
                }
            });
            this.elements.clearBtn.addEventListener('click', () => this.clearData());
            this.elements.btnCopy.addEventListener('click', () => this.copyToClipboard());
        },
        handleDataLoaded(data) {
            if (!data || data.rows.length === 0) return;
            this.state.rawData = data;
            this.elements.badge.textContent = `${data.rows.length} rows`;
            this.elements.clearBtn.classList.remove('hidden');
            this.elements.workspace.classList.remove('hidden');
        },
        clearData() {
            this.state.rawData = null;
            this.elements.input.value = '';
            this.elements.clearBtn.classList.add('hidden');
            this.elements.workspace.classList.add('hidden');
            this.elements.output.value = '';
        },
        copyToClipboard() {
            if (this.state.rawData) {
                navigator.clipboard.writeText(this.elements.output.value);
                if (window.showToast) window.showToast('Copied!', 'success');
            }
        }
    };
    window.Formatter = Formatter;
})();