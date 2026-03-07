// ================================================
// SOTG — Planner Page (Daily Ritual & Calendar)
// ================================================

import { getQuests, updateQuest } from '../lib/api.js';
import { showToast, PHASE_NAMES } from '../lib/ui.js';
import { showQuestDetail } from './quests.js';

export function renderPlannerPage() {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
    <div class="section-header">
      <h2 class="section-title"><i data-lucide="calendar" style="width:24px;height:24px;display:inline-block;vertical-align:middle;"></i> Daily Planner</h2>
    </div>

    <div class="card card-glass" style="margin-bottom: 20px; padding: 12px;">
      <div id="planner-calendar" class="planner-calendar"></div>
    </div>

    <div id="planner-content">
      <div class="skeleton" style="height:80px;margin-bottom:12px;"></div>
      <div class="skeleton" style="height:80px;"></div>
    </div>
  `;

    document.addEventListener('page:mounted', function handler(e) {
        if (e.detail.page === 'planner') {
            document.removeEventListener('page:mounted', handler);
            initPlannerPage();
        }
    });

    document.addEventListener('quest:updated', () => {
        if (window.location.hash === '#planner') {
            loadPlannerData();
        }
    });

    return page;
}

let quests = [];
let selectedDate = new Date().toISOString().split('T')[0];

async function initPlannerPage() {
    await loadPlannerData();
    renderMiniCalendar();
}

async function loadPlannerData() {
    const container = document.getElementById('planner-content');
    if (!container) return;

    try {
        quests = await getQuests();
        renderDayQuests();
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error: ${err.message}</p></div>`;
    }
}

function renderMiniCalendar() {
    const calendarEl = document.getElementById('planner-calendar');
    if (!calendarEl) return;

    const now = new Date();
    const daysHeader = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    
    // Simple 7-day view for the current week for better mobile UX
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    let html = '<div style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 8px; text-align: center;">';
    
    // Days of the week labels
    daysHeader.forEach(d => {
        html += `<div style="font-size: 10px; color: var(--text-hint); font-weight: 600; text-transform: uppercase;">${d}</div>`;
    });

    // 14 days view (2 weeks)
    for (let i = 0; i < 14; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        const isSelected = dateStr === selectedDate;
        
        const hasQuests = quests.some(q => q.scheduled_date === dateStr);

        html += `
            <div class="calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" 
                 data-date="${dateStr}"
                 style="padding: 8px 0; border-radius: 12px; cursor: pointer; transition: all 0.2s var(--ease); position: relative;
                        background: ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.03)'};
                        color: ${isSelected ? '#000' : 'var(--text)'};
                        border: 1px solid ${isSelected ? 'var(--accent)' : (isToday ? 'rgba(255,255,255,0.2)' : 'transparent')};">
                <div style="font-size: 13px; font-weight: 700;">${d.getDate()}</div>
                ${hasQuests ? `<div style="width: 4px; height: 4px; background: ${isSelected ? '#000' : 'var(--accent)'}; border-radius: 50%; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);"></div>` : ''}
            </div>
        `;
    }
    
    html += '</div>';
    calendarEl.innerHTML = html;

    calendarEl.querySelectorAll('.calendar-day').forEach(day => {
        day.addEventListener('click', () => {
            selectedDate = day.dataset.date;
            renderMiniCalendar();
            renderDayQuests();
        });
    });
}

function renderDayQuests() {
    const container = document.getElementById('planner-content');
    if (!container) return;

    const dayQuests = quests.filter(q => q.scheduled_date === selectedDate);
    const dateObj = new Date(selectedDate);
    const dateFormatted = dateObj.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });

    let html = `
        <div style="margin-bottom: 16px;">
            <div style="font-size: 16px; font-weight: 700; color: var(--text);">${dateFormatted}</div>
            <div style="font-size: 12px; color: var(--text-hint);">${dayQuests.length} planned activities</div>
        </div>
    `;

    if (dayQuests.length === 0) {
        html += `
            <div class="empty-state" style="padding: 40px 20px;">
                <div class="empty-state-icon"><i data-lucide="coffee" style="width:32px;height:32px;"></i></div>
                <p class="empty-state-text">No quests scheduled for this day.</p>
                <p style="font-size: 12px; color: var(--text-hint); margin-top: 8px;">Go to the Quests page to schedule a challenge.</p>
            </div>
        `;
    } else {
        dayQuests.forEach(q => {
            const domColor = q.arcs?.domains?.color || '#6C5CE7';
            html += `
                <div class="card card-premium" style="margin-bottom: 12px; border-left: 4px solid ${domColor};">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <span style="font-size: 14px; font-weight: 700; color: var(--text);">${q.title}</span>
                        <div class="level-badge l${q.level}" style="position: static; padding: 2px 8px;">${q.level}</div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-hint); margin-bottom: 12px; font-style: italic;">"${q.core_question}"</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="quest-phase ${q.phase}" style="font-size: 10px; padding: 2px 8px;">${PHASE_NAMES[q.phase]}</span>
                        <button class="btn btn-secondary btn-sm open-quest-btn" data-id="${q.id}">Open</button>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();

    container.querySelectorAll('.open-quest-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const quest = quests.find(q => q.id === btn.dataset.id);
            if (quest) showQuestDetail(quest);
        });
    });
}
