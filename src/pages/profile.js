// ================================================
// SOTG — Profile Page
// ================================================

import { getCurrentUser, getUserStats, getQuests, getArtifacts, supabase } from '../lib/api.js';
import { showToast, LEVEL_NAMES } from '../lib/ui.js';

export function renderProfilePage() {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = `
    <div id="profile-content">
      <div class="skeleton" style="height:120px;margin-bottom:16px;"></div>
      <div class="skeleton" style="height:80px;margin-bottom:16px;"></div>
    </div>
  `;

    document.addEventListener('page:mounted', function handler(e) {
        if (e.detail.page === 'profile') {
            document.removeEventListener('page:mounted', handler);
            loadProfile();
        }
    });

    return page;
}

async function loadProfile() {
    const container = document.getElementById('profile-content');
    if (!container) return;

    const user = getCurrentUser();
    if (!user) { container.innerHTML = '<p>Not logged in</p>'; return; }

    try {
        const stats = await getUserStats();
        const quests = await getQuests();

        // Level distribution
        const levelDist = Array(7).fill(0);
        quests.forEach(q => levelDist[q.level]++);

        const initial = (user.display_name || '?').charAt(0).toUpperCase();

        container.innerHTML = `
      <!-- User Card -->
      <div class="card card-glass card-glow" style="text-align:center;padding:24px;">
        <div class="spirit-avatar" style="width:64px;height:64px;font-size:24px;margin:0 auto 12px;overflow:hidden;">
          ${user.avatar_url ? `<img src="${user.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : initial}
          <div class="level-indicator" style="position:absolute;bottom:-4px;right:-4px;background:var(--accent);color:white;width:24px;height:24px;border-radius:50%;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid var(--bg-card);">
            ${user.level || 1}
          </div>
        </div>
        <h2 style="font-size:18px;font-weight:700;">${user.display_name}</h2>
        ${user.telegram_username ? `<p style="font-size:13px;color:var(--text-hint);">@${user.telegram_username}</p>` : ''}
        <p style="font-size:11px;color:var(--text-hint);font-family:var(--font-mono);margin-top:4px;">ID: ${user.telegram_id}</p>
        
        <!-- XP Progress -->
        <div style="margin-top:16px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-hint);margin-bottom:4px;text-transform:uppercase;font-weight:700;">
            <span>${LEVEL_NAMES[user.level - 1] || 'Seeker'}</span>
            <span>${user.xp % 10 * 10}% to Level ${user.level + 1}</span>
          </div>
          <div class="progress-bar" style="height:6px;">
            <div class="progress-fill" style="width:${user.xp % 10 * 10}%; background:var(--accent-gradient);"></div>
          </div>
          <div style="font-size:10px;margin-top:4px;color:var(--text-hint); font-family:var(--font-mono);">${user.xp || 0} Total XP</div>
        </div>

        <div style="display:flex;justify-content:center;gap:16px;margin-top:16px;">
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:800;color:var(--fire);"><i data-lucide="flame" style="width:20px;height:20px;display:inline-block;vertical-align:bottom;flex-shrink:0;"></i> ${user.streak_current}</div>
            <div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;">Streak</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:20px;font-weight:800;color:var(--accent);">${user.streak_best}</div>
            <div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;">Best</div>
          </div>
        </div>
      </div>

      <!-- Artifacts Gallery -->
      <div class="card">
        <div class="section-subtitle">Curiosity Artifacts</div>
        <div id="artifacts-list" style="display:flex;gap:12px;overflow-x:auto;padding:8px 0;scrollbar-width:none;">
          <div class="skeleton" style="width:60px;height:60px;flex-shrink:0;"></div>
          <div class="skeleton" style="width:60px;height:60px;flex-shrink:0;"></div>
          <div class="skeleton" style="width:60px;height:60px;flex-shrink:0;"></div>
        </div>
      </div>

      <!-- Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.totalQuests}</div>
          <div class="stat-label">Total Quests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.conquered}</div>
          <div class="stat-label">Conquered</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.avgLevel}</div>
          <div class="stat-label">Avg Level</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.connections}</div>
          <div class="stat-label">Connections</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.journalEntries}</div>
          <div class="stat-label">Journal Entries</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.totalLevel}</div>
          <div class="stat-label">Total Levels</div>
        </div>
      </div>

      <!-- Level Distribution -->
      <div class="card">
        <div class="section-subtitle">Level Distribution</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${levelDist.map((count, i) => `
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="level-badge l${i}" style="width:24px;height:24px;font-size:10px;">${i}</div>
              <span style="font-size:11px;color:var(--text-hint);width:70px;">${LEVEL_NAMES[i]}</span>
              <div class="progress-bar" style="flex:1;height:8px;">
                <div class="progress-fill" style="width:${quests.length ? (count / quests.length * 100) : 0}%;"></div>
              </div>
              <span style="font-size:12px;font-family:var(--font-mono);width:20px;text-align:right;">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Manifesto -->
      <div class="card">
        <div class="section-subtitle">Your Manifesto</div>
        <textarea class="input" id="manifesto-input" placeholder="Write your personal manifesto — why do you play the game?" style="min-height:120px;">${user.manifesto || ''}</textarea>
        <button class="btn btn-secondary btn-full btn-sm" id="save-manifesto-btn" style="margin-top:8px;">Save Manifesto</button>
      </div>

      <!-- Default SOTG Manifesto -->
      <div class="manifesto-block" style="margin-top:8px;">
        <em>I am not preparing for an exam. I am building a mind.</em><br><br>
        <em>Every concept I master is mine forever.</em><br>
        <em>Every connection I discover makes me stronger.</em><br>
        <em>Every failure I face makes me wiser.</em><br><br>
        <em>For the sake of the game.</em>
      </div>
    `;
        // Load Artifacts
        const artifacts = await getArtifacts();
        const artList = document.getElementById('artifacts-list');
        if (artList) {
            if (!artifacts || artifacts.length === 0) {
                artList.innerHTML = '<p style="font-size:11px;color:var(--text-hint);width:100%;text-align:center;padding:12px;">No artifacts found yet. Master a category to unlock them.</p>';
            } else {
                artList.innerHTML = artifacts.map(a => `
                    <div class="artifact-item" style="flex-shrink:0;text-align:center;width:70px;">
                        <div class="spirit-avatar" style="width:50px;height:50px;margin:0 auto 4px;background:var(--accent-gradient);color:white;padding:10px;">
                            ${a.icon_svg}
                        </div>
                        <div style="font-size:9px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.name}</div>
                    </div>
                `).join('');
            }
        }

        if (window.lucide) window.lucide.createIcons();

        // Save manifesto
        document.getElementById('save-manifesto-btn')?.addEventListener('click', async () => {
            const text = document.getElementById('manifesto-input')?.value?.trim();
            try {
                await supabase.from('users').update({ manifesto: text }).eq('id', user.id);
                showToast('Manifesto saved!', 'success');
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            }
        });

    } catch (err) {
        container.innerHTML = `<div class="empty-state"><p class="empty-state-text">Error: ${err.message}</p></div>`;
    }
}
