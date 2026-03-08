// ================================================
// SOTG — API Layer (Supabase + Groq via Edge Functions)
// ================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qclrzunrehfvzfpogpdu.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbHJ6dW5yZWhmdnpmcG9ncGR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MjEyMTksImV4cCI6MjA4NDM5NzIxOX0.NB-J-872ALGiw725H03j8JMB_km6daPjcNZW6bjNXko';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Current user state ----
let currentUser = null;

export function getCurrentUser() {
    return currentUser;
}

export function setCurrentUser(user) {
    currentUser = user;
}

// ---- Auth ----
export async function authenticateUser(telegramUser) {
    // Try to find existing user
    const { data: existing, error: fetchErr } = await supabase
        .from('users')
        .select('*, artifacts(*)')
        .eq('telegram_id', telegramUser.id)
        .single();

    if (existing) {
        currentUser = existing;
        // Update last active and avatar
        await supabase
            .from('users')
            .update({ 
                last_active_date: new Date().toISOString().split('T')[0],
                avatar_url: telegramUser.photo_url || existing.avatar_url
            })
            .eq('id', existing.id);
        return existing;
    }

    // Create new user
    const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert({
            telegram_id: telegramUser.id,
            telegram_username: telegramUser.username || null,
            display_name: telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : ''),
            avatar_url: telegramUser.photo_url || null,
            last_active_date: new Date().toISOString().split('T')[0],
            xp: 0,
            level: 1
        })
        .select('*, artifacts(*)')
        .single();

    if (createErr) throw createErr;
    currentUser = newUser;
    return newUser;
}

