// ================================================
// SOTG — Social Page (Activity Feed + Spirit Board + Groups)
// ================================================

import { getActivities, getLeaderboard, getMyGroups, createGroup, joinGroup, getGroupMembers, subscribeToActivities, getCurrentUser } from '../lib/api.js';
import { showToast, showModal, closeModal, timeAgo, ACTIVITY_ICONS } from '../lib/ui.js';

let realtimeSubscription = null;

export function renderSocialPage() {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">👥 Squad</h2>
      <button class="btn btn-secondary btn-sm" id="group-manage-btn">⚙️</button>
    </div>

    <div class="tab-bar" id="social-tabs">
      <button class="tab-btn active" data-tab="feed">Activity</button>
      <button class="tab-btn" data-tab="board">🏆 Spirit Board</button>
    </div>

    <div id="social-tab-content">
      <div id="tab-feed">
        <div class="skeleton" style="height:50px;margin-bottom:8px;"></div>
        <div class="skeleton" style="height:50px;margin-bottom:8px;"></div>
        <div class="skeleton" style="height:50px;"></div>
      </div>
      <div id="tab-board" class="hidden">
        <div class="skeleton" style="height:60px;margin-bottom:8px;"></div>
        <div class="skeleton" style="height:60px;margin-bottom:8px;"></div>
      </div>
    </div>
  `;

    document.addEventListener('page:mounted', function handler(e) {
        if (e.detail.page === 'social') {
            document.removeEventListener('page:mounted', handler);
            initSocialPage();
        }
    });

    return page;
}

async function initSocialPage() {
    // Tab switching
    document.querySelectorAll('#social-tabs .tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#social-tabs .tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const activeTab = tab.dataset.tab;
            document.getElementById('tab-feed').classList.toggle('hidden', activeTab !== 'feed');
            document.getElementById('tab-board').classList.toggle('hidden', activeTab !== 'board');
            if (activeTab === 'board') loadLeaderboard();
        });
    });

    // Group management
    document.getElementById('group-manage-btn')?.addEventListener('click', showGroupModal);

    // Load feed
    await loadFeed();

    // Realtime subscription
    if (realtimeSubscription) realtimeSubscription.unsubscribe();
    realtimeSubscription = subscribeToActivities((newActivity) => {
        prependActivity(newActivity);
    });
}

async function loadFeed() {
    const container = document.getElementById('tab-feed');
    if (!container) return;

    try {
        const activities = await getActivities();

        if (activities.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <h3 class="empty-state-title">No activity yet</h3>
          <p class="empty-state-text">Start completing quests and writing journal entries — your squad will see your progress here!</p>
        </div>
      `;
            return;
        }

        container.innerHTML = `<div id="activity-list">${activities.map(renderActivityItem).join('')}</div>`;

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error: ${err.message}</p></div>`;
    }
}

function renderActivityItem(activity) {
    const icon = ACTIVITY_ICONS[activity.activity_type] || '📌';
    const name = activity.users?.display_name || 'Someone';
    const isMe = activity.user_id === getCurrentUser()?.id;

    return `
    <div class="activity-item">
      <div class="activity-icon">${icon}</div>
      <div class="activity-body">
        <div class="activity-text">
          <strong>${isMe ? 'You' : name}</strong> ${activity.title}
        </div>
        ${activity.detail ? `<div style="font-size:12px;color:var(--text-hint);margin-top:2px;">${activity.detail}</div>` : ''}
        <div class="activity-time">${timeAgo(activity.created_at)}</div>
      </div>
    </div>
  `;
}

function prependActivity(activity) {
    const list = document.getElementById('activity-list');
    if (!list) return;

    // We need to fetch user info for the new activity
    const icon = ACTIVITY_ICONS[activity.activity_type] || '📌';
    const isMe = activity.user_id === getCurrentUser()?.id;

    const item = document.createElement('div');
    item.className = 'activity-item';
    item.style.animation = 'pageIn 0.3s var(--ease)';
    item.innerHTML = `
    <div class="activity-icon">${icon}</div>
    <div class="activity-body">
      <div class="activity-text">
        <strong>${isMe ? 'You' : 'A Squad Member'}</strong> ${activity.title}
      </div>
      <div class="activity-time">just now</div>
    </div>
  `;

    list.insertBefore(item, list.firstChild);
}

async function loadLeaderboard() {
    const container = document.getElementById('tab-board');
    if (!container) return;

    container.innerHTML = '<div class="skeleton" style="height:60px;margin-bottom:8px;"></div>'.repeat(4);

    try {
        const board = await getLeaderboard();

        if (board.length === 0) {
            container.innerHTML = '<div class="empty-state"><p class="empty-state-text">No players yet.</p></div>';
            return;
        }

        const rankColors = ['gold', 'silver', 'bronze'];
        const rankEmojis = ['👑', '🥈', '🥉'];

        let html = `
      <div class="card card-glass card-glow" style="text-align:center;margin-bottom:16px;padding:20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:var(--text-hint);margin-bottom:4px;">Spirit Board</div>
        <div style="font-size:13px;color:var(--text-hint);">Playing for the sake of the game</div>
      </div>
      <div class="spirit-board">
    `;

        board.forEach((user, idx) => {
            const initial = (user.display_name || '?').charAt(0).toUpperCase();
            const isMe = user.id === getCurrentUser()?.id;

            html += `
        <div class="spirit-row" ${isMe ? 'style="border:1px solid var(--accent);"' : ''}>
          <div class="spirit-rank ${rankColors[idx] || ''}">${idx < 3 ? rankEmojis[idx] : idx + 1}</div>
          <div class="spirit-avatar" ${isMe ? 'style="background:linear-gradient(135deg,#ec4899,#8b5cf6);"' : ''}>${initial}</div>
          <div class="spirit-info">
            <div class="spirit-name">${user.display_name}${isMe ? ' (you)' : ''}</div>
            <div class="spirit-stats">
              ⚔️ ${user.quests_conquered} conquered · 🔥 ${user.streak_current}d · 🔗 ${user.connections}
            </div>
          </div>
          <div class="spirit-score">${user.score}</div>
        </div>
      `;
        });

        html += '</div>';

        // Score breakdown legend
        html += `
      <div class="card" style="margin-top:16px;">
        <div class="section-subtitle">How Spirit Score Works</div>
        <div style="font-size:12px;color:var(--text-hint);line-height:1.8;">
          ⚔️ Quest conquered = <strong style="color:var(--text)">+100</strong><br>
          📈 Level gained = <strong style="color:var(--text)">+10</strong><br>
          🔥 Streak day = <strong style="color:var(--text)">+5</strong><br>
          🔗 Connection found = <strong style="color:var(--text)">+20</strong>
        </div>
      </div>
    `;

        container.innerHTML = html;

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error: ${err.message}</p></div>`;
    }
}

