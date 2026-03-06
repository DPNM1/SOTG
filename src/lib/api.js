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
        .select('*')
        .eq('telegram_id', telegramUser.id)
        .single();

    if (existing) {
        currentUser = existing;
        // Update last active
        await supabase
            .from('users')
            .update({ last_active_date: new Date().toISOString().split('T')[0] })
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
            last_active_date: new Date().toISOString().split('T')[0],
        })
        .select()
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

export async function createQuest(arcId, title, coreQuestion, isBoss = false) {
    const { data, error } = await supabase
        .from('quests')
        .insert({
            arc_id: arcId,
            user_id: currentUser.id,
            title,
            core_question: coreQuestion,
            is_boss: isBoss,
        })
        .select('*, arcs!inner(*, domains!inner(*))')
        .single();
    if (error) throw error;
    // Log activity
    await logActivity('quest_created', `Started quest: ${title}`, data.id);
    return data;
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
        await supabase.from('quests').update({ conquered_at: new Date().toISOString() }).eq('id', questId);
        await logActivity('quest_conquered', `⚔️ Conquered: "${data.title}"`, questId);
        await updateStreak();
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
    await logActivity('journal_entry', `📖 Wrote journal entry`, null);
    await updateStreak();
    return data;
}

// ---- Activities ----
export async function getActivities(limit = 50) {
    const { data, error } = await supabase
        .from('activities')
        .select('*, users!inner(display_name, telegram_username)')
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

        const { count: connectionCount } = await supabase
            .from('connections')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        return {
            ...user,
            quests_conquered: conqueredCount || 0,
            total_levels: totalLevels,
            connections: connectionCount || 0,
            score: (conqueredCount || 0) * 100 + totalLevels * 10 + user.streak_current * 5 + (connectionCount || 0) * 20,
        };
    }));

    return leaderboard.sort((a, b) => b.score - a.score);
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
            await logActivity('streak', `🔥 ${newStreak}-day streak!`);
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
    await logActivity('connection_found', `🔗 Found connection: ${description}`);
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
