// ========================================
// J.A.R.V.I.S. Life Dashboard — Tabbed Panel
// ========================================

const LifeDashboard = {
    data: null,
    activeTab: 'health',
    activeSubTab: { health: 'mental', business: 'overview' },
    refreshInterval: null,

    init() {
        this.bindTabs();
        this.fetchData();
        // Refresh every 60 seconds
        this.refreshInterval = setInterval(() => this.fetchData(), 60000);
    },

    bindTabs() {
        document.querySelectorAll('.dash-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.setActiveTab(tabName);
            });
        });

        document.querySelectorAll('.dash-sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const subName = tab.dataset.subtab;
                const parent = tab.dataset.parent;
                this.setActiveSubTab(parent, subName);
            });
        });
    },

    setActiveTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.dash-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });

        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.toggle('active', c.dataset.tab === tabName);
        });

        // Show correct sub-tabs
        document.querySelectorAll('.sub-tab-bar').forEach(bar => {
            bar.classList.toggle('active', bar.dataset.parent === tabName);
        });

        // Activate correct sub-tab
        const currentSub = this.activeSubTab[tabName];
        if (currentSub) {
            this.setActiveSubTab(tabName, currentSub);
        }
    },

    setActiveSubTab(parent, subName) {
        this.activeSubTab[parent] = subName;

        // Update sub-tab buttons for this parent
        document.querySelectorAll(`.dash-sub-tab[data-parent="${parent}"]`).forEach(t => {
            t.classList.toggle('active', t.dataset.subtab === subName);
        });

        // Show/hide sub-tab content
        document.querySelectorAll(`.sub-tab-content[data-parent="${parent}"]`).forEach(c => {
            c.classList.toggle('active', c.dataset.subtab === subName);
        });
    },

    async fetchData() {
        try {
            const res = await fetch('/api/life-dashboard');
            if (!res.ok) return;
            this.data = await res.json();
            this.render();
        } catch (e) {
            console.warn('[JARVIS] Failed to fetch life dashboard:', e);
        }
    },

    render() {
        if (!this.data) return;
        this.renderMentalHealth();
        this.renderFitness();
        this.renderBusinessOverview();
        this.renderSaaS();
        this.renderRelationships();
    },

    renderMentalHealth() {
        const mental = this.data.health?.mental;
        if (!mental) return;

        const container = document.getElementById('mental-health-content');
        if (!container) return;

        container.innerHTML = `
            <div class="metric-row">
                <span class="metric-label">MOOD</span>
                <div class="metric-bar-track">
                    <div class="metric-bar-fill" style="width: ${mental.mood * 10}%; background: ${this.getColor(mental.mood)}"></div>
                </div>
                <span class="metric-value">${mental.mood || '—'}/10</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">ENERGY</span>
                <div class="metric-bar-track">
                    <div class="metric-bar-fill" style="width: ${mental.energy * 10}%; background: ${this.getColor(mental.energy)}"></div>
                </div>
                <span class="metric-value">${mental.energy || '—'}/10</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">FOCUS</span>
                <div class="metric-bar-track">
                    <div class="metric-bar-fill" style="width: ${mental.focus * 10}%; background: ${this.getColor(mental.focus)}"></div>
                </div>
                <span class="metric-value">${mental.focus || '—'}/10</span>
            </div>
            ${mental.last_entry_date ? `<div class="dash-info">Last entry: ${this.escapeHtml(mental.last_entry_date)}</div>` : ''}
            <div class="coaching-prompt">
                <div class="prompt-label">TODAY'S PROMPT</div>
                <div class="prompt-text">${this.escapeHtml(mental.coaching_prompt)}</div>
            </div>
        `;
    },

    renderFitness() {
        const fitness = this.data.health?.fitness;
        if (!fitness) return;

        const container = document.getElementById('fitness-content');
        if (!container) return;

        let habitsHtml = '';
        if (fitness.habit_streaks && fitness.habit_streaks.length > 0) {
            habitsHtml = '<div class="dash-section-title">HABIT STREAKS</div>';
            fitness.habit_streaks.forEach(h => {
                habitsHtml += `<div class="dash-list-item"><span>${this.escapeHtml(h.name)}</span><span class="dash-value">${this.escapeHtml(h.value)}</span></div>`;
            });
        }

        let protocolsHtml = '';
        if (fitness.protocols && fitness.protocols.length > 0) {
            protocolsHtml = '<div class="dash-section-title">PROTOCOLS</div>';
            fitness.protocols.forEach(p => {
                protocolsHtml += `<div class="dash-list-item">${this.escapeHtml(p)}</div>`;
            });
        }

        container.innerHTML = `
            <div class="metric-row">
                <span class="metric-label">SLEEP</span>
                <span class="metric-value">${fitness.sleep_hours || '—'} hrs</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">EXERCISE</span>
                <span class="metric-value ${fitness.exercised_today ? 'positive' : ''}">${fitness.exercised_today ? 'DONE' : 'NOT YET'}</span>
            </div>
            ${habitsHtml}
            ${protocolsHtml}
        `;
    },

    renderBusinessOverview() {
        const overview = this.data.business?.overview;
        if (!overview) return;

        const container = document.getElementById('business-overview-content');
        if (!container) return;

        let clientsHtml = '';
        if (overview.ai_clients && overview.ai_clients.length > 0) {
            overview.ai_clients.forEach(c => {
                clientsHtml += `<div class="dash-list-item"><span>${this.escapeHtml(c.name)}</span><span class="dash-status">${this.escapeHtml(c.status)}</span></div>`;
            });
        } else {
            clientsHtml = '<div class="dash-empty">No client projects yet</div>';
        }

        container.innerHTML = `
            <div class="metric-row">
                <span class="metric-label">ACTIVE PROJECTS</span>
                <span class="metric-value">${overview.active_projects}</span>
            </div>
            <div class="dash-section-title">AI CLIENTS</div>
            ${clientsHtml}
        `;
    },

    renderSaaS() {
        const saas = this.data.business?.saas;
        if (!saas) return;

        const container = document.getElementById('saas-content');
        if (!container) return;

        let pipelineHtml = '';
        if (saas.pipeline_summary && Object.keys(saas.pipeline_summary).length > 0) {
            pipelineHtml = '<div class="dash-section-title">PIPELINE</div>';
            for (const [stage, count] of Object.entries(saas.pipeline_summary)) {
                pipelineHtml += `<div class="dash-list-item"><span>${this.escapeHtml(stage)}</span><span class="dash-value">${count}</span></div>`;
            }
        }

        let productsHtml = '';
        if (saas.products && saas.products.length > 0) {
            productsHtml = '<div class="dash-section-title">PRODUCTS</div>';
            saas.products.forEach(p => {
                productsHtml += `<div class="dash-list-item"><span>${this.escapeHtml(p.name)}</span><span class="dash-status">${this.escapeHtml(p.status)}</span></div>`;
            });
        }

        container.innerHTML = `
            ${pipelineHtml || '<div class="dash-empty">No pipeline data yet</div>'}
            ${productsHtml}
        `;
    },

    renderRelationships() {
        const rel = this.data.relationships;
        if (!rel) return;

        const container = document.getElementById('relationships-content');
        if (!container) return;

        const sections = [
            { title: 'KEY PEOPLE', items: rel.key_people },
            { title: 'REACH OUT TO', items: rel.reach_out },
            { title: 'LEARN FROM', items: rel.learn_from },
        ];

        let html = '';
        sections.forEach(section => {
            if (section.items && section.items.length > 0) {
                html += `<div class="dash-section-title">${section.title}</div>`;
                section.items.forEach(item => {
                    html += `<div class="dash-list-item">${this.escapeHtml(item)}</div>`;
                });
            }
        });

        container.innerHTML = html || '<div class="dash-empty">No relationship data yet</div>';
    },

    getColor(value) {
        if (!value || value <= 3) return '#ff3a3a';
        if (value <= 5) return '#ffaa00';
        if (value <= 7) return '#00d4ff';
        return '#00ff88';
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
};
