import { Injectable } from '@angular/core';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Column, Card, Subtask } from './app';
import { supabaseClient } from './supabase-client';

export interface ActivityLog {
  id: string;
  board_id: string;
  card_id: string | null;
  user_id: string;
  user_email: string;
  action: string;
  details: string;
  created_at: string;
}

export interface BoardMember {
  user_id: string;
  user_email: string;
  role: 'owner' | 'member';
}

export interface BoardInvitation {
  id: string;
  board_id: string;
  inviter_id: string;
  inviter_email: string;
  invitee_email: string;
  created_at: string;
  board_title?: string;
}

// ── DB row shapes ─────────────────────────────────────────────────────────────
interface ColumnRow {
  id: string;
  board_id: string;
  title: string;
  color: string;
  position: number;
}

interface CardRow {
  id: string;
  column_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  tag: string;
  position: number;
}

interface SubtaskRow {
  id: string;
  card_id: string;
  title: string;
  done: boolean;
  position: number;
}

// Default columns seeded for new users
const DEFAULT_COLUMNS = [
  { title: 'To Do', color: '#3b82f6' },
  { title: 'In Progress', color: '#f59e0b' },
  { title: 'To Review', color: '#6b7280' },
  { title: 'Done', color: '#10b981' },
];

// ── Service ───────────────────────────────────────────────────────────────────
// Custom storage imported from safe-storage.ts

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;
  // Unique per service instance – ensures channel names don't collide across HMR reloads
  private readonly sessionId = Math.random().toString(36).slice(2, 8);

  constructor() {
    this.supabase = supabaseClient;
  }

  // ── Load entire board ───────────────────────────────────────────────────────
  async loadBoard(boardId: string): Promise<Column[]> {
    const { data: colRows, error: colErr } = await this.supabase
      .from('columns')
      .select('*')
      .eq('board_id', boardId)
      .order('position');
    if (colErr) throw colErr;

    const { data: cardRows, error: cardErr } = await this.supabase
      .from('cards')
      .select('*')
      .order('position');
    if (cardErr) throw cardErr;

    const { data: subtaskRows, error: stErr } = await this.supabase
      .from('subtasks')
      .select('*')
      .order('position');
    if (stErr) throw stErr;

    // Map subtasks per card
    const subtasksByCard = new Map<string, Subtask[]>();
    for (const sr of subtaskRows as SubtaskRow[]) {
      if (!subtasksByCard.has(sr.card_id)) subtasksByCard.set(sr.card_id, []);
      subtasksByCard.get(sr.card_id)!.push({ id: sr.id, title: sr.title, done: sr.done });
    }

    // Map cards per column
    const cardsByCol = new Map<string, Card[]>();
    for (const cr of cardRows as CardRow[]) {
      if (!cardsByCol.has(cr.column_id)) cardsByCol.set(cr.column_id, []);
      cardsByCol.get(cr.column_id)!.push({
        id: cr.id,
        title: cr.title,
        description: cr.description,
        priority: cr.priority,
        tag: cr.tag,
        subtasks: subtasksByCard.get(cr.id) ?? [],
      });
    }

    const columns = (colRows as ColumnRow[]).map((col) => ({
      id: col.id,
      title: col.title,
      color: col.color,
      cards: cardsByCol.get(col.id) ?? [],
    }));

    // Backwards compatibility migration: rename 'Backlog' to 'To Review' and ensure correct order
    let needsUpdate = false;
    const targetOrder = ['To Do', 'In Progress', 'To Review', 'Done'];

    for (const col of columns) {
      if (col.title === 'Backlog') {
        col.title = 'To Review';
        needsUpdate = true;
      }
    }

    // Check if the current order of the default columns matches our target order
    const isOrdered = columns.slice(0, 4).every((c, i) => c.title === targetOrder[i]);
    if (!isOrdered || needsUpdate) {
      columns.sort((a, b) => {
        const indexA = targetOrder.indexOf(a.title);
        const indexB = targetOrder.indexOf(b.title);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });

      // Update positions in the database
      const updates = columns.map((col, index) => ({
        id: col.id,
        board_id: boardId,
        title: col.title,
        color: col.color,
        position: index,
      }));
      
      this.supabase.from('columns').upsert(updates, { onConflict: 'id' }).then();
    }

    return columns;
  }

  // ── Seed default columns for a new board ────────────────────────────────────
  async seedDefaultColumns(boardId: string): Promise<Column[]> {
    const rows = DEFAULT_COLUMNS.map((col, i) => ({
      id: `${boardId}-col-${i}`,
      title: col.title,
      color: col.color,
      position: i,
      board_id: boardId,
    }));

    const { error } = await this.supabase.from('columns').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;

    return rows.map((r) => ({ id: r.id, title: r.title, color: r.color, cards: [] }));
  }

  // ── Cards ───────────────────────────────────────────────────────────────────
  async addCard(columnId: string, card: Card, position: number): Promise<void> {
    const { error } = await this.supabase.from('cards').insert({
      id: card.id,
      column_id: columnId,
      title: card.title,
      description: card.description,
      priority: card.priority,
      tag: card.tag,
      position,
    });
    if (error) throw error;

    if (card.subtasks.length > 0) {
      const { error: stErr } = await this.supabase.from('subtasks').insert(
        card.subtasks.map((s, i) => ({
          id: s.id,
          card_id: card.id,
          title: s.title,
          done: s.done,
          position: i,
        })),
      );
      if (stErr) throw stErr;
    }
  }

  async updateCard(card: Card): Promise<void> {
    const { error } = await this.supabase
      .from('cards')
      .update({
        title: card.title,
        description: card.description,
        priority: card.priority,
        tag: card.tag,
      })
      .eq('id', card.id);
    if (error) throw error;
  }

  async deleteCard(cardId: string): Promise<void> {
    const { error } = await this.supabase.from('cards').delete().eq('id', cardId);
    if (error) throw error;
  }

  async moveCard(cardId: string, toColumnId: string, newPosition: number): Promise<void> {
    const { error } = await this.supabase
      .from('cards')
      .update({ column_id: toColumnId, position: newPosition })
      .eq('id', cardId);
    if (error) throw error;
  }

  // ── Subtasks ────────────────────────────────────────────────────────────────
  async syncSubtasks(cardId: string, subtasks: Subtask[]): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('subtasks')
      .delete()
      .eq('card_id', cardId);
    if (delErr) throw delErr;

    if (subtasks.length > 0) {
      const { error: insErr } = await this.supabase.from('subtasks').insert(
        subtasks.map((s, i) => ({
          id: s.id,
          card_id: cardId,
          title: s.title,
          done: s.done,
          position: i,
        })),
      );
      if (insErr) throw insErr;
    }
  }

  async toggleSubtask(subtaskId: string, done: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('subtasks')
      .update({ done })
      .eq('id', subtaskId);
    if (error) throw error;
  }

  // ── Boards ──────────────────────────────────────────────────────────────────
  async getAccessibleBoardsWithProgress(userId: string) {
    const { data: { user } } = await this.supabase.auth.getUser();
    const email = user?.email || '';
    
    // Get accessible boards
    const allBoards = await this.getAccessibleBoards(userId, email);
    
    const boardsWithProgress = await Promise.all(allBoards.map(async (board) => {
      // Fetch board full state to calculate progress
      const columns = await this.loadBoard(board.id);
      
      let totalCards = 0;
      let completedCards = 0;
      
      const doneColumnTitle = 'Done';
      
      for (const col of columns) {
        const isDoneColumn = col.title.toLowerCase() === doneColumnTitle.toLowerCase();
        
        for (const card of col.cards) {
          totalCards++;
          
          if (card.subtasks && card.subtasks.length > 0) {
            // Task has subtasks: Complete only if in 'Done' AND all subtasks are checked
            const allSubtasksDone = card.subtasks.every(st => st.done);
            if (isDoneColumn && allSubtasksDone) {
              completedCards++;
            }
          } else {
            // Task has no subtasks: Complete if in 'Done' column
            if (isDoneColumn) {
              completedCards++;
            }
          }
        }
      }
      
      const progress = totalCards === 0 ? 0 : Math.round((completedCards / totalCards) * 100);
      
      return {
        ...board,
        progress
      };
    }));
    
    return boardsWithProgress;
  }

  async getRecentBoardsWithProgress(userId: string) {
    const boardsWithProgress = await this.getAccessibleBoardsWithProgress(userId);
    // Take up to 3 most recent boards. Since getAccessibleBoards orders by created_at ascending,
    // we reverse the array to get the latest 3 boards first.
    return boardsWithProgress.slice().reverse().slice(0, 3);
  }

  /** Gets all boards the user has access to, creating a default one if none exist. */
  async getAccessibleBoards(userId: string, email: string) {
    // Fetch display_name from auth user metadata, fall back to email
    const { data: { user: authUser } } = await this.supabase.auth.getUser();
    const display_name = authUser?.user_metadata?.['display_name'] || email;

    const { data: boardsData, error: fetchErr } = await this.supabase
      .from('boards')
      .select('id, title, description, owner_id, color, theme, board_members(count)')
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;

    const boards = (boardsData || []).map((b: any) => ({
      ...b,
      member_count: b.board_members?.[0]?.count || 0
    }));

    if (boards && boards.length > 0) {
      return boards;
    }

    const boardId = `${userId.slice(0, 8)}-board`;
    const { error } = await this.supabase.from('boards').upsert(
      { id: boardId, title: `${display_name}'s Board`, owner_id: userId },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (error) throw error;

    // Ensure owner is in board_members
    const { error: memberErr } = await this.supabase.from('board_members').upsert(
      { board_id: boardId, user_id: userId, role: 'owner' },
      { onConflict: 'board_id,user_id', ignoreDuplicates: true }
    );
    if (memberErr) throw memberErr;

    return [{ id: boardId, title: `${display_name}'s Board`, owner_id: userId }];
  }

  /** Creates a new board with default columns for the given user. */
  async createBoard(userId: string, title: string, description?: string, color?: string): Promise<{ id: string; title: string; owner_id: string; color: string; member_count: number }> {
    const boardId = `${userId.slice(0, 8)}-${Date.now()}`;
    const boardColor = color || '#BDF522';

    const { error } = await this.supabase.from('boards').insert({
      id: boardId,
      title: title.trim(),
      description: description?.trim() || null,
      color: boardColor,
      owner_id: userId,
    });
    if (error) throw error;

    // Add owner to board_members
    const { error: memberErr } = await this.supabase.from('board_members').insert({
      board_id: boardId,
      user_id: userId,
      role: 'owner',
    });
    if (memberErr) throw memberErr;

    // Seed default columns
    await this.seedDefaultColumns(boardId);

    return { id: boardId, title: title.trim(), owner_id: userId, color: boardColor, member_count: 1 };
  }

  async updateBoard(boardId: string, title: string, description?: string, color?: string, theme?: string): Promise<void> {
    const { error } = await this.supabase
      .from('boards')
      .update({
        title: title.trim(),
        description: description?.trim() || null,
        color,
        theme: theme ?? null
      })
      .eq('id', boardId);
    if (error) throw error;
  }

  async deleteBoard(boardId: string): Promise<void> {
    const { error } = await this.supabase
      .from('boards')
      .delete()
      .eq('id', boardId);
    if (error) throw error;
  }

  // ── Activity Logs ───────────────────────────────────────────────────────────
  async logActivity(
    boardId: string,
    cardId: string | null,
    action: string,
    details: string,
    userEmail: string
  ): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;
    // Embed user email in details for display (no join needed on select)
    const { error } = await this.supabase.from('activity_logs').insert({
      board_id: boardId,
      card_id: cardId ?? undefined,
      user_id: user.id,
      action,
      details: `[${userEmail}] ${details}`,
    });
    // Swallow log errors silently so they never break the main flow
    if (error) console.warn('logActivity error', error);
  }

  async getActivityLogs(boardId: string): Promise<ActivityLog[]> {
    const { data, error } = await this.supabase
      .from('activity_logs')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    // Parse user_email out of the details string prefix `[email] ...`
    return (data ?? []).map((row: any) => {
      const match = row.details.match(/^\[(.+?)\] (.*)$/);
      return {
        id: row.id,
        board_id: row.board_id,
        card_id: row.card_id ?? null,
        user_id: row.user_id,
        user_email: match ? match[1] : 'Unknown',
        action: row.action,
        details: match ? match[2] : row.details,
        created_at: row.created_at,
      } as ActivityLog;
    });
  }

  // ── Board Members ───────────────────────────────────────────────────────────
  async getBoardMembers(boardId: string): Promise<BoardMember[]> {
    const { data, error } = await this.supabase
      .from('board_members')
      .select('user_id, role')
      .eq('board_id', boardId);
    if (error) throw error;

    // Fetch emails via RPC for each member concurrently
    const memberPromises = (data ?? []).map(async (row: any) => {
      const { data: emailData } = await this.supabase
        .rpc('get_user_email_by_id', { user_id_input: row.user_id });
      
      return {
        user_id: row.user_id,
        user_email: emailData ?? row.user_id,
        role: row.role as 'owner' | 'member',
      } as BoardMember;
    });

    const members = await Promise.all(memberPromises);
    return members;
  }

  async inviteMember(boardId: string, email: string, boardTitle = '', inviterEmail = ''): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');

    const { error } = await this.supabase
      .from('board_invitations')
      .insert({
        board_id: boardId,
        inviter_id: user.id,
        inviter_email: inviterEmail || user.email || '',
        board_title: boardTitle,
        invitee_email: email.toLowerCase(),
      });

    if (error) {
      if (error.code === '23505') {
         throw new Error('This user has already been invited.');
      }
      throw error;
    }
  }

  async getPendingInvitations(email: string): Promise<BoardInvitation[]> {
    const { data, error } = await this.supabase
      .from('board_invitations')
      .select('id, board_id, inviter_id, inviter_email, board_title, invitee_email, created_at')
      .eq('invitee_email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      board_id: row.board_id,
      inviter_id: row.inviter_id,
      inviter_email: row.inviter_email || 'Someone',
      invitee_email: row.invitee_email,
      created_at: row.created_at,
      board_title: row.board_title || 'a board',
    } as BoardInvitation));
  }

  async getBoardInvitations(boardId: string): Promise<BoardInvitation[]> {
    const { data, error } = await this.supabase
      .from('board_invitations')
      .select('id, board_id, inviter_id, inviter_email, board_title, invitee_email, created_at')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
      id: row.id,
      board_id: row.board_id,
      inviter_id: row.inviter_id,
      inviter_email: row.inviter_email || 'Someone',
      invitee_email: row.invitee_email,
      created_at: row.created_at,
      board_title: row.board_title || 'a board',
    } as BoardInvitation));
  }

  async acceptInvitation(invitationId: string, boardId: string, userId: string): Promise<void> {
    // 1. Insert into board_members
    const { data: existing, error: checkErr } = await this.supabase
      .from('board_members')
      .select('id')
      .eq('board_id', boardId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await this.supabase.from('board_members').insert({
        board_id: boardId,
        user_id: userId,
        role: 'member'
      });
      if (insertErr) throw insertErr;
    }

    // 2. Delete the invitation
    const { error: delErr } = await this.supabase
      .from('board_invitations')
      .delete()
      .eq('id', invitationId);
    if (delErr) throw delErr;
  }

  async declineInvitation(invitationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('board_invitations')
      .delete()
      .eq('id', invitationId);
    if (error) throw error;
  }

  async removeMember(boardId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('board_members')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  // ── Real-time subscriptions ─────────────────────────────────────────────────
  /**
   * Subscribes to real-time changes on the board's tables.
   * Calls `callback` whenever a card, column, subtask, or activity log changes.
   * Returns the channel so the caller can unsubscribe later.
   */
  subscribeToBoardChanges(boardId: string, callback: () => void): RealtimeChannel {
    const channel = this.supabase
      .channel(`board-${boardId}-${this.sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'columns', filter: `board_id=eq.${boardId}` },
        callback
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_logs', filter: `board_id=eq.${boardId}` },
        callback
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_members', filter: `board_id=eq.${boardId}` },
        callback
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_invitations', filter: `board_id=eq.${boardId}` },
        callback
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn(`[Realtime board-${boardId}] subscription status: ${status}`, err);
        }
      });

    return channel;
  }

  /** Removes a Realtime channel subscription. */
  unsubscribeFromBoard(channel: RealtimeChannel): void {
    this.supabase.removeChannel(channel);
  }
}
