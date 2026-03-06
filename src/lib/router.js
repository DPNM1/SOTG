// ================================================
// SOTG — Simple Hash Router
// ================================================

const routes = {};
let currentPage = null;

export function registerPage(name, renderFn) {
    routes[name] = renderFn;
}

export function navigate(pageName) {
    if (currentPage === pageName) return;
    currentPage = pageName;
    window.location.hash = pageName;
    renderCurrentPage();
    updateNavButtons();
}

export function getCurrentPage() {
    return currentPage;
}

function renderCurrentPage() {
    const container = document.getElementById('page-container');
    if (!container) return;
    const renderFn = routes[currentPage];
    if (renderFn) {
        container.innerHTML = '';
        const page = renderFn();
        if (typeof page === 'string') {
            container.innerHTML = page;
        } else if (page instanceof HTMLElement) {
            container.appendChild(page);
        }
        // Trigger page init callbacks
        const event = new CustomEvent('page:mounted', { detail: { page: currentPage } });
        document.dispatchEvent(event);
    }
}

function updateNavButtons() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === currentPage);
    });
}

export function initRouter() {
    // Handle hash changes
    window.addEventListener('hashchange', () => {
        const page = window.location.hash.replace('#', '') || 'quests';
        if (routes[page] && page !== currentPage) {
            currentPage = page;
            renderCurrentPage();
            updateNavButtons();
        }
    });

    // Nav button clicks
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    // Initial page
    const initial = window.location.hash.replace('#', '') || 'quests';
    navigate(initial);
}
