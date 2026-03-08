// ================================================
// SOTG — Rhizome Graph View (Visual Knowledge)
// ================================================

import { getQuests, getConnections } from '../lib/api.js';
import { showQuestDetail } from './quests.js';

let canvas, ctx;
let nodes = [];
let links = [];
let animationId;
let isDragging = false;
let draggedNode = null;
let hoverNode = null;
let transform = { x: 0, y: 0, scale: 1 };
let lastMousePos = { x: 0, y: 0 };

export function renderGraphPage() {
    const page = document.createElement('div');
    page.className = 'page';
    page.style.padding = '0'; // Full screen feel
    page.style.overflow = 'hidden';
    page.style.height = 'calc(100vh - 80px)';
    
    page.innerHTML = `
        <div class="graph-header" style="position:absolute; top:20px; left:20px; z-index:10; pointer-events:none;">
            <h2 class="section-title" style="margin:0;">Rhizome Graph</h2>
            <p style="font-size:12px; color:var(--text-hint);">Interactive Knowledge Network</p>
        </div>
        
        <div class="graph-controls" style="position:absolute; bottom:20px; right:20px; z-index:10; display:flex; flex-direction:column; gap:8px;">
            <button class="btn btn-glass" id="reset-graph-btn"><i data-lucide="maximize" style="width:16px;height:16px;"></i></button>
            <button class="btn btn-glass" id="zoom-in-btn"><i data-lucide="plus" style="width:16px;height:16px;"></i></button>
            <button class="btn btn-glass" id="zoom-out-btn"><i data-lucide="minus" style="width:16px;height:16px;"></i></button>
        </div>

        <canvas id="rhizome-canvas" style="width:100%; height:100%; background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #000 100%); cursor: grab;"></canvas>
    `;

    document.addEventListener('page:mounted', function handler(e) {
        if (e.detail.page === 'graph') {
            document.removeEventListener('page:mounted', handler);
            initGraph();
        }
    });

    return page;
}

async function initGraph() {
    canvas = document.getElementById('rhizome-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    if (window.lucide) window.lucide.createIcons();

    // Data Loading
    try {
        const [questData, connectionData] = await Promise.all([
            getQuests(),
            getConnections()
        ]);
        
        setupForceGraph(questData, connectionData);
    } catch (err) {
        console.error('Failed to load graph data:', err);
    }

    // Controls
    document.getElementById('reset-graph-btn')?.addEventListener('click', () => {
        transform = { x: 0, y: 0, scale: 1 };
    });
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
        transform.scale *= 1.2;
    });
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
        transform.scale *= 0.8;
    });

    // Interaction
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
    canvas.addEventListener('touchstart', (e) => onMouseDown(e.touches[0]));
    window.addEventListener('touchmove', (e) => onMouseMove(e.touches[0]));
    window.addEventListener('touchend', onMouseUp);

    startAnimation();
}

function resizeCanvas() {
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth * window.devicePixelRatio;
    canvas.height = parent.clientHeight * window.devicePixelRatio;
}

function setupForceGraph(questData, connectionData) {
    nodes = questData.map(q => ({
        id: q.id,
        label: q.title,
        color: q.arcs?.domains?.color || '#fff',
        radius: q.is_boss ? 8 : 5,
        x: (Math.random() - 0.5) * 500,
        y: (Math.random() - 0.5) * 500,
        vx: 0,
        vy: 0,
        quest: q
    }));

    links = connectionData.map(c => {
        const source = nodes.find(n => n.id === c.quest_a_id);
        const target = nodes.find(n => n.id === c.quest_b_id);
        return { source, target, label: c.description };
    }).filter(l => l.source && l.target);

    // Also link quests within the same arc automatically
    const arcGroups = {};
    nodes.forEach(n => {
        if (!arcGroups[n.quest.arc_id]) arcGroups[n.quest.arc_id] = [];
        arcGroups[n.quest.arc_id].push(n);
    });

    Object.values(arcGroups).forEach(group => {
        for (let i = 0; i < group.length - 1; i++) {
            links.push({ source: group[i], target: group[i+1], strength: 0.1, isImplicit: true });
        }
    });
}

function startAnimation() {
    if (animationId) cancelAnimationFrame(animationId);
    
    function animate() {
        updatePhysics();
        draw();
        animationId = requestAnimationFrame(animate);
    }
    
    animate();
}

