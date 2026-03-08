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

    <div class="tab-bar" id="planner-tabs" style="margin-bottom: 20px;">
      <button class="tab-btn active" data-tab="plan">Daily Plan</button>
      <button class="tab-btn" data-tab="goals">Ultimate Goals</button>
    </div>

    <div id="plan-section">
      <div class="card card-glass" style="margin-bottom: 20px; padding: 12px;">
        <div id="planner-calendar" class="planner-calendar"></div>
      </div>

      <div id="planner-content">
        <div class="skeleton" style="height:80px;margin-bottom:12px;"></div>
        <div class="skeleton" style="height:80px;"></div>
      </div>
    </div>

    <div id="goals-section" class="hidden">
      <div id="goals-content">
         <div class="skeleton" style="height:150px;margin-bottom:12px;"></div>
      </div>
      <button class="btn btn-primary btn-full" id="add-goal-btn" style="margin-top:20px;">+ New Ultimate Goal</button>
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
    
    // Tab switching
    document.querySelectorAll('#planner-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#planner-tabs .tab-btn').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById('plan-section').classList.toggle('hidden', tab !== 'plan');
            document.getElementById('goals-section').classList.toggle('hidden', tab !== 'goals');
            if (tab === 'goals') loadGoals();
        });
    });

    document.getElementById('add-goal-btn')?.addEventListener('click', showAddGoalModal);
}

let goals = [];
async function loadGoals() {
    const container = document.getElementById('goals-content');
    if (!container) return;
    
    try {
        const { getGoals } = await import('../lib/api.js');
        goals = await getGoals();
        renderGoals(container);
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error: ${err.message}</p></div>`;
    }
}

function renderGoals(container) {
    if (goals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="target" style="width:32px;height:32px;"></i></div>
                <p class="empty-state-text">No ultimate goals set yet.</p>
                <p style="font-size:12px; color: var(--text-hint);">Define what you truly want to master.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let html = '';
    goals.forEach(goal => {
        const goalQuests = quests.filter(q => q.goal_id === goal.id);
        const conqueredCount = goalQuests.filter(q => q.phase === 'conquered').length;
        const totalXP = goalQuests.reduce((sum, q) => sum + (q.phase === 'conquered' ? (q.xp_reward || 10) : 0), 0);

        html += `
            <div class="card card-premium" style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 16px; font-weight: 800; color: var(--accent);">${goal.title}</span>
                    <span style="font-size: 11px; color: var(--text-hint);">${conqueredCount} quests mastered</span>
                </div>
                <p style="font-size:12px; color: var(--text-hint); margin-bottom: 16px;">${goal.description || 'No description set.'}</p>
                
                <div class="goal-stats" style="display:flex; gap:20px; margin-bottom:15px;">
                    <div>
                        <div style="font-size:18px; font-weight:800; color:var(--text);">${totalXP}</div>
                        <div style="font-size:10px; color:var(--text-hint); text-transform:uppercase;">Mastery Points</div>
                    </div>
                </div>

                <div class="progress-graph-container" style="height:60px; background:rgba(255,255,255,0.02); border-radius:8px; position:relative; overflow:hidden;">
                    <canvas class="progress-canvas" data-goal-id="${goal.id}" style="width:100%; height:100%;"></canvas>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    
    // Draw graphs
    setTimeout(() => {
        container.querySelectorAll('.progress-canvas').forEach(canvas => {
            drawProgressGraph(canvas);
        });
    }, 100);
}

function drawProgressGraph(canvas) {
    const ctx = canvas.getContext('2d');
    const goalId = canvas.dataset.goalId;
    const goalQuests = quests.filter(q => q.goal_id === goalId && q.phase === 'conquered' && q.conquered_at);
    
    // Group by day for last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }

    const dataPoints = days.map(day => {
        return goalQuests.filter(q => q.conquered_at.startsWith(day)).length;
    });

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const w = rect.width;
    const h = rect.height;
    const padding = 10;
    const maxVal = Math.max(...dataPoints, 1);
    
    ctx.beginPath();
    ctx.strokeStyle = 'var(--accent)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    
    dataPoints.forEach((val, i) => {
        const x = (i / (dataPoints.length - 1)) * (w - 2 * padding) + padding;
        const y = h - ((val / maxVal) * (h - 2 * padding) + padding);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        
        // Dot
        ctx.fillStyle = 'var(--accent)';
        const cX = x, cY = y;
        setTimeout(() => {
          ctx.beginPath();
          ctx.arc(cX, cY, 3, 0, Math.PI * 2);
          ctx.fill();
        }, 10);
    });
    ctx.stroke();

    // Fill area
    ctx.lineTo((w - padding), h);
    ctx.lineTo(padding, h);
    ctx.fillStyle = 'rgba(108, 92, 231, 0.1)';
    ctx.fill();
}

async function showAddGoalModal() {
    const { showModal, closeModal, showToast } = await import('../lib/ui.js');
    showModal(`
        <h2 class="modal-title">New Ultimate Goal</h2>
        <div class="input-group">
            <label>What is your endgame?</label>
            <input type="text" class="input" id="goal-title" placeholder="e.g. Master Theoretical Physics, Become an iOS Dev...">
        </div>
        <div class="input-group">
            <label>Mission Statement (Description)</label>
            <textarea class="input" id="goal-desc" placeholder="Why does this matter? What does success look like?" style="min-height:100px;"></textarea>
        </div>
        <button class="btn btn-primary btn-full" id="save-goal-btn">Set Goal</button>
    `);

    document.getElementById('save-goal-btn').addEventListener('click', async () => {
        const title = document.getElementById('goal-title').value.trim();
        const desc = document.getElementById('goal-desc').value.trim();
        if (!title) { showToast('Title is required', 'error'); return; }

        try {
            const { createGoal } = await import('../lib/api.js');
            await createGoal(title, desc);
            showToast('Ultimate goal established.', 'success');
            closeModal();
            loadGoals();
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    });
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
}

// Event Delegation for the entire planner-content
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.open-quest-btn');
    if (btn) {
        const questId = btn.dataset.id;
        const quest = quests.find(q => q.id === questId);
        if (quest) {
            showQuestDetail(quest);
        } else {
            // Fallback: try to fetch it if not in current view
            showQuestDetail(questId);
        }
    }
});
