import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  tag: string;
  subtasks: Subtask[];
}

export interface Column {
  id: string;
  title: string;
  color: string;
  cards: Card[];
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private supabase = inject(SupabaseService);
  authService = inject(AuthService);

  // ── Board state ───────────────────────────────────────────────────────────
  columns = signal<Column[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  // ── Auth UI state ─────────────────────────────────────────────────────────
  authMode = signal<'login' | 'signup'>('login');
  authEmail = signal('');
  authPassword = signal('');
  authError = signal<string | null>(null);
  authLoading = signal(false);
  /** True after sign-up until user confirms their email (if confirmation required) */
  signupConfirmPending = signal(false);

  // ── Drag state ────────────────────────────────────────────────────────────
  draggingCard = signal<{ card: Card; fromColumnId: string } | null>(null);
  dragOverColumnId = signal<string | null>(null);
  dragOverCardId = signal<string | null>(null);

  // ── Add card modal ────────────────────────────────────────────────────────
  showAddModal = signal(false);
  addingToColumnId = signal<string | null>(null);
  newCard = signal<Partial<Card> & { subtasks: Subtask[] }>({
    title: '', description: '', priority: 'medium', tag: '', subtasks: [],
  });
  newSubtaskText = signal('');

  // ── Edit card modal ───────────────────────────────────────────────────────
  showEditModal = signal(false);
  editingCard = signal<{ card: Card; columnId: string } | null>(null);
  editCard = signal<Partial<Card> & { subtasks: Subtask[] }>({ subtasks: [] });
  editSubtaskText = signal('');

  totalCards = computed(() => this.columns().reduce((sum, col) => sum + col.cards.length, 0));

  constructor() {
    // When session changes (login / logout), load or clear board
    effect(() => {
      const session = this.authService.session();
      if (session) {
        this.loadBoard();
      } else {
        this.columns.set([]);
        this.loading.set(false);
      }
    });
  }

  async ngOnInit() {
    // Initial load is handled by the effect above once session resolves
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  setAuthMode(mode: 'login' | 'signup') {
    this.authMode.set(mode);
    this.authError.set(null);
    this.signupConfirmPending.set(false);
  }

  async submitAuth() {
    const email = this.authEmail().trim();
    const password = this.authPassword();
    if (!email || !password) return;

    this.authLoading.set(true);
    this.authError.set(null);

    try {
      if (this.authMode() === 'signup') {
        await this.authService.signUp(email, password);
        // Supabase may require email confirmation; check if session was set
        const session = this.authService.session();
        if (!session) {
          // Email confirmation is required
          this.signupConfirmPending.set(true);
        }
        // If session was set automatically, the effect will call loadBoard.
        // Seed default columns for the new user (only if we have a session).
        if (session) {
          const cols = await this.supabase.seedDefaultColumns(session.user.id);
          this.columns.set(cols);
        }
      } else {
        await this.authService.signIn(email, password);
        // effect() will call loadBoard()
      }
    } catch (err: any) {
      this.authError.set(err?.message ?? 'Authentication failed');
    } finally {
      this.authLoading.set(false);
    }
  }

  async signOut() {
    await this.authService.signOut();
    // effect() will clear columns automatically
  }

  // ── Board load ────────────────────────────────────────────────────────────
  async loadBoard() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const cols = await this.supabase.loadBoard();
      // If brand new user with no columns, seed them
      if (cols.length === 0) {
        const userId = this.authService.user()?.id;
        if (userId) {
          const seeded = await this.supabase.seedDefaultColumns(userId);
          this.columns.set(seeded);
        } else {
          this.columns.set([]);
        }
      } else {
        this.columns.set(cols);
      }
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load board');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Card utilities ────────────────────────────────────────────────────────
  progress(card: Card): number {
    if (!card.subtasks.length) return 0;
    return Math.round((card.subtasks.filter((s) => s.done).length / card.subtasks.length) * 100);
  }

  doneCount(card: Card): number {
    return card.subtasks.filter((s) => s.done).length;
  }

  toggleSubtask(cardId: string, columnId: string, subtaskId: string) {
    let newDone = false;
    this.columns.update((cols) =>
      cols.map((col) =>
        col.id !== columnId ? col : {
          ...col,
          cards: col.cards.map((c) =>
            c.id !== cardId ? c : {
              ...c,
              subtasks: c.subtasks.map((s) => {
                if (s.id === subtaskId) { newDone = !s.done; return { ...s, done: newDone }; }
                return s;
              }),
            }
          ),
        }
      )
    );
    this.supabase.toggleSubtask(subtaskId, newDone).catch((err) => console.error('toggleSubtask', err));
  }

  // ── Add card modal ────────────────────────────────────────────────────────
  openAddModal(columnId: string) {
    this.addingToColumnId.set(columnId);
    this.newCard.set({ title: '', description: '', priority: 'medium', tag: '', subtasks: [] });
    this.newSubtaskText.set('');
    this.showAddModal.set(true);
  }

  closeAddModal() {
    this.showAddModal.set(false);
    this.addingToColumnId.set(null);
  }

  addNewSubtask() {
    const text = this.newSubtaskText().trim();
    if (!text) return;
    this.newCard.update((c) => ({
      ...c,
      subtasks: [...(c.subtasks ?? []), { id: 's' + Date.now(), title: text, done: false }],
    }));
    this.newSubtaskText.set('');
  }

  removeNewSubtask(id: string) {
    this.newCard.update((c) => ({ ...c, subtasks: c.subtasks.filter((s) => s.id !== id) }));
  }

  async submitAddCard() {
    const card = this.newCard();
    if (!card.title?.trim()) return;
    const columnId = this.addingToColumnId();
    if (!columnId) return;

    const newCardObj: Card = {
      id: 'c' + Date.now(),
      title: card.title.trim(),
      description: card.description?.trim() ?? '',
      priority: card.priority as 'low' | 'medium' | 'high',
      tag: card.tag?.trim() ?? '',
      subtasks: card.subtasks ?? [],
    };

    let position = 0;
    this.columns.update((cols) =>
      cols.map((col) => {
        if (col.id !== columnId) return col;
        position = col.cards.length;
        return { ...col, cards: [...col.cards, newCardObj] };
      })
    );
    this.closeAddModal();

    this.supabase.addCard(columnId, newCardObj, position).catch((err) => {
      console.error('addCard', err);
      this.columns.update((cols) =>
        cols.map((col) =>
          col.id === columnId ? { ...col, cards: col.cards.filter((c) => c.id !== newCardObj.id) } : col
        )
      );
    });
  }

  // ── Edit card modal ───────────────────────────────────────────────────────
  openEditModal(card: Card, columnId: string) {
    this.editingCard.set({ card, columnId });
    this.editCard.set({ ...card, subtasks: card.subtasks.map((s) => ({ ...s })) });
    this.editSubtaskText.set('');
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editingCard.set(null);
  }

  addEditSubtask() {
    const text = this.editSubtaskText().trim();
    if (!text) return;
    this.editCard.update((c) => ({
      ...c,
      subtasks: [...(c.subtasks ?? []), { id: 's' + Date.now(), title: text, done: false }],
    }));
    this.editSubtaskText.set('');
  }

  removeEditSubtask(id: string) {
    this.editCard.update((c) => ({ ...c, subtasks: c.subtasks.filter((s) => s.id !== id) }));
  }

  toggleEditSubtask(id: string) {
    this.editCard.update((c) => ({
      ...c,
      subtasks: c.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)),
    }));
  }