// ---- Domains ----
export async function getDomains(userId) {
    const uid = userId || currentUser?.id;
    const { data, error } = await supabase
        .from('domains')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

export async function createDomain(name, color, icon) {
    const { data, error } = await supabase
        .from('domains')
        .insert({ user_id: currentUser.id, name, color, icon })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ---- Arcs ----
export async function getArcs(domainId) {
    const { data, error } = await supabase
        .from('arcs')
        .select('*')
        .eq('domain_id', domainId)
        .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
}

export async function createArc(domainId, name, description, centralQuestion) {
    const { data, error } = await supabase
        .from('arcs')
        .insert({ domain_id: domainId, name, description, central_question: centralQuestion })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ---- Quests ----
export async function getQuests(userId) {
    const uid = userId || currentUser?.id;
    const { data, error } = await supabase
        .from('quests')
        .select('*, arcs!inner(*, domains!inner(*))')
        .eq('user_id', uid)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

export async function createQuest(arcId, title, coreQuestion, isBoss = false, scheduledDate = null, goalId = null) {
    // AI categorization: If title starts with emoji or common simple verbs, mark as routine
    const routineShortcuts = ['clean', 'buy', 'make', 'do', 'task', 'call', 'fix', 'run', 'order'];
    const lowerTitle = title.toLowerCase();
    const isRoutine = routineShortcuts.some(word => lowerTitle.startsWith(word)) || /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u.test(title);

    let finalArcId = arcId;

    // If routine, ensure it belongs to the "Routine" domain
    if (isRoutine) {
        const domains = await getDomains();
        let routineDom = domains.find(d => d.name === 'Routine');
        if (!routineDom) {
            routineDom = await createDomain('Routine', '#222222', 'clipboard-list');
        }
        
        // Find or create 'General' arc in Routine domain
        const { data: arcs } = await supabase.from('arcs').select('*').eq('domain_id', routineDom.id).eq('name', 'General');
        if (arcs && arcs.length > 0) {
            finalArcId = arcs[0].id;
        } else {
            const newArc = await createArc(routineDom.id, 'General', 'General routine tasks', '');
            finalArcId = newArc.id;
        }
    }

    const { data, error } = await supabase
        .from('quests')
        .insert({
            arc_id: finalArcId,
            user_id: currentUser.id,
            title,
            core_question: coreQuestion,
            is_boss: isBoss,
            scheduled_date: scheduledDate,
            is_routine: isRoutine,
            goal_id: goalId,
            phase: 'recon' // Always start as open
        })
        .select('*, arcs!inner(*, domains!inner(*))')
        .single();
    if (error) throw error;
    
    // Log activity
    await logActivity('quest_created', `Started ${isRoutine ? 'routine' : ''} quest: ${title}`, data.id);
    
    return data;
}

async function updateXP(reward) {
    const newXP = (currentUser.xp || 0) + reward;
    const newLevel = Math.floor(Math.sqrt(newXP / 10)) + 1;
    
    const { data: updatedUser } = await supabase
        .from('users')
        .update({ xp: newXP, level: newLevel })
        .eq('id', currentUser.id)
        .select().single();
    
    if (updatedUser) currentUser = updatedUser;
}

export async function updateQuest(questId, updates) {
    const { data, error } = await supabase
        .from('quests')
        .update(updates)
        .eq('id', questId)
        .select('*, arcs!inner(*, domains!inner(*))')
        .single();
    if (error) throw error;

    // Log level up
    if (updates.level !== undefined && data) {
        await logActivity('level_up', `Reached Level ${updates.level} on "${data.title}"`, questId);
    }

    // Log conquered
    if (updates.phase === 'conquered' && data) {
        if (!data.conquered_at) {
            await supabase.from('quests').update({ conquered_at: new Date().toISOString() }).eq('id', questId);
            await updateXP(data.xp_reward || 10);
            await logActivity('quest_conquered', `Conquered: "${data.title}" (+${data.xp_reward || 10} XP)`, questId);
            await updateStreak();
            await checkArtifacts(data.category);
        }
    }

    return data;
}

// ---- Journal ----
export async function getJournalEntries(userId, limit = 30) {
    const uid = userId || currentUser?.id;
    const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', uid)
        .order('entry_date', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data;
}

export async function createJournalEntry(content, mood) {
    const today = new Date().toISOString().split('T')[0];

    // Check if entry exists for today
    const { data: existing } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('entry_date', today)
        .single();

    if (existing) {
        const { data, error } = await supabase
            .from('journal_entries')
            .update({ content, mood })
            .eq('id', existing.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    const { data, error } = await supabase
        .from('journal_entries')
        .insert({ user_id: currentUser.id, content, mood, entry_date: today })
        .select()
        .single();
    if (error) throw error;
    await logActivity('journal_entry', `Wrote journal entry`, null);
    await updateStreak();
    return data;
}

// ---- Activities ----
export async function getActivities(limit = 50) {
    const { data, error } = await supabase
        .from('activities')
        .select('*, users!inner(display_name, telegram_username, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data;
}

export async function logActivity(type, title, questId = null, detail = null) {
    await supabase.from('activities').insert({
        user_id: currentUser.id,
        activity_type: type,
        title,
        quest_id: questId,
        detail,
    });
}

// ---- Friend Groups ----
export async function getMyGroups() {
    const { data, error } = await supabase
        .from('group_members')
        .select('*, friend_groups!inner(*)')
        .eq('user_id', currentUser.id);
    if (error) throw error;
    return data.map(gm => gm.friend_groups);
}

export async function createGroup(name) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data, error } = await supabase
        .from('friend_groups')
        .insert({ name, invite_code: code, created_by: currentUser.id })
        .select()
        .single();
    if (error) throw error;

    // Add creator as member
    await supabase.from('group_members').insert({ group_id: data.id, user_id: currentUser.id });
    await logActivity('group_created', `Created squad: ${name}`);
    return data;
}

export async function joinGroup(inviteCode) {
    const { data: group, error: findErr } = await supabase
        .from('friend_groups')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single();
    if (findErr || !group) throw new Error('Invalid invite code');

    const { error: joinErr } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: currentUser.id });

    if (joinErr) {
        if (joinErr.code === '23505') throw new Error('Already in this squad');
        throw joinErr;
    }

    await logActivity('group_joined', `Joined squad: ${group.name}`);
    return group;
}

export async function getGroupMembers(groupId) {
    const { data, error } = await supabase
        .from('group_members')
        .select('*, users!inner(*)')
        .eq('group_id', groupId);
    if (error) throw error;
    return data.map(gm => gm.users);
}

// ---- Leaderboard ----
export async function getLeaderboard() {
    // Get all users
    const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('*')
        .order('streak_current', { ascending: false });

    if (usersErr) throw usersErr;

    // Get quest counts and total levels for each user
    const leaderboard = await Promise.all(users.map(async (user) => {
        const { count: conqueredCount } = await supabase
            .from('quests')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('phase', 'conquered');

        const { data: quests } = await supabase
            .from('quests')
            .select('level')
            .eq('user_id', user.id);

        const totalLevels = (quests || []).reduce((sum, q) => sum + q.level, 0);

        const { data: recentTriumphs } = await supabase
            .from('quests')
            .select('title')
            .eq('user_id', user.id)
            .eq('phase', 'conquered')
            .order('conquered_at', { ascending: false })
            .limit(3);

        const { count: connectionCount } = await supabase
            .from('connections')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        return {
            ...user,
            quests_conquered: conqueredCount || 0,
            recent_triumphs: recentTriumphs?.map(q => q.title) || [],
            total_levels: totalLevels,
            connections: connectionCount || 0,
            score: (user.xp || 0) + (user.streak_current * 10) + (connectionCount || 0) * 20,
        };
    }));

    return leaderboard.sort((a, b) => b.score - a.score);
}

// ---- Artifacts & Badges ----
async function checkArtifacts(category) {
    if (!currentUser) return;

    // Check if user already has an artifact for this category
    const { data: existing } = await supabase
        .from('artifacts')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('name', `${category} Master`);

    if (existing && existing.length > 0) return;

    // Check if all quests in this category are conquered
    const { data: quests } = await supabase
        .from('quests')
        .select('id, phase')
        .eq('user_id', currentUser.id)
        .eq('category', category);

    const allConquered = quests.length > 0 && quests.every(q => q.phase === 'conquered');

    if (allConquered) {
        const artifactNames = {
            'Mechanics': 'Vinci Gear',
            'Logic': 'Euler Lantern',
            'History': 'Herodotus Stone',
            'Biology': 'Darwin Wing',
            'Physics': 'Newton Prism',
            'General': 'SOTG Token'
        };

        const name = artifactNames[category] || `${category} Relic`;
        const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-award"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`;

        await supabase.from('artifacts').insert({
            user_id: currentUser.id,
            name: name,
            description: `Mastered the domain of ${category}.`,
            icon_svg: icon
        });

        await logActivity('artifact_earned', `Uncovered Artifact: ${name}!`);
    }
}

export async function getArtifacts(userId) {
    const uid = userId || currentUser?.id;
    const { data, error } = await supabase
        .from('artifacts')
        .select('*')
        .eq('user_id', uid);
    if (error) throw error;
    return data;
}

// ---- Streaks ----
async function updateStreak() {
    if (!currentUser) return;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let newStreak = currentUser.streak_current;

    if (currentUser.last_active_date === yesterday) {
        newStreak += 1;
    } else if (currentUser.last_active_date !== today) {
        newStreak = 1;
    }

    const best = Math.max(newStreak, currentUser.streak_best);

    const { data } = await supabase
        .from('users')
        .update({
            streak_current: newStreak,
            streak_best: best,
            last_active_date: today,
        })
        .eq('id', currentUser.id)
        .select()
        .single();

    if (data) {
        currentUser = data;

        if (newStreak > 0 && newStreak % 7 === 0) {
            await logActivity('streak', `${newStreak}-day streak!`);
        }
    }
}

// ---- Connections (Knowledge Graph) ----
export async function getConnections(userId) {
    const uid = userId || currentUser?.id;
    const { data, error } = await supabase
        .from('connections')
        .select('*, quest_a:quests!connections_quest_a_id_fkey(title), quest_b:quests!connections_quest_b_id_fkey(title)')
        .eq('user_id', uid);
    if (error) throw error;
    return data;
}

export async function createConnection(questAId, questBId, description) {
    const { data, error } = await supabase
        .from('connections')
        .insert({ user_id: currentUser.id, quest_a_id: questAId, quest_b_id: questBId, description })
        .select()
        .single();
    if (error) throw error;
    await logActivity('connection_found', `Found connection: ${description}`);
    return data;
}

// ---- Goals ----
export async function getGoals() {
    const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function createGoal(title, description) {
    const { data, error } = await supabase
        .from('goals')
        .insert({ user_id: currentUser.id, title, description })
        .select()
        .single();
    if (error) throw error;
    await logActivity('goal_created', `Set ultimate goal: ${title}`);
    return data;
}

// ---- AI (Groq via Edge Function) ----
export async function callAI(mode, prompt, context = '') {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: { mode, prompt, context },
    });
    if (error) throw error;
    return data;
}

export async function generateQuests(subject, level = 'beginner') {
    const { data, error } = await supabase.functions.invoke('quest-generate', {
        body: { subject, level, user_id: currentUser.id },
    });
    if (error) throw error;
    return data;
}

// ---- Realtime ----
export function subscribeToActivities(callback) {
    return supabase
        .channel('activities-feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, (payload) => {
            callback(payload.new);
        })
        .subscribe();
}

// ---- User Stats ----
export async function getUserStats(userId) {
    const uid = userId || currentUser?.id;

    const { data: quests } = await supabase.from('quests').select('level, phase').eq('user_id', uid);
    const { count: journalCount } = await supabase.from('journal_entries').select('*', { count: 'exact', head: true }).eq('user_id', uid);
    const { count: connectionsCount } = await supabase.from('connections').select('*', { count: 'exact', head: true }).eq('user_id', uid);

    const conquered = (quests || []).filter(q => q.phase === 'conquered').length;
    const totalLevel = (quests || []).reduce((sum, q) => sum + q.level, 0);
    const avgLevel = quests?.length ? (totalLevel / quests.length).toFixed(1) : '0';

    return {
        totalQuests: quests?.length || 0,
        conquered,
        totalLevel,
        avgLevel,
        journalEntries: journalCount || 0,
        connections: connectionsCount || 0,
    };
}
