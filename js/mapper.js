(function() {
    'use strict';
    const Mapper = {
        elements: {
            lookup1: document.getElementById('lookup1'),
            lookup2: document.getElementById('lookup2'),
            compareFields: document.getElementById('compareFields'),
            selectAll: document.getElementById('selectAllFields'),
            deselectAll: document.getElementById('deselectAllFields'),
        },
        state: {
            headers1: [],
            headers2: [],
            commonHeaders: []
        },
        init() {
            this.elements.selectAll.addEventListener('click', () => this.toggleAll(true));
            this.elements.deselectAll.addEventListener('click', () => this.toggleAll(false));
            this.elements.lookup1.addEventListener('change', () => this.renderChips());
            this.elements.lookup2.addEventListener('change', () => this.renderChips());
        },
        updateHeaders(headers1, headers2) {
            this.state.headers1 = headers1;
            this.state.headers2 = headers2;
            this.state.commonHeaders = headers1.filter(h => headers2.includes(h));
            this.populateDropdown(this.elements.lookup1, headers1);
            this.populateDropdown(this.elements.lookup2, headers2);
            this.autoSelectId(this.elements.lookup1);
            this.autoSelectId(this.elements.lookup2);
            this.renderChips();
        },
        populateDropdown(selectEl, headers) {
            selectEl.innerHTML = '';
            headers.forEach(h => {
                const option = document.createElement('option');
                option.value = h;
                option.textContent = h;
                selectEl.appendChild(option);
            });
        },
        autoSelectId(selectEl) {
            const options = Array.from(selectEl.options);
            const idOption = options.find(o => o.value.toLowerCase() === 'id');
            selectEl.value = idOption ? idOption.value : (options.length > 0 ? options[0].value : '');
        },
        renderChips() {
            this.elements.compareFields.innerHTML = '';
            const lookup1Val = this.elements.lookup1.value;
            const lookup2Val = this.elements.lookup2.value;
            this.state.commonHeaders.forEach(header => {
                if (header === lookup1Val || header === lookup2Val) return;
                const chip = document.createElement('div');
                chip.className = 'chip selected';
                chip.textContent = header;
                chip.dataset.field = header;
                chip.addEventListener('click', function() {
                    this.classList.toggle('selected');
                });
                this.elements.compareFields.appendChild(chip);
            });
        },
        toggleAll(select) {
            const chips = this.elements.compareFields.querySelectorAll('.chip');
            chips.forEach(chip => {
                if (select) chip.classList.add('selected');
                else chip.classList.remove('selected');
            });
        },
        getConfig() {
            const selectedChips = Array.from(this.elements.compareFields.querySelectorAll('.chip.selected'));
            return {
                lookupColumn1: this.elements.lookup1.value,
                lookupColumn2: this.elements.lookup2.value,
                compareFields: selectedChips.map(chip => chip.dataset.field)
            };
        }
    };
    window.Mapper = Mapper;
})();