  async submitEditCard() {
    const editing = this.editingCard();
    const updated = this.editCard();
    if (!editing || !updated.title?.trim()) return;

    const updatedCard: Card = {
      ...editing.card,
      title: updated.title!.trim(),
      description: updated.description?.trim() ?? '',
      priority: updated.priority as 'low' | 'medium' | 'high',
      tag: updated.tag?.trim() ?? '',
      subtasks: updated.subtasks ?? [],
    };
    const previousCard = editing.card;

    this.columns.update((cols) =>
      cols.map((col) =>
        col.id === editing.columnId
          ? { ...col, cards: col.cards.map((c) => c.id === editing.card.id ? updatedCard : c) }
          : col
      )
    );
    this.closeEditModal();

    try {
      await this.supabase.updateCard(updatedCard);
      await this.supabase.syncSubtasks(updatedCard.id, updatedCard.subtasks);
    } catch (err) {
      console.error('submitEditCard', err);
      this.columns.update((cols) =>
        cols.map((col) =>
          col.id === editing.columnId
            ? { ...col, cards: col.cards.map((c) => c.id === previousCard.id ? previousCard : c) }
            : col
        )
      );
    }
  }

  deleteCard(cardId: string, columnId: string) {
    let removedCard: Card | undefined;
    let removedIndex = 0;
    this.columns.update((cols) =>
      cols.map((col) => {
        if (col.id !== columnId) return col;
        removedIndex = col.cards.findIndex((c) => c.id === cardId);
        removedCard = col.cards[removedIndex];
        return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
      })
    );
    this.supabase.deleteCard(cardId).catch((err) => {
      console.error('deleteCard', err);
      if (removedCard) {
        this.columns.update((cols) =>
          cols.map((col) => {
            if (col.id !== columnId) return col;
            const cards = [...col.cards];
            cards.splice(removedIndex, 0, removedCard!);
            return { ...col, cards };
          })
        );
      }
    });
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  onDragStart(event: DragEvent, card: Card, fromColumnId: string) {
    this.draggingCard.set({ card, fromColumnId });
    event.dataTransfer!.effectAllowed = 'move';
    (event.target as HTMLElement).classList.add('dragging');
  }

  onDragEnd(event: DragEvent) {
    (event.target as HTMLElement).classList.remove('dragging');
    this.draggingCard.set(null);
    this.dragOverColumnId.set(null);
    this.dragOverCardId.set(null);
  }

  onDragOver(event: DragEvent, columnId: string, cardId?: string) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dragOverColumnId.set(columnId);
    this.dragOverCardId.set(cardId ?? null);
  }

