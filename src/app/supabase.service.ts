import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { Column, Card, Subtask } from './app';

// ── DB row shapes ─────────────────────────────────────────────────────────────
interface ColumnRow {
  id: string;
  title: string;
  color: string;
  position: number;
  user_id: string;
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
  { title: 'Backlog',     color: '#6b7280' },
  { title: 'To Do',       color: '#3b82f6' },
  { title: 'In Progress', color: '#f59e0b' },
  { title: 'Done',        color: '#10b981' },
];

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // ── Load entire board ───────────────────────────────────────────────────────
  async loadBoard(): Promise<Column[]> {
    const { data: colRows, error: colErr } = await this.supabase
      .from('columns')
      .select('*')
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

    return (colRows as ColumnRow[]).map((col) => ({
      id: col.id,
      title: col.title,
      color: col.color,
      cards: cardsByCol.get(col.id) ?? [],
    }));
  }

  // ── Seed default columns for a new user ────────────────────────────────────
  async seedDefaultColumns(userId: string): Promise<Column[]> {
    const rows = DEFAULT_COLUMNS.map((col, i) => ({
      id: `${userId.slice(0, 8)}-col-${i}`,
      title: col.title,
      color: col.color,
      position: i,
      user_id: userId,
    }));

    const { error } = await this.supabase.from('columns').insert(rows);
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
}