function updatePhysics() {
    const friction = 0.95;
    const repulsion = 1000;
    const attraction = 0.05;
    const centerAttraction = 0.01;

    // Repulsion between nodes
    for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const distSq = dx * dx + dy * dy || 1;
            const force = repulsion / distSq;
            const fx = (dx / Math.sqrt(distSq)) * force;
            const fy = (dy / Math.sqrt(distSq)) * force;
            
            n1.vx += fx;
            n1.vy += fy;
            n2.vx -= fx;
            n2.vy -= fy;
        }
    }

    // Attraction (Links)
    links.forEach(l => {
        if (!l.source || !l.target) return;
        const dx = l.target.x - l.source.x;
        const dy = l.target.y - l.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const strength = l.isImplicit ? 0.01 : attraction;
        const fx = dx * strength;
        const fy = dy * strength;
        
        l.source.vx += fx;
        l.source.vy += fy;
        l.target.vx -= fx;
        l.target.vy -= fy;
    });

    // Center attraction
    nodes.forEach(n => {
        n.vx -= n.x * centerAttraction;
        n.vy -= n.y * centerAttraction;
    });

    // Move & Friction
    nodes.forEach(n => {
        if (n === draggedNode) return;
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= friction;
        n.vy *= friction;
    });
}

function draw() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    ctx.translate(centerX + transform.x, centerY + transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Draw Links
    links.forEach(l => {
        if (!l.source || !l.target) return;
        ctx.beginPath();
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);
        ctx.strokeStyle = l.isImplicit ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.2)';
        ctx.setLineDash(l.isImplicit ? [5, 5] : []);
        ctx.lineWidth = 1 / transform.scale;
        ctx.stroke();
    });
    ctx.setLineDash([]);

    // Draw Nodes
    nodes.forEach(n => {
        const isHover = n === hoverNode;
        const isDragged = n === draggedNode;

        // Glow
        if (isHover || isDragged) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
            ctx.fillStyle = n.color + '33';
            ctx.fill();
        }

        // Body
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.shadowBlur = isHover ? 10 : 0;
        ctx.shadowColor = n.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        if (isHover || isDragged || transform.scale > 0.8) {
            ctx.font = `${10 / transform.scale}px "Inter", sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.fillText(n.label, n.x, n.y + n.radius + (12 / transform.scale));
        }
    });
}

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    const mx = (e.clientX - rect.left);
    const my = (e.clientY - rect.top);
    
    // Reverse transform
    const x = (mx - centerX - transform.x) / transform.scale;
    const y = (my - centerY - transform.y) / transform.scale;
    
    return { x, y };
}

function onMouseDown(e) {
    const pos = getMousePos(e);
    draggedNode = nodes.find(n => {
        const dist = Math.sqrt((n.x - pos.x)**2 + (n.y - pos.y)**2);
        return dist < (n.radius + 20) / transform.scale;
    });

    if (!draggedNode) {
        isDragging = true;
        canvas.style.cursor = 'grabbing';
    }
    lastMousePos = { x: e.clientX, y: e.clientY };
}

function onMouseMove(e) {
    const pos = getMousePos(e);
    
    if (isDragging) {
        transform.x += (e.clientX - lastMousePos.x);
        transform.y += (e.clientY - lastMousePos.y);
    } else if (draggedNode) {
        draggedNode.x = pos.x;
        draggedNode.y = pos.y;
    } else {
        hoverNode = nodes.find(n => {
            const dist = Math.sqrt((n.x - pos.x)**2 + (n.y - pos.y)**2);
            return dist < (n.radius + 20) / transform.scale;
        });
        canvas.style.cursor = hoverNode ? 'pointer' : 'grab';
    }
    
    lastMousePos = { x: e.clientX, y: e.clientY };
}

function onMouseUp(e) {
    if (draggedNode && !isDragging) {
        const pos = getMousePos(e);
        const dist = Math.sqrt((draggedNode.x - pos.x)**2 + (draggedNode.y - pos.y)**2);
        // If it was just a click (or small move), open quest
        if (dist < 10) {
            showQuestDetail(draggedNode.quest);
        }
    }

    isDragging = false;
    draggedNode = null;
    canvas.style.cursor = 'grab';
}

function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    transform.scale *= delta;
    transform.scale = Math.min(Math.max(transform.scale, 0.2), 5);
}
