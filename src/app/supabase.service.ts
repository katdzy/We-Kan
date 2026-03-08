import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { Column, Card, Subtask } from './app';

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
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
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
  /** Gets all boards the user has access to, creating a default one if none exist. */
  async getAccessibleBoards(userId: string, email: string) {
    // Fetch display_name from auth user metadata, fall back to email
    const { data: { user: authUser } } = await this.supabase.auth.getUser();
    const display_name = authUser?.user_metadata?.['display_name'] || email;

    const { data: boards, error: fetchErr } = await this.supabase
      .from('boards')
      .select('id, title, owner_id')
      .order('created_at', { ascending: true });

    if (fetchErr) throw fetchErr;

    if (boards && boards.length > 0) {
      // Keep the user's own board title in sync with their display_name
      const ownBoard = boards.find(b => b.owner_id === userId);
      if (ownBoard) {
        const expectedTitle = `${display_name}'s Board`;
        if (ownBoard.title !== expectedTitle) {
          await this.supabase
            .from('boards')
            .update({ title: expectedTitle })
            .eq('id', ownBoard.id);
          ownBoard.title = expectedTitle;
        }
      }
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

    // Fetch emails via RPC for each member
    const members: BoardMember[] = [];
    for (const row of (data ?? []) as { user_id: string; role: string }[]) {
      const { data: emailData } = await this.supabase
        .rpc('get_user_email_by_id', { user_id_input: row.user_id });
      members.push({
        user_id: row.user_id,
        user_email: emailData ?? row.user_id,
        role: row.role as 'owner' | 'member',
      });
    }
    return members;
  }

  async inviteMember(boardId: string, email: string): Promise<void> {
    // Look up the user's UUID by email via a security-definer RPC
    const { data: targetUserId, error: lookupErr } = await this.supabase
      .rpc('get_user_id_by_email', { email_input: email });
    if (lookupErr) throw lookupErr;
    if (!targetUserId) throw new Error(`No user found with email: ${email}`);

    const { error } = await this.supabase.from('board_members').upsert(
      { board_id: boardId, user_id: targetUserId, role: 'member' },
      { onConflict: 'board_id,user_id', ignoreDuplicates: true }
    );
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
}