function showGroupModal() {
    showModal(`
    <h2 class="modal-title">👥 Manage Squad</h2>

    <div class="card" style="margin-bottom:16px;">
      <div class="section-subtitle">Join a Squad</div>
      <div style="display:flex;gap:8px;">
        <input type="text" class="input" id="join-code" placeholder="Enter invite code" style="flex:1;text-transform:uppercase;">
        <button class="btn btn-primary btn-sm" id="join-group-btn">Join</button>
      </div>
    </div>

    <div class="card">
      <div class="section-subtitle">Create a Squad</div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input type="text" class="input" id="group-name" placeholder="Squad name" style="flex:1;">
        <button class="btn btn-primary btn-sm" id="create-group-btn">Create</button>
      </div>
    </div>

    <div id="my-groups" style="margin-top:16px;">
      <div class="section-subtitle">Your Squads</div>
      <div id="groups-list"><div class="skeleton" style="height:40px;"></div></div>
    </div>
  `);

    loadMyGroups();

    document.getElementById('join-group-btn')?.addEventListener('click', async () => {
        const code = document.getElementById('join-code')?.value?.trim();
        if (!code) { showToast('Enter invite code', 'error'); return; }
        try {
            const group = await joinGroup(code);
            showToast(`Joined ${group.name}! 🤝`, 'success');
            loadMyGroups();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    document.getElementById('create-group-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('group-name')?.value?.trim();
        if (!name) { showToast('Enter a group name', 'error'); return; }
        try {
            const group = await createGroup(name);
            showToast(`Created! Invite: ${group.invite_code}`, 'success');
            loadMyGroups();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

async function loadMyGroups() {
    const container = document.getElementById('groups-list');
    if (!container) return;

    try {
        const groups = await getMyGroups();
        if (groups.length === 0) {
            container.innerHTML = '<p style="font-size:13px;color:var(--text-hint);">No squads yet. Create one or join with an invite code!</p>';
            return;
        }

        container.innerHTML = groups.map(g => `
      <div class="card" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;font-size:14px;">${g.name}</div>
            <div style="font-size:11px;color:var(--text-hint);">Code: <span style="font-family:var(--font-mono);color:var(--accent);">${g.invite_code}</span></div>
          </div>
          <button class="btn btn-ghost btn-sm copy-code-btn" data-code="${g.invite_code}">📋 Copy</button>
        </div>
      </div>
    `).join('');

        container.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                navigator.clipboard?.writeText(btn.dataset.code);
                showToast('Invite code copied!', 'success');
            });
        });

    } catch (err) {
        container.innerHTML = `<p style="font-size:13px;color:var(--danger);">Error: ${err.message}</p>`;
    }
}

export function cleanupSocial() {
    if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
    }
}
