// ================================================
// SOTG — Sake Of The Game — Main Entry Point
// ================================================

import './style.css';
import { authenticateUser, getCurrentUser } from './lib/api.js';
import { registerPage, initRouter, navigate } from './lib/router.js';
import { showToast } from './lib/ui.js';
import { renderQuestsPage } from './pages/quests.js';
import { renderJournalPage } from './pages/journal.js';
import { renderSocialPage } from './pages/social.js';
import { renderProfilePage } from './pages/profile.js';

// ---- Initialize App ----
async function initApp() {
  const tg = window.Telegram?.WebApp;

  // Expand Mini App to full height
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
  }

  // Register pages
  registerPage('quests', renderQuestsPage);
  registerPage('journal', renderJournalPage);
  registerPage('social', renderSocialPage);
  registerPage('profile', renderProfilePage);

  try {
    // Authenticate user via Telegram identity
    let telegramUser = tg?.initDataUnsafe?.user;

    // Dev fallback: if no Telegram context, use a mock user
    if (!telegramUser) {
      console.warn('No Telegram context detected. Using dev mode.');
      telegramUser = {
        id: 12345678,
        first_name: 'Dev',
        last_name: 'User',
        username: 'devuser',
      };
    }

    await authenticateUser(telegramUser);
    const user = getCurrentUser();

    // Update header
    document.getElementById('header-streak').textContent = `🔥 ${user.streak_current || 0}`;

    // Hide loading, show app
    const loader = document.getElementById('loading-screen');
    loader.classList.add('fade-out');
    setTimeout(() => {
      loader.classList.add('hidden');
      document.getElementById('app-header').classList.remove('hidden');
      document.getElementById('page-container').classList.remove('hidden');
      document.getElementById('bottom-nav').classList.remove('hidden');

      // Initialize router and navigate to first page
      initRouter();
    }, 500);

  } catch (error) {
    console.error('Init error:', error);
    const loader = document.getElementById('loading-screen');
    loader.innerHTML = `
      <div class="loader-content">
        <div class="loader-icon">⚠️</div>
        <h1 class="loader-title" style="font-size:18px;">Connection Error</h1>
        <p class="loader-subtitle" style="margin-top:8px;">${error.message}</p>
        <button class="btn btn-primary" onclick="location.reload()" style="margin-top:24px;">Retry</button>
      </div>
    `;
  }
}

// ---- Boot ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
