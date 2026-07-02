document.addEventListener('DOMContentLoaded', () => {
    'use strict';
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
    
    let dataset1 = null, dataset2 = null, comparisonResults = null;
    Mapper.init();
    if (window.Formatter) Formatter.init();
    
    const topNavBtns = document.querySelectorAll('.top-nav-btn');
    const apps = {'app-comparator': document.getElementById('app-comparator'), 'app-formatter': document.getElementById('app-formatter')};
    topNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            topNavBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            Object.keys(apps).forEach(id => {
                apps[id].classList.toggle('hidden', id !== e.target.getAttribute('data-target'));
            });
        });
    });
    
    const elements = {
        input1: document.getElementById('input1'),
        input2: document.getElementById('input2'),
        badge1: document.getElementById('badge1'),
        badge2: document.getElementById('badge2'),
        clear1: document.getElementById('clear1'),
        clear2: document.getElementById('clear2'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        btnCompare: document.getElementById('btnCompare'),
        dropzone1: document.getElementById('dropzone1'),
        dropzone2: document.getElementById('dropzone2'),
        toastContainer: document.getElementById('toastContainer')
    };
    
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = message;
        elements.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    window.showToast = showToast;
    
    function handleDataUpdate(panelNum, data) {
        if (!data || data.rows.length === 0) { clearData(panelNum); return; }
        const badge = panelNum === 1 ? elements.badge1 : elements.badge2;
        badge.textContent = `${data.rows.length} rows detected`;
        if (panelNum === 1) dataset1 = data;
        else dataset2 = data;
        if (dataset1 && dataset2) {
            elements.step2.classList.remove('hidden');
            Mapper.updateHeaders(dataset1.headers, dataset2.headers);
        }
    }
    
    function clearData(panelNum) {
        if (panelNum === 1) dataset1 = null;
        else dataset2 = null;
        const input = panelNum === 1 ? elements.input1 : elements.input2;
        input.value = '';
    }
    
    function setupInputEvents(inputEl, panelNum) {
        inputEl.addEventListener('input', () => {
            if (inputEl.value.trim()) {
                try {
                    handleDataUpdate(panelNum, DataParser.parse(inputEl.value));
                    showToast('Data parsed', 'success');
                } catch (e) {
                    showToast('Parse error', 'error');
                }
            }
        });
    }
    
    setupInputEvents(elements.input1, 1);
    setupInputEvents(elements.input2, 2);
    elements.clear1.addEventListener('click', () => clearData(1));
    elements.clear2.addEventListener('click', () => clearData(2));
    
    elements.btnCompare.addEventListener('click', () => {
        const config = Mapper.getConfig();
        if (!config.lookupColumn1) { showToast('Select lookup columns', 'warning'); return; }
        elements.btnCompare.disabled = true;
        setTimeout(() => {
            comparisonResults = Comparator.compare(dataset1, dataset2, config);
            document.getElementById('valTotal1').textContent = comparisonResults.summary.totalDs1;
            document.getElementById('valTotal2').textContent = comparisonResults.summary.totalDs2;
            document.getElementById('valMatched').textContent = comparisonResults.summary.matchedCount;
            document.getElementById('valChanged').textContent = comparisonResults.summary.changedCount;
            elements.step3.classList.remove('hidden');
            elements.btnCompare.disabled = false;
            showToast('Done!', 'success');
        }, 100);
    });
});