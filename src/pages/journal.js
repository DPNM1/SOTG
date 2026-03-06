// ================================================
// SOTG — Journal Page (Lab Notebook + Feynman Mode)
// ================================================

import { getJournalEntries, createJournalEntry, callAI, getCurrentUser } from '../lib/api.js';
import { showToast, formatDate, timeAgo } from '../lib/ui.js';

const MOODS = ['🔥', '💡', '😤', '🤔', '😴'];

export function renderJournalPage() {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">📖 Lab Notebook</h2>
    </div>

    <div class="tab-bar" id="journal-tabs">
      <button class="tab-btn active" data-tab="write">Write</button>
      <button class="tab-btn" data-tab="history">History</button>
      <button class="tab-btn" data-tab="feynman">🧠 Feynman</button>
    </div>

    <div id="journal-tab-content">
      <div id="tab-write">${renderWriteTab()}</div>
      <div id="tab-history" class="hidden"></div>
      <div id="tab-feynman" class="hidden">${renderFeynmanTab()}</div>
    </div>
  `;

    document.addEventListener('page:mounted', function handler(e) {
        if (e.detail.page === 'journal') {
            document.removeEventListener('page:mounted', handler);
            initJournalPage();
        }
    });

    return page;
}

function renderWriteTab() {
    return `
    <div class="card card-glass">
      <div class="section-subtitle">How are you feeling?</div>
      <div class="mood-selector" id="mood-selector">
        ${MOODS.map(m => `<button class="mood-btn" data-mood="${m}">${m}</button>`).join('')}
      </div>

      <div class="input-group">
        <label>Today's Reflections</label>
        <textarea class="input" id="journal-content" placeholder="What did you explore today? What clicked? What confused you? What questions remain open?" style="min-height:160px;"></textarea>
      </div>

      <button class="btn btn-primary btn-full" id="save-journal-btn">📝 Save Entry</button>
    </div>

    <div class="manifesto-block" style="margin-top:16px;">
      <em>"The unexamined study session is not worth having."</em>
      <br><span style="font-size:11px;margin-top:4px;display:block;">Write what actually confused you, not what sounds impressive.</span>
    </div>
  `;
}

function renderFeynmanTab() {
    return `
    <div class="card card-glass">
      <div class="section-subtitle">🧠 Feynman Mode</div>
      <p style="font-size:13px;color:var(--text-hint);margin-bottom:16px;">
        Explain a concept in your own words. The AI will evaluate your understanding honestly — gaps, misconceptions, and all.
      </p>

      <div class="input-group">
        <label>Topic</label>
        <input type="text" class="input" id="feynman-topic" placeholder="e.g. Newton's Third Law, Recursion, Entropy...">
      </div>

      <div class="input-group">
        <label>Your Explanation</label>
        <textarea class="input" id="feynman-explanation" placeholder="Explain this topic as if you were teaching someone who has never seen it before. Start from WHY it exists..." style="min-height:150px;"></textarea>
      </div>

      <button class="btn btn-primary btn-full" id="feynman-check-btn">🔍 Check My Understanding</button>

      <div id="feynman-result" style="margin-top:16px;"></div>
    </div>
  `;
}

function initJournalPage() {
    // Tab switching
    document.querySelectorAll('#journal-tabs .tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#journal-tabs .tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const activeTab = tab.dataset.tab;
            document.getElementById('tab-write').classList.toggle('hidden', activeTab !== 'write');
            document.getElementById('tab-history').classList.toggle('hidden', activeTab !== 'history');
            document.getElementById('tab-feynman').classList.toggle('hidden', activeTab !== 'feynman');

            if (activeTab === 'history') loadHistory();
        });
    });

    // Mood selector
    let selectedMood = null;
    document.querySelectorAll('#mood-selector .mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#mood-selector .mood-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedMood = btn.dataset.mood;
        });
    });

    // Save journal
    document.getElementById('save-journal-btn')?.addEventListener('click', async () => {
        const content = document.getElementById('journal-content')?.value?.trim();
        if (!content) { showToast('Write something first!', 'error'); return; }

        try {
            await createJournalEntry(content, selectedMood);
            showToast('Journal saved! 📖', 'success');
            document.getElementById('journal-content').value = '';
            document.querySelectorAll('#mood-selector .mood-btn').forEach(b => b.classList.remove('selected'));
            selectedMood = null;
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });

    // Feynman check
    document.getElementById('feynman-check-btn')?.addEventListener('click', async () => {
        const topic = document.getElementById('feynman-topic')?.value?.trim();
        const explanation = document.getElementById('feynman-explanation')?.value?.trim();
        if (!topic || !explanation) { showToast('Fill in both fields', 'error'); return; }

        const btn = document.getElementById('feynman-check-btn');
        const result = document.getElementById('feynman-result');
        btn.disabled = true;
        btn.textContent = '🧠 Analyzing...';
        result.innerHTML = '<div class="skeleton" style="height:100px;"></div>';

        try {
            const response = await callAI('understanding_check', explanation, topic);
            result.innerHTML = `
        <div class="card" style="border-left:3px solid var(--accent);">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">AI Evaluation</div>
          <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;">${response?.evaluation || response?.message || 'No response received. Make sure the AI edge function is deployed.'}</div>
        </div>
      `;
        } catch (err) {
            result.innerHTML = `
        <div class="card" style="border-left:3px solid var(--danger);">
          <p style="font-size:13px;">AI is not available yet. Deploy the <code>ai-chat</code> edge function to enable Feynman mode.</p>
          <p style="font-size:12px;color:var(--text-hint);margin-top:8px;">Error: ${err.message}</p>
        </div>
      `;
        }
        btn.disabled = false;
        btn.textContent = '🔍 Check My Understanding';
    });
}

async function loadHistory() {
    const container = document.getElementById('tab-history');
    if (!container) return;

    container.innerHTML = '<div class="skeleton" style="height:60px;margin-bottom:12px;"></div>'.repeat(3);

    try {
        const entries = await getJournalEntries();

        if (entries.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📖</div>
          <h3 class="empty-state-title">No entries yet</h3>
          <p class="empty-state-text">Start writing your daily reflections to build your learning journal.</p>
        </div>
      `;
            return;
        }

        container.innerHTML = entries.map(entry => `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">${formatDate(entry.entry_date)}</span>
          <span style="font-size:18px;">${entry.mood || ''}</span>
        </div>
        <p style="font-size:14px;line-height:1.6;color:var(--text);white-space:pre-wrap;">${entry.content}</p>
        <span style="font-size:11px;color:var(--text-hint);margin-top:8px;display:block;">${timeAgo(entry.created_at)}</span>
      </div>
    `).join('');

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error: ${err.message}</p></div>`;
    }
}
