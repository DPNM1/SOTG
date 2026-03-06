// ================================================
// SOTG — UI Helpers (toast, modal, etc.)
// ================================================

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

export function showModal(contentHtml) {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    container.innerHTML = `<div class="modal-handle"></div>${contentHtml}`;
    overlay.classList.remove('hidden');

    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
    };
}

export function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
}

export function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
}

export const LEVEL_NAMES = [
    'Unaware', 'Aware', 'Familiar', 'Competent', 'Proficient', 'Fluent', 'Creative'
];

export const PHASE_NAMES = {
    recon: 'Recon',
    deep_dive: 'Deep Dive',
    arena: 'Arena',
    debrief: 'Debrief',
    conquered: 'Conquered',
};

export const PHASE_ORDER = ['recon', 'deep_dive', 'arena', 'debrief', 'conquered'];

export const ACTIVITY_ICONS = {
    quest_conquered: '⚔️',
    level_up: '📈',
    streak: '🔥',
    journal_entry: '📖',
    quest_created: '🗺️',
    connection_found: '🔗',
    group_created: '👥',
    group_joined: '🤝',
    revenge_avenged: '💪',
    insight: '💡',
};

export const DOMAIN_COLORS = ['#ffffff', '#cccccc', '#999999', '#666666', '#444444', '#222222', '#111111', '#888888'];

export const DOMAIN_ICONS = ['📚', '🧮', '🔬', '💻', '🎵', '🎨', '🏋️', '✍️', '🧠', '🌍'];
