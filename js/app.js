/**
 * app.js
 * Main Orchestrator and UI Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // -- Theme Toggle Logic --
    const themeToggleBtn = document.getElementById('themeToggle');
    const sunIcon = themeToggleBtn.querySelector('.sun-icon');
    const moonIcon = themeToggleBtn.querySelector('.moon-icon');

    function toggleTheme() {
        const root = document.documentElement;
        if (root.getAttribute('data-theme') === 'light') {
            root.removeAttribute('data-theme');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
            localStorage.setItem('theme', 'dark');
        } else {
            root.setAttribute('data-theme', 'light');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
            localStorage.setItem('theme', 'light');
        }
    }

    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    }
    themeToggleBtn.addEventListener('click', toggleTheme);

    // -- State --
    let dataset1 = null;
    let dataset2 = null;
    let comparisonResults = null;

    // -- Initialization --
    Mapper.init();
    if (window.Formatter) Formatter.init();

    // -- Top Navigation Logic --
    const topNavBtns = document.querySelectorAll('.top-nav-btn');
    const apps = {
        'app-comparator': document.getElementById('app-comparator'),
        'app-formatter': document.getElementById('app-formatter')
    };

    topNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            
            // Update Active Button
            topNavBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Show target, hide others
            Object.keys(apps).forEach(id => {
                if (id === targetId) {
                    apps[id].classList.remove('hidden');
                } else {
                    apps[id].classList.add('hidden');
                }
            });
        });
    });

    // -- UI Elements --
    const elements = {
        input1: document.getElementById('input1'),
        input2: document.getElementById('input2'),
        badge1: document.getElementById('badge1'),
        badge2: document.getElementById('badge2'),
        preview1: document.getElementById('preview1'),
        preview2: document.getElementById('preview2'),
        table1: document.getElementById('table1'),
        table2: document.getElementById('table2'),
        clear1: document.getElementById('clear1'),
        clear2: document.getElementById('clear2'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        btnCompare: document.getElementById('btnCompare'),
        dropzone1: document.getElementById('dropzone1'),
        dropzone2: document.getElementById('dropzone2'),
        toastContainer: document.getElementById('toastContainer')
    };

    // -- Toast Notifications --
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = message;
        elements.toastContainer.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // -- Data Handling --
    function handleDataUpdate(panelNum, data) {
        if (!data || data.rows.length === 0) {
            clearData(panelNum);
            return;
        }

        if (panelNum === 1) dataset1 = data;
        else dataset2 = data;

        // Update UI
        const badge = panelNum === 1 ? elements.badge1 : elements.badge2;
        const dropzone = panelNum === 1 ? elements.dropzone1 : elements.dropzone2;
        const preview = panelNum === 1 ? elements.preview1 : elements.preview2;
        const table = panelNum === 1 ? elements.table1 : elements.table2;
        const clearBtn = panelNum === 1 ? elements.clear1 : elements.clear2;
        const overlay = dropzone.querySelector('.paste-overlay');
        const input = panelNum === 1 ? elements.input1 : elements.input2;

        badge.textContent = `${data.rows.length} rows detected`;
        overlay.classList.remove('hidden');
        dropzone.classList.add('has-data');
        input.classList.add('hidden'); // hide textarea when data is present
        clearBtn.classList.remove('hidden');

        renderPreviewTable(table, data);
        preview.classList.remove('hidden');

        checkReadyForMapping();
    }

    function clearData(panelNum) {
        if (panelNum === 1) dataset1 = null;
        else dataset2 = null;

        const badge = panelNum === 1 ? elements.badge1 : elements.badge2;
        const dropzone = panelNum === 1 ? elements.dropzone1 : elements.dropzone2;
        const preview = panelNum === 1 ? elements.preview1 : elements.preview2;
        const clearBtn = panelNum === 1 ? elements.clear1 : elements.clear2;
        const overlay = dropzone.querySelector('.paste-overlay');
        const input = panelNum === 1 ? elements.input1 : elements.input2;

        input.value = '';
        input.classList.remove('hidden');
        overlay.classList.add('hidden');
        dropzone.classList.remove('has-data');
        preview.classList.add('hidden');
        clearBtn.classList.add('hidden');

        elements.step2.classList.add('hidden');
        elements.step3.classList.add('hidden');
    }

    function renderPreviewTable(tableEl, data) {
        const thead = tableEl.querySelector('thead tr');
        const tbody = tableEl.querySelector('tbody');
        
        thead.innerHTML = '';
        tbody.innerHTML = '';

        // Headers
        data.headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            thead.appendChild(th);
        });

        // Rows (max 5)
        const previewRows = data.rows.slice(0, 5);
        previewRows.forEach(row => {
            const tr = document.createElement('tr');
            data.headers.forEach(h => {
                const td = document.createElement('td');
                td.textContent = row[h] || '';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    function checkReadyForMapping() {
        if (dataset1 && dataset2) {
            elements.step2.classList.remove('hidden');
            Mapper.updateHeaders(dataset1.headers, dataset2.headers);
            // scroll to step 2 smoothly
            setTimeout(() => elements.step2.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }

    // -- Event Listeners for Input --
    function setupInputEvents(inputEl, panelNum) {
        inputEl.addEventListener('input', () => {
            const text = inputEl.value;
            if (text.trim()) {
                try {
                    const data = DataParser.parse(text);
                    handleDataUpdate(panelNum, data);
                    showToast('Data parsed successfully', 'success');
                } catch (e) {
                    showToast('Failed to parse data', 'error');
                }
            }
        });
    }

    setupInputEvents(elements.input1, 1);
    setupInputEvents(elements.input2, 2);

    elements.clear1.addEventListener('click', () => clearData(1));
    elements.clear2.addEventListener('click', () => clearData(2));

    // -- Drag and Drop --
    function setupDragDrop(dropzone, panelNum) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            
            if (e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                DataParser.parseFile(file).then(data => {
                    handleDataUpdate(panelNum, data);
                    showToast(`File ${file.name} loaded`, 'success');
                }).catch(err => {
                    showToast(`Error reading file: ${err.message}`, 'error');
                });
            }
        });
    }

    setupDragDrop(elements.dropzone1, 1);
    setupDragDrop(elements.dropzone2, 2);

    // -- Compare Logic --
    elements.btnCompare.addEventListener('click', () => {
        const config = Mapper.getConfig();
        if (!config.lookupColumn1 || !config.lookupColumn2) {
            showToast('Please select lookup columns', 'warning');
            return;
        }

        elements.btnCompare.textContent = 'Comparing...';
        elements.btnCompare.disabled = true;

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            comparisonResults = Comparator.compare(dataset1, dataset2, config);
            renderResults(comparisonResults, config);
            
            elements.btnCompare.textContent = 'Run Comparison';
            elements.btnCompare.disabled = false;
            
            elements.step3.classList.remove('hidden');
            setTimeout(() => elements.step3.scrollIntoView({ behavior: 'smooth' }), 100);
            showToast('Comparison complete!', 'success');
        }, 100);
    });

    // -- Results Rendering --
    function renderResults(results, config) {
        // Update summary cards
        animateValue('valTotal1', results.summary.totalDs1);
        animateValue('valTotal2', results.summary.totalDs2);
        animateValue('valMatched', results.summary.matchedCount);
        animateValue('valChanged', results.summary.changedCount);
        animateValue('valMissingNew', results.summary.missingInDs2Count);
        animateValue('valNew', results.summary.missingInDs1Count);

        // Update Tab Badges
        document.getElementById('badgeChanged').textContent = results.summary.changedCount;
        document.getElementById('badgeMatched').textContent = results.summary.matchedCount;
        document.getElementById('badgeMissingNew').textContent = results.summary.missingInDs2Count;
        document.getElementById('badgeNew').textContent = results.summary.missingInDs1Count;

        // Render Tables
        renderChangedTable(results.changed, config.lookupColumn1);
        renderGenericTable('tableMatched', results.matched, [config.lookupColumn1, ...config.compareFields]);
        renderGenericTable('tableMissingNew', results.missingInDs2, dataset1.headers);
        renderGenericTable('tableNew', results.missingInDs1, dataset2.headers);
    }

    function animateValue(id, end) {
        const obj = document.getElementById(id);
        const duration = 1000;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * end);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function renderChangedTable(changed, lookupColumn) {
        const tbody = document.querySelector('#tableChanged tbody');
        document.getElementById('thChangedId').textContent = lookupColumn;
        tbody.innerHTML = '';

        changed.forEach(record => {
            record.differences.forEach((diff, index) => {
                const tr = document.createElement('tr');
                
                // Only show ID for the first difference of a record to group them visually
                const tdId = document.createElement('td');
                tdId.textContent = index === 0 ? record.key : '';
                tr.appendChild(tdId);

                const tdField = document.createElement('td');
                tdField.textContent = diff.field;
                tr.appendChild(tdField);

                const tdOld = document.createElement('td');
                tdOld.className = 'diff-old';
                tdOld.textContent = diff.oldValue;
                tr.appendChild(tdOld);

                const tdNew = document.createElement('td');
                tdNew.className = 'diff-new';
                tdNew.textContent = diff.newValue;
                tr.appendChild(tdNew);

                tbody.appendChild(tr);
            });
        });
    }

    function renderGenericTable(tableId, dataArray, headers) {
        const table = document.getElementById(tableId);
        const thead = table.querySelector('thead tr');
        const tbody = table.querySelector('tbody');
        
        thead.innerHTML = '';
        tbody.innerHTML = '';

        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            thead.appendChild(th);
        });

        dataArray.forEach(row => {
            const tr = document.createElement('tr');
            headers.forEach(h => {
                const td = document.createElement('td');
                // for generic tables, row object could have key + fields or just be the row
                td.textContent = row[h] !== undefined ? row[h] : (h === Mapper.getConfig().lookupColumn1 && row.key ? row.key : '');
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    // -- Tabs Logic --
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden', 'active')); // clean state
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // -- Export Logic --
    document.getElementById('exportCsv').addEventListener('click', () => {
        if (!comparisonResults) return;
        const config = Mapper.getConfig();
        const activeTab = document.querySelector('.tab-content.active').id;
        
        if (activeTab === 'tabChanged') {
            const formatted = Exporter.formatChangedRecords(comparisonResults.changed, config.lookupColumn1);
            Exporter.toCSV(formatted.headers, formatted.rows, 'changed_records.csv');
        } else if (activeTab === 'tabMatched') {
            const headers = [config.lookupColumn1, ...config.compareFields];
            const formatted = Exporter.formatRecords(comparisonResults.matched, headers);
            Exporter.toCSV(formatted.headers, formatted.rows, 'matched_records.csv');
        } else if (activeTab === 'tabMissingNew') {
            const formatted = Exporter.formatRecords(comparisonResults.missingInDs2, dataset1.headers);
            Exporter.toCSV(formatted.headers, formatted.rows, 'missing_in_new.csv');
        } else if (activeTab === 'tabNew') {
            const formatted = Exporter.formatRecords(comparisonResults.missingInDs1, dataset2.headers);
            Exporter.toCSV(formatted.headers, formatted.rows, 'new_records.csv');
        }
        showToast('CSV Exported Successfully', 'success');
    });

    document.getElementById('exportExcel').addEventListener('click', () => {
        if (!comparisonResults) return;
        const config = Mapper.getConfig();

        const changedFormatted = Exporter.formatChangedRecords(comparisonResults.changed, config.lookupColumn1);
        const matchedHeaders = [config.lookupColumn1, ...config.compareFields];
        const matchedFormatted = Exporter.formatRecords(comparisonResults.matched, matchedHeaders);
        const missingFormatted = Exporter.formatRecords(comparisonResults.missingInDs2, dataset1.headers);
        const newFormatted = Exporter.formatRecords(comparisonResults.missingInDs1, dataset2.headers);

        const sheetsData = [
            { name: 'Changed', headers: changedFormatted.headers, rows: changedFormatted.rows },
            { name: 'Matched', headers: matchedFormatted.headers, rows: matchedFormatted.rows },
            { name: 'Missing in New', headers: missingFormatted.headers, rows: missingFormatted.rows },
            { name: 'New in Dataset 2', headers: newFormatted.headers, rows: newFormatted.rows }
        ];

        Exporter.toExcel(sheetsData, 'Comparison_Results.xlsx');
        showToast('Excel Exported Successfully', 'success');
    });

});
