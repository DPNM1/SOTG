// ================================================
// SOTG — Quests Page
// ================================================

import { getDomains, getQuests, createDomain, createArc, createQuest, updateQuest, generateQuests, getCurrentUser } from '../lib/api.js';
import { showToast, showModal, closeModal, LEVEL_NAMES, PHASE_NAMES, PHASE_ORDER, DOMAIN_COLORS, DOMAIN_ICONS } from '../lib/ui.js';

let quests = [];
let domains = [];

export function renderQuestsPage() {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
    <div class="section-header">
      <h2 class="section-title"><i data-lucide="swords" style="width:24px;height:24px;display:inline-block;vertical-align:middle;"></i> Your Quests</h2>
      <button class="btn btn-primary btn-sm" id="add-quest-btn">+ New</button>
    </div>
    <div id="quests-content">
      <div class="skeleton" style="height:80px;margin-bottom:12px;"></div>
      <div class="skeleton" style="height:80px;margin-bottom:12px;"></div>
      <div class="skeleton" style="height:80px;"></div>
    </div>
  `;

    document.addEventListener('page:mounted', function handler(e) {
        if (e.detail.page === 'quests') {
            document.removeEventListener('page:mounted', handler);
            initQuestsPage();
        }
    });

    return page;
}

async function initQuestsPage() {
    document.getElementById('add-quest-btn')?.addEventListener('click', showAddQuestModal);
    await loadQuests();
}

async function loadQuests() {
    const container = document.getElementById('quests-content');
    if (!container) return;

    try {
        domains = await getDomains();
        quests = await getQuests();

        if (quests.length === 0 && domains.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="map" style="width:48px;height:48px;"></i></div>
          <h3 class="empty-state-title">No quests yet</h3>
          <p class="empty-state-text">Start your journey by creating your first domain and quest. Tell us what you want to master!</p>
          <button class="btn btn-primary" id="start-journey-btn"><i data-lucide="rocket" style="width:18px;height:18px;"></i> Start Your Journey</button>
        </div>
      `;
            document.getElementById('start-journey-btn')?.addEventListener('click', showAddQuestModal);
            return;
        }

        // Group quests by domain
        const grouped = {};
        quests.forEach(q => {
            const domName = q.arcs?.domains?.name || 'Uncategorized';
            const domColor = q.arcs?.domains?.color || '#6C5CE7';
            let domIcon = q.arcs?.domains?.icon || 'book';
            if (domIcon.length <= 2) domIcon = 'book'; // Fallback for old emojis
            const arcName = q.arcs?.name || 'General';
            const key = `${domName}|||${domColor}|||${domIcon}`;
            if (!grouped[key]) grouped[key] = {};
            if (!grouped[key][arcName]) grouped[key][arcName] = [];
            grouped[key][arcName].push(q);
        });

        let html = '';
        const conqueredCount = quests.filter(q => q.phase === 'conquered').length;
        const totalLevel = quests.reduce((sum, q) => sum + q.level, 0);

        // Progress overview
        html += `
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card">
          <div class="stat-value">${conqueredCount}/${quests.length}</div>
          <div class="stat-label">Conquered</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalLevel}</div>
          <div class="stat-label">Total Levels</div>
        </div>
      </div>
    `;

        // Domain filter chips
        html += '<div class="chip-row">';
        html += '<button class="chip selected" data-filter="all">All</button>';
        Object.keys(grouped).forEach(key => {
            const [name, color, icon] = key.split('|||');
            html += `<button class="chip" data-filter="${name}"><span class="domain-dot" style="background:${color};display:inline-block;width:8px;height:8px;border-radius:50;margin-right:4px;"></span><i data-lucide="${icon}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${name}</button>`;
        });
        html += '</div>';

        // Quest cards by domain/arc
        for (const [key, arcs] of Object.entries(grouped)) {
            const [domName, domColor, domIcon] = key.split('|||');
            html += `<div class="domain-section" data-domain="${domName}">`;
            html += `<div class="section-subtitle" style="color:${domColor}"><i data-lucide="${domIcon}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${domName}</div>`;

            for (const [arcName, arcQuests] of Object.entries(arcs)) {
                if (Object.keys(arcs).length > 1 || arcName !== 'General') {
                    html += `<p style="font-size:12px;color:var(--text-hint);margin-bottom:8px;font-style:italic;">Arc: ${arcName}</p>`;
                }
                arcQuests.forEach(q => {
                    html += renderQuestCard(q, domColor);
                });
            }
            html += `</div>`;
        }

        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        // Bind events
        container.querySelectorAll('.quest-card').forEach(card => {
            card.addEventListener('click', () => showQuestDetail(card.dataset.id));
        });

        container.querySelectorAll('.chip[data-filter]').forEach(chip => {
            chip.addEventListener('click', () => {
                container.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
                const filter = chip.dataset.filter;
                container.querySelectorAll('.domain-section').forEach(sec => {
                    sec.style.display = (filter === 'all' || sec.dataset.domain === filter) ? '' : 'none';
                });
            });
        });

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error loading quests: ${err.message}</p></div>`;
    }
}

function renderQuestCard(q, domColor) {
    return `
    <div class="card quest-card" data-id="${q.id}">
      <div class="quest-card-header">
        ${q.is_boss ? '<span class="quest-card-boss"><i data-lucide="crown" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> BOSS</span>' : ''}
        <span class="quest-card-title">${q.title}</span>
        <div class="level-badge l${q.level}">${q.level}</div>
      </div>
      <div class="quest-card-question">"${q.core_question}"</div>
      <div class="quest-card-footer">
        <span class="quest-phase ${q.phase}">${PHASE_NAMES[q.phase]}</span>
        <div style="width:60px;">
          <div class="progress-bar">
            <div class="progress-fill" style="width:${(PHASE_ORDER.indexOf(q.phase) / 4) * 100}%;background:${domColor}"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function showQuestDetail(questId) {
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;

    const domColor = quest.arcs?.domains?.color || '#6C5CE7';
    const currentPhaseIdx = PHASE_ORDER.indexOf(quest.phase);

    showModal(`
    <h2 class="modal-title">${quest.is_boss ? '<i data-lucide="crown" style="width:20px;height:20px;display:inline-block;vertical-align:middle;color:#fdcb6e;"></i> ' : ''}${quest.title}</h2>
    <p style="color:var(--text-hint);font-style:italic;margin-bottom:16px;">"${quest.core_question}"</p>

    <div class="section-subtitle">Understanding Level</div>
    <div class="level-selector" id="level-selector">
      ${[0, 1, 2, 3, 4, 5, 6].map(l => `
        <button class="level-select-btn ${quest.level === l ? 'selected l' + l : ''}" data-level="${l}" title="${LEVEL_NAMES[l]}">
          ${l}
        </button>
      `).join('')}
    </div>
    <p style="text-align:center;font-size:12px;color:var(--text-hint);margin-bottom:16px;" id="level-name">${LEVEL_NAMES[quest.level]}</p>

    <div class="section-subtitle">Phase</div>
    <div class="chip-row" id="phase-selector" style="justify-content:center;">
      ${PHASE_ORDER.map((p, i) => `
        <button class="chip ${quest.phase === p ? 'selected' : ''}" data-phase="${p}" ${i > currentPhaseIdx + 1 ? 'style="opacity:0.4"' : ''}>
          ${PHASE_NAMES[p]}
        </button>
      `).join('')}
    </div>

    <hr class="divider">

    <div class="input-group">
      <label>Notes for current phase</label>
      <textarea class="input" id="quest-notes" placeholder="Write your thoughts, derivations, insights...">${getPhaseNotes(quest) || ''}</textarea>
    </div>

    <div class="input-group">
      <label>Scheduled Date</label>
      <input type="date" class="input" id="quest-scheduled-date" value="${quest.scheduled_date || ''}">
    </div>

    <button class="btn btn-primary btn-full" id="save-quest-btn"><i data-lucide="save" style="width:18px;height:18px;"></i> Save Progress</button>
    ${quest.phase !== 'conquered' ? `<button class="btn btn-ghost btn-full" id="conquer-quest-btn" style="margin-top:8px;"><i data-lucide="swords" style="width:18px;height:18px;"></i> Mark as Conquered</button>` : ''}
  `);

    // Bind level selector
    document.querySelectorAll('#level-selector .level-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#level-selector .level-select-btn').forEach(b => { b.className = 'level-select-btn'; });
            const lv = parseInt(btn.dataset.level);
            btn.classList.add('selected', 'l' + lv);
            document.getElementById('level-name').textContent = LEVEL_NAMES[lv];
        });
    });

    // Bind phase selector
    document.querySelectorAll('#phase-selector .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#phase-selector .chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
        });
    });

    // Save
    document.getElementById('save-quest-btn')?.addEventListener('click', async () => {
        const selectedLevel = document.querySelector('#level-selector .selected')?.dataset.level;
        const selectedPhase = document.querySelector('#phase-selector .selected')?.dataset.phase;
        const notes = document.getElementById('quest-notes')?.value;
        const scheduledDate = document.getElementById('quest-scheduled-date')?.value;

        const updates = {};
        if (selectedLevel !== undefined) updates.level = parseInt(selectedLevel);
        if (selectedPhase) updates.phase = selectedPhase;
        if (scheduledDate !== undefined) updates.scheduled_date = scheduledDate || null;

        const noteKey = getNoteKey(selectedPhase || quest.phase);
        if (noteKey && notes) updates[noteKey] = notes;

        try {
            await updateQuest(questId, updates);
            showToast('Quest updated!', 'success');
            closeModal();
            await loadQuests();
            updateHeaderStats();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });

    // Conquer
    document.getElementById('conquer-quest-btn')?.addEventListener('click', async () => {
        try {
            await updateQuest(questId, { phase: 'conquered', conquered_at: new Date().toISOString() });
            showToast('Quest Conquered!', 'success');
            closeModal();
            await loadQuests();
            updateHeaderStats();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
}

function getPhaseNotes(quest) {
    const key = getNoteKey(quest.phase);
    return key ? quest[key] : '';
}

function getNoteKey(phase) {
    const map = { recon: 'recon_notes', deep_dive: 'deep_dive_notes', debrief: 'debrief_notes' };
    return map[phase] || null;
}

function showAddQuestModal() {
    showModal(`
    <h2 class="modal-title"><i data-lucide="map" style="width:24px;height:24px;display:inline-block;vertical-align:middle;"></i> New Quest</h2>

    <div class="tab-bar" id="add-mode-tabs">
      <button class="tab-btn active" data-mode="manual">Manual</button>
      <button class="tab-btn" data-mode="ai"><i data-lucide="sparkles" style="width:16px;height:16px;display:inline-block;vertical-align:middle;"></i> AI Generate</button>
    </div>

    <div id="manual-form">
      <div class="input-group">
        <label>Domain</label>
        <div style="display:flex;gap:8px;">
          <select class="input" id="domain-select" style="flex:1;">
            <option value="">Select or create new...</option>
            ${domains.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" id="new-domain-btn">+</button>
        </div>
      </div>

      <div id="new-domain-fields" class="hidden">
        <div class="input-group">
          <label>Domain Name</label>
          <input type="text" class="input" id="new-domain-name" placeholder="e.g. Physics, Music Theory, ML...">
        </div>
        <div class="input-group">
          <label>Icon</label>
          <div class="chip-row" id="icon-picker">
          ${DOMAIN_ICONS.map((i, idx) => `<button class="chip ${idx === 0 ? 'selected' : ''}" data-icon="${i}"><i data-lucide="${i}" style="width:16px;height:16px;"></i></button>`).join('')}
          </div>
        </div>
      </div>

      <div class="input-group">
        <label>Quest Title</label>
        <input type="text" class="input" id="quest-title" placeholder="e.g. Newton's Laws of Motion">
      </div>

      <div class="input-group">
        <label>Core Question</label>
        <textarea class="input" id="quest-question" placeholder="The driving question that makes this topic fascinating..." style="min-height:70px;"></textarea>
      </div>

      <div class="input-group">
        <label>Scheduled Date (Optional)</label>
        <input type="date" class="input" id="quest-date">
      </div>

      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <input type="checkbox" id="quest-boss">
        <label for="quest-boss" style="font-size:13px;cursor:pointer;"><i data-lucide="crown" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Boss Quest (foundational topic)</label>
      </div>

      <button class="btn btn-primary btn-full" id="create-quest-btn"><i data-lucide="swords" style="width:18px;height:18px;"></i> Create Quest</button>
    </div>

    <div id="ai-form" class="hidden">
      <div class="input-group">
        <label>What do you want to master?</label>
        <input type="text" class="input" id="ai-subject" placeholder="e.g. Thermodynamics, React, Piano...">
      </div>
      <div class="input-group">
        <label>Your current level</label>
        <div class="chip-row" id="ai-level-select">
          <button class="chip selected" data-level="beginner">Beginner</button>
          <button class="chip" data-level="intermediate">Intermediate</button>
          <button class="chip" data-level="advanced">Advanced</button>
        </div>
      </div>
      <button class="btn btn-primary btn-full" id="ai-generate-btn"><i data-lucide="sparkles" style="width:18px;height:18px;"></i> Generate Quest Map</button>
      <div id="ai-status" style="margin-top:12px;text-align:center;font-size:13px;color:var(--text-hint);"></div>
    </div>
  `);

    // Tab switching
    document.querySelectorAll('#add-mode-tabs .tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#add-mode-tabs .tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const mode = tab.dataset.mode;
            document.getElementById('manual-form').classList.toggle('hidden', mode !== 'manual');
            document.getElementById('ai-form').classList.toggle('hidden', mode !== 'ai');
        });
    });

    // New domain toggle
    let selectedIcon = 'book';
    document.getElementById('new-domain-btn')?.addEventListener('click', () => {
        document.getElementById('new-domain-fields').classList.toggle('hidden');
    });

    document.querySelectorAll('#icon-picker .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#icon-picker .chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedIcon = chip.dataset.icon;
        });
    });

    // Manual create
    document.getElementById('create-quest-btn')?.addEventListener('click', async () => {
        try {
            let domainId = document.getElementById('domain-select').value;

            // Create new domain if needed
            if (!domainId) {
                const domName = document.getElementById('new-domain-name')?.value?.trim();
                if (!domName) { showToast('Enter a domain name', 'error'); return; }
                const colorIdx = domains.length % DOMAIN_COLORS.length;
                const dom = await createDomain(domName, DOMAIN_COLORS[colorIdx], selectedIcon);
                domainId = dom.id;
                domains.push(dom);
            }

            const title = document.getElementById('quest-title')?.value?.trim();
            const question = document.getElementById('quest-question')?.value?.trim();
            const isBoss = document.getElementById('quest-boss')?.checked;
            const scheduledDate = document.getElementById('quest-date')?.value;

            if (!title || !question) { showToast('Fill in title and question', 'error'); return; }

            // Create a default arc for the domain
            const arc = await createArc(domainId, 'General', '', '');
            await createQuest(arc.id, title, question, isBoss, scheduledDate || null);

            showToast('Quest created!', 'success');
            closeModal();
            await loadQuests();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });

    // AI level chips
    document.querySelectorAll('#ai-level-select .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#ai-level-select .chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
        });
    });

    // AI generate
    document.getElementById('ai-generate-btn')?.addEventListener('click', async () => {
        const subject = document.getElementById('ai-subject')?.value?.trim();
        const level = document.querySelector('#ai-level-select .selected')?.dataset.level || 'beginner';
        if (!subject) { showToast('Enter a subject', 'error'); return; }

        const status = document.getElementById('ai-status');
        const btn = document.getElementById('ai-generate-btn');
        btn.disabled = true;
        btn.textContent = '⏳ Generating...';
        status.textContent = 'AI is designing your quest map... This may take a moment.';

        try {
            const result = await generateQuests(subject, level);
            if (result?.domain) {
                showToast(`Created ${result.questCount || 'multiple'} quests!`, 'success');
                closeModal();
                await loadQuests();
            } else {
                status.textContent = 'AI generated the structure. Creating quests...';
                showToast('Quests generated!', 'success');
                closeModal();
                await loadQuests();
            }
        } catch (err) {
            status.textContent = 'Error: ' + err.message;
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="sparkles" style="width:18px;height:18px;"></i> Generate Quest Map';
            if (window.lucide) window.lucide.createIcons();
        }
    });
}

function updateHeaderStats() {
    const user = getCurrentUser();
    if (user) {
        const streakEl = document.getElementById('header-streak');
        const levelEl = document.getElementById('header-level');
        if (streakEl) {
            streakEl.innerHTML = `<i data-lucide="flame" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> ${user.streak_current || 0}`;
            if (window.lucide) window.lucide.createIcons();
        }
        const totalLevel = quests.reduce((sum, q) => sum + q.level, 0);
        if (levelEl) levelEl.textContent = `Lv ${totalLevel}`;
    }
}