  onDrop(event: DragEvent, toColumnId: string, targetCardId?: string) {
    event.preventDefault();
    const dragging = this.draggingCard();
    if (!dragging) return;

    const { card, fromColumnId } = dragging;
    let newPosition = 0;

    this.columns.update((cols) => {
      const cleared = cols.map((col) =>
        col.id === fromColumnId ? { ...col, cards: col.cards.filter((c) => c.id !== card.id) } : col
      );
      return cleared.map((col) => {
        if (col.id !== toColumnId) return col;
        if (!targetCardId) { newPosition = col.cards.length; return { ...col, cards: [...col.cards, card] }; }
        const targetIdx = col.cards.findIndex((c) => c.id === targetCardId);
        newPosition = targetIdx;
        const newCards = [...col.cards];
        newCards.splice(targetIdx, 0, card);
        return { ...col, cards: newCards };
      });
    });

    this.draggingCard.set(null);
    this.dragOverColumnId.set(null);
    this.dragOverCardId.set(null);

    this.supabase.moveCard(card.id, toColumnId, newPosition).catch((err) => console.error('moveCard', err));
  }

  // ── Misc helpers ──────────────────────────────────────────────────────────
  updateNewCard(partial: Partial<Card>) { this.newCard.update((c) => ({ ...c, ...partial })); }
  updateEditCard(partial: Partial<Card>) { this.editCard.update((c) => ({ ...c, ...partial })); }
  onNewSubtaskKeydown(e: KeyboardEvent) { if (e.key === 'Enter') { e.preventDefault(); this.addNewSubtask(); } }
  onEditSubtaskKeydown(e: KeyboardEvent) { if (e.key === 'Enter') { e.preventDefault(); this.addEditSubtask(); } }
  trackColumn(_: number, col: Column) { return col.id; }
  trackCard(_: number, card: Card) { return card.id; }
  trackSubtask(_: number, s: Subtask) { return s.id; }
}
