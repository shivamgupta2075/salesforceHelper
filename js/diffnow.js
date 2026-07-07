/**
 * diffnow.js
 * Code Diff Engine — Line-by-line comparison using LCS (Longest Common Subsequence)
 * Supports: Unified view, Split view, Copy, Stats bar
 */

(function () {
    'use strict';

    // ─── LCS Algorithm ──────────────────────────────────────────────────────────
    function lcsTable(a, b) {
        const m = a.length, n = b.length;
        const dp = new Array(m + 1);
        for (let i = 0; i <= m; i++) dp[i] = new Uint32Array(n + 1);
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp;
    }

    function computeDiff(oldLines, newLines) {
        const dp = lcsTable(oldLines, newLines);
        const ops = [];
        let i = oldLines.length, j = newLines.length;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                ops.push({ type: 'equal', oldLine: i, newLine: j, text: oldLines[i - 1] });
                i--; j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                ops.push({ type: 'add', oldLine: null, newLine: j, text: newLines[j - 1] });
                j--;
            } else {
                ops.push({ type: 'remove', oldLine: i, newLine: null, text: oldLines[i - 1] });
                i--;
            }
        }
        ops.reverse();
        return ops;
    }

    function escHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderUnified(ops, container) {
        container.innerHTML = '';
        if (ops.length === 0) {
            container.innerHTML = '<div class="diff-empty-state"><span class="empty-icon">✅</span><p>Files are identical — no differences found.</p></div>';
            return;
        }
        const frag = document.createDocumentFragment();
        ops.forEach(op => {
            const row = document.createElement('div');
            let cls, sign, lineNum;
            if (op.type === 'add')    { cls = 'added';   sign = '+'; lineNum = op.newLine; }
            else if (op.type === 'remove') { cls = 'removed'; sign = '−'; lineNum = op.oldLine; }
            else                      { cls = 'context'; sign = '';  lineNum = op.oldLine; }
            row.className = 'diff-row ' + cls;
            row.innerHTML = '<span class="diff-line-num">' + lineNum + '</span><span class="diff-line-sign">' + sign + '</span><span class="diff-line-code">' + escHtml(op.text) + '</span>';
            frag.appendChild(row);
        });
        container.appendChild(frag);
    }

    function renderSplit(ops, container) {
        container.innerHTML = '';
        if (ops.length === 0) {
            container.innerHTML = '<div class="diff-empty-state"><span class="empty-icon">✅</span><p>Files are identical — no differences found.</p></div>';
            return;
        }
        const frag = document.createDocumentFragment();
        let i = 0;
        while (i < ops.length) {
            const op = ops[i];
            if (op.type === 'equal') {
                const row = document.createElement('div');
                row.className = 'diff-split-row';
                row.innerHTML =
                    '<div class="diff-split-cell old-cell unchanged"><span class="diff-line-num">' + op.oldLine + '</span><span class="diff-line-code">' + escHtml(op.text) + '</span></div>' +
                    '<div class="diff-split-cell new-cell unchanged"><span class="diff-line-num">' + op.newLine + '</span><span class="diff-line-code">' + escHtml(op.text) + '</span></div>';
                frag.appendChild(row);
                i++;
            } else if (op.type === 'remove') {
                const removes = [];
                while (i < ops.length && ops[i].type === 'remove') { removes.push(ops[i]); i++; }
                const adds = [];
                while (i < ops.length && ops[i].type === 'add') { adds.push(ops[i]); i++; }
                const maxLen = Math.max(removes.length, adds.length);
                for (let k = 0; k < maxLen; k++) {
                    const rem = removes[k];
                    const add = adds[k];
                    const row = document.createElement('div');
                    row.className = 'diff-split-row';
                    const leftHtml = rem
                        ? '<div class="diff-split-cell old-cell old-removed"><span class="diff-line-num">' + rem.oldLine + '</span><span class="diff-line-code">' + escHtml(rem.text) + '</span></div>'
                        : '<div class="diff-split-cell old-cell empty"><span class="diff-line-num"></span><span class="diff-line-code"> </span></div>';
                    const rightHtml = add
                        ? '<div class="diff-split-cell new-cell new-added"><span class="diff-line-num">' + add.newLine + '</span><span class="diff-line-code">' + escHtml(add.text) + '</span></div>'
                        : '<div class="diff-split-cell new-cell empty"><span class="diff-line-num"></span><span class="diff-line-code"> </span></div>';
                    row.innerHTML = leftHtml + rightHtml;
                    frag.appendChild(row);
                }
            } else if (op.type === 'add') {
                const row = document.createElement('div');
                row.className = 'diff-split-row';
                row.innerHTML =
                    '<div class="diff-split-cell old-cell empty"><span class="diff-line-num"></span><span class="diff-line-code"> </span></div>' +
                    '<div class="diff-split-cell new-cell new-added"><span class="diff-line-num">' + op.newLine + '</span><span class="diff-line-code">' + escHtml(op.text) + '</span></div>';
                frag.appendChild(row);
                i++;
            } else { i++; }
        }
        container.appendChild(frag);
    }

    function computeStats(ops) {
        let added = 0, removed = 0, unchanged = 0;
        ops.forEach(op => {
            if (op.type === 'add') added++;
            else if (op.type === 'remove') removed++;
            else unchanged++;
        });
        return { added, removed, unchanged };
    }

    function diffToText(ops) {
        return ops.map(op => {
            if (op.type === 'add') return '+ ' + op.text;
            if (op.type === 'remove') return '- ' + op.text;
            return '  ' + op.text;
        }).join('\n');
    }

    function init() {
        const oldCodeEl     = document.getElementById('diffOldCode');
        const newCodeEl     = document.getElementById('diffNewCode');
        const btnCompare    = document.getElementById('btnDiffCompare');
        const btnClearOld   = document.getElementById('diffClearOld');
        const btnClearNew   = document.getElementById('diffClearNew');
        const resultsEl     = document.getElementById('diffResults');
        const unifiedBody   = document.getElementById('diffUnifiedBody');
        const splitBody     = document.getElementById('diffSplitBody');
        const unifiedView   = document.getElementById('diffUnifiedView');
        const splitView     = document.getElementById('diffSplitView');
        const btnUnified    = document.getElementById('diffViewUnified');
        const btnSplit      = document.getElementById('diffViewSplit');
        const btnCopy       = document.getElementById('diffCopyBtn');
        const statAdded     = document.getElementById('diffStatAdded');
        const statRemoved   = document.getElementById('diffStatRemoved');
        const statUnchanged = document.getElementById('diffStatUnchanged');

        if (!btnCompare) return;

        let lastOps = [];

        function toast(msg, type) {
            type = type || 'info';
            const container = document.getElementById('toastContainer');
            if (!container) return;
            const el = document.createElement('div');
            el.className = 'toast toast-' + type;
            el.textContent = msg;
            container.appendChild(el);
            requestAnimationFrame(function() { el.style.transform = 'translateX(0)'; el.style.opacity = '1'; });
            setTimeout(function() {
                el.style.opacity = '0';
                el.style.transform = 'translateX(100%)';
                setTimeout(function() { el.remove(); }, 300);
            }, 3000);
        }

        btnCompare.addEventListener('click', function() {
            const oldText = oldCodeEl.value;
            const newText = newCodeEl.value;
            if (!oldText.trim() && !newText.trim()) {
                toast('Please paste code into at least one panel.', 'error');
                return;
            }
            btnCompare.textContent = 'Comparing…';
            btnCompare.disabled = true;
            requestAnimationFrame(function() {
                setTimeout(function() {
                    const oldLines = oldText.split('\n');
                    const newLines = newText.split('\n');
                    lastOps = computeDiff(oldLines, newLines);
                    const stats = computeStats(lastOps);
                    statAdded.textContent = stats.added;
                    statRemoved.textContent = stats.removed;
                    statUnchanged.textContent = stats.unchanged;
                    renderUnified(lastOps, unifiedBody);
                    renderSplit(lastOps, splitBody);
                    resultsEl.classList.remove('hidden');
                    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    btnCompare.innerHTML = '⚡ Compare';
                    btnCompare.disabled = false;
                    const total = stats.added + stats.removed;
                    toast(total === 0 ? 'Files are identical!' : (total + ' difference' + (total !== 1 ? 's' : '') + ' found.'), total === 0 ? 'success' : 'info');
                }, 30);
            });
        });

        btnClearOld.addEventListener('click', function() { oldCodeEl.value = ''; });
        btnClearNew.addEventListener('click', function() { newCodeEl.value = ''; });

        btnUnified.addEventListener('click', function() {
            btnUnified.classList.add('active');
            btnSplit.classList.remove('active');
            unifiedView.classList.remove('hidden');
            splitView.classList.add('hidden');
        });

        btnSplit.addEventListener('click', function() {
            btnSplit.classList.add('active');
            btnUnified.classList.remove('active');
            splitView.classList.remove('hidden');
            unifiedView.classList.add('hidden');
        });

        btnCopy.addEventListener('click', function() {
            if (lastOps.length === 0) { toast('Run a comparison first.', 'error'); return; }
            const text = diffToText(lastOps);
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(function() { toast('Diff copied to clipboard!', 'success'); })
                    .catch(function() { fallbackCopy(text); });
            } else { fallbackCopy(text); }
        });

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            toast('Diff copied to clipboard!', 'success');
        }
    }

    window.DiffNow = { init: init };

})();
