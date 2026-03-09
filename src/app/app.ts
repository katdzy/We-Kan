import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, Router, RouterLinkActive, ActivatedRoute } from '@angular/router';
import { SupabaseService, ActivityLog, BoardMember } from './supabase.service';
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
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private supabase = inject(SupabaseService);
  authService = inject(AuthService);
  router = inject(Router);
  private route = inject(ActivatedRoute);

  // ── Board state ───────────────────────────────────────────────────────────
  activeBoard = signal<{ id: string; title: string; owner_id: string; color?: string; member_count?: number; progress?: number } | null>(null);
  accessibleBoards = signal<{ id: string; title: string; owner_id: string; color?: string; member_count?: number; progress?: number }[]>([]);
  columns = signal<Column[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  /** Controls whether /boards shows the grid list or the kanban view */
  viewMode = signal<'list' | 'board'>('list');

  isOwner = computed(() => {
    const user = this.authService.user();
    const board = this.activeBoard();
    return !!(user && board && user.id === board.owner_id);
  });

  // ── Activity & Collab state ───────────────────────────────────────────────
  activityLogs = signal<ActivityLog[]>([]);
  boardMembers = signal<BoardMember[]>([]);
  showActivityPanel = signal(false);
  showInviteModal = signal(false);
  inviteEmail = signal('');
  inviteError = signal<string | null>(null);
  inviteLoading = signal(false);
  
  // ── Create board modal ───────────────────────────────────────────────────────────
  showCreateBoardModal = signal(false);
  newBoardTitle = signal('');
  newBoardDescription = signal('');
  selectedBoardColor = signal('#BDF522');
  boardColorOptions = ['#BDF522', '#1E47F7', '#FA51A2', '#FE8616', '#9A65ED'];
  createBoardLoading = signal(false);
  createBoardError = signal<string | null>(null);

  // ── Edit board modal ─────────────────────────────────────────────────────────────
  showEditBoardModal = signal(false);
  editingBoardId = signal<string | null>(null);
  editBoardTitle = signal('');
  editBoardDescription = signal('');
  editBoardColor = signal('#BDF522');
  editBoardLoading = signal(false);
  editBoardError = signal<string | null>(null);

  // ── Delete board modal ───────────────────────────────────────────────────────────
  showDeleteBoardModal = signal(false);
  deletingBoardId = signal<string | null>(null);
  deleteBoardLoading = signal(false);
  deleteBoardError = signal<string | null>(null);

  // ── Board context menu ───────────────────────────────────────────────────────────
  openBoardMenuId = signal<string | null>(null);

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
    // When session changes (login / logout), fetch boards list; clear on logout
    effect(() => {
      const session = this.authService.session();
      if (session) {
        const boardId = this.route.snapshot.queryParams['boardId'] ?? undefined;
        if (boardId) {
          // Deep-linked to a specific board — go straight to kanban view
          this.viewMode.set('board');
          this.loadBoard(boardId);
        } else {
          // Load boards list for the selector, but stay in list view
          this.loadAccessibleBoards();
        }
      } else {
        this.viewMode.set('list');
        this.activeBoard.set(null);
        this.accessibleBoards.set([]);
        this.columns.set([]);
        this.activityLogs.set([]);
        this.boardMembers.set([]);
        this.loading.set(false);
      }
    });
  }

  async ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const boardId = params['boardId'];
      if (boardId && this.authService.session()) {
        this.viewMode.set('board');
        this.loadBoard(boardId);
      }
    });
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
        // If session was set automatically, the effect will call loadBoard()
        // which handles creating the board and default columns if needed.
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
  /** Fetches all accessible boards and stores them — does NOT load a kanban. */
  async loadAccessibleBoards() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = this.authService.user();
      if (!user) throw new Error('Not logged in');
      const boards = await this.supabase.getAccessibleBoardsWithProgress(user.id);
      this.accessibleBoards.set(boards);
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load boards');
    } finally {
      this.loading.set(false);
    }
  }

  /** Opens a specific board in kanban view. */
  async loadBoard(targetBoardId?: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const user = this.authService.user();
      if (!user) throw new Error('Not logged in');

      // 1. Resolve accessible boards (also syncs board title)
      const boards = await this.supabase.getAccessibleBoardsWithProgress(user.id);
      this.accessibleBoards.set(boards);

      let board = targetBoardId ? boards.find((b: any) => b.id === targetBoardId) : boards[0];
      if (!board) board = boards[0];

      this.activeBoard.set(board);

      // 2. Load columns, cards, subtasks
      const cols = await this.supabase.loadBoard(board.id);
      if (cols.length === 0 && board.owner_id === user.id) {
        const seeded = await this.supabase.seedDefaultColumns(board.id);
        this.columns.set(seeded);
      } else {
        this.columns.set(cols);
      }

      // 3. Load side-panel data
      this.loadActivityLogs();
      if (this.isOwner()) {
        this.loadBoardMembers();
      }

    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load board');
    } finally {
      this.loading.set(false);
    }
  }

  /** Called when the user clicks a board card in list view. */
  selectBoard(boardId: string) {
    this.viewMode.set('board');
    this.loadBoard(boardId);
  }

  /** Returns to the boards list view. */
  goBackToList() {
    this.viewMode.set('list');
    this.activeBoard.set(null);
    this.columns.set([]);
    this.router.navigate(['/boards'], { replaceUrl: true });
  }

   openCreateBoardModal() {
    this.newBoardTitle.set('');
    this.newBoardDescription.set('');
    this.selectedBoardColor.set('#BDF522');
    this.createBoardError.set(null);
    this.showCreateBoardModal.set(true);
  }

  closeCreateBoardModal() {
    this.showCreateBoardModal.set(false);
  }

  async submitCreateBoard() {
    const title = this.newBoardTitle().trim();
    if (!title) return;
    const user = this.authService.user();
    if (!user) return;

    this.createBoardLoading.set(true);
    this.createBoardError.set(null);
    try {
      const title = this.newBoardTitle().trim();
      const description = this.newBoardDescription().trim();
      const color = this.selectedBoardColor();
      const newBoard = await this.supabase.createBoard(user.id, title, description, color);
      this.accessibleBoards.update(boards => [...boards, newBoard]);
      this.closeCreateBoardModal();
      // Immediately open the new board
      this.selectBoard(newBoard.id);
    } catch (err: any) {
      this.createBoardError.set(err?.message ?? 'Failed to create board');
    } finally {
      this.createBoardLoading.set(false);
    }
  }

  isOwnerOfBoard(board: { owner_id: string }) {
    return this.authService.user()?.id === board.owner_id;
  }

  // ── Board Edit Menu ───────────────────────────────────────────────────────
  toggleBoardMenu(event: Event, boardId: string) {
    event.stopPropagation();
    if (this.openBoardMenuId() === boardId) {
      this.openBoardMenuId.set(null);
    } else {
      this.openBoardMenuId.set(boardId);
    }
  }

  closeBoardMenu() {
    this.openBoardMenuId.set(null);
  }

  openEditBoardModal(event: Event | null, board: any) {
    if (event) event.stopPropagation();
    this.closeBoardMenu();
    this.editingBoardId.set(board.id);
    this.editBoardTitle.set(board.title);
    this.editBoardDescription.set(board.description || '');
    this.editBoardColor.set(board.color || '#BDF522');
    this.editBoardError.set(null);
    this.showEditBoardModal.set(true);
  }

  closeEditBoardModal() {
    this.showEditBoardModal.set(false);
    this.editingBoardId.set(null);
  }

  async submitEditBoard() {
    const title = this.editBoardTitle().trim();
    const boardId = this.editingBoardId();
    if (!title || !boardId) return;

    this.editBoardLoading.set(true);
    this.editBoardError.set(null);
    try {
      const description = this.editBoardDescription().trim();
      const color = this.editBoardColor();
      await this.supabase.updateBoard(boardId, title, description, color);
      
      // Update local lists
      this.accessibleBoards.update(boards => 
        boards.map(b => b.id === boardId ? { ...b, title, description, color } : b)
      );
      
      // If editing the active board, update that too
      const active = this.activeBoard();
      if (active && active.id === boardId) {
        this.activeBoard.set({ ...active, title, color });
      }

      this.closeEditBoardModal();
    } catch (err: any) {
      this.editBoardError.set(err?.message ?? 'Failed to update board');
    } finally {
      this.editBoardLoading.set(false);
    }
  }

  openDeleteBoardModal(event: Event | null, boardId: string) {
    if (event) event.stopPropagation();
    this.closeBoardMenu();
    this.deletingBoardId.set(boardId);
    this.deleteBoardError.set(null);
    this.showDeleteBoardModal.set(true);
  }

  closeDeleteBoardModal() {
    this.showDeleteBoardModal.set(false);
    this.deletingBoardId.set(null);
  }

  async submitDeleteBoard() {
    const boardId = this.deletingBoardId();
    if (!boardId) return;

    this.deleteBoardLoading.set(true);
    this.deleteBoardError.set(null);
    try {
      await this.supabase.deleteBoard(boardId);
      
      // Remove from list
      this.accessibleBoards.update(boards => boards.filter(b => b.id !== boardId));
      
      this.closeDeleteBoardModal();
      
      // If we just deleted the active board, we must go back to list
      if (this.activeBoard()?.id === boardId) {
        this.goBackToList();
      }
    } catch (err: any) {
      this.deleteBoardError.set(err?.message ?? 'Failed to delete board');
    } finally {
      this.deleteBoardLoading.set(false);
    }
  }

  // ── Activity and Collaboration ────────────────────────────────────────────
  switchBoard(event: Event) {
    const target = event.target as HTMLSelectElement;
    const boardId = target.value;
    if (!boardId || boardId === this.activeBoard()?.id) return;
    this.loadBoard(boardId);
  }

  async loadActivityLogs() {
    const b = this.activeBoard();
    if (!b) return;
    try {
      this.activityLogs.set(await this.supabase.getActivityLogs(b.id));
    } catch (err) { console.error('loadActivityLogs', err); }
  }

  async loadBoardMembers() {
    const b = this.activeBoard();
    if (!b) return;
    try {
      this.boardMembers.set(await this.supabase.getBoardMembers(b.id));
    } catch (err) { console.error('loadBoardMembers', err); }
  }

  toggleActivityPanel() {
    this.showActivityPanel.set(!this.showActivityPanel());
    if (this.showActivityPanel()) {
      this.loadActivityLogs();
    }
  }

  openInviteModal() {
    this.inviteEmail.set('');
    this.inviteError.set(null);
    this.showInviteModal.set(true);
    this.loadBoardMembers(); // refresh list
  }

  closeInviteModal() {
    this.showInviteModal.set(false);
  }

  async submitInvite() {
    const email = this.inviteEmail().trim();
    if (!email) return;
    const b = this.activeBoard();
    if (!b) return;

    this.inviteLoading.set(true);
    this.inviteError.set(null);
    try {
      await this.supabase.inviteMember(b.id, email);
      this.inviteEmail.set('');
      await this.loadBoardMembers();
    } catch (err: any) {
      this.inviteError.set(err?.message ?? 'Failed to invite user');
    } finally {
      this.inviteLoading.set(false);
    }
  }

  async removeMember(userId: string) {
    const b = this.activeBoard();
    if (!b) return;
    try {
      await this.supabase.removeMember(b.id, userId);
      await this.loadBoardMembers();
    } catch (err) {
      console.error('removeMember', err);
    }
  }

  private async logAction(cardId: string | null, action: string, details: string) {
    const b = this.activeBoard();
    const u = this.authService.user();
    if (b && u) {
      await this.supabase.logActivity(b.id, cardId, action, details, u.email ?? 'Unknown');
      // If panel is open, refresh it now
      if (this.showActivityPanel()) {
        this.loadActivityLogs();
      }
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

    this.supabase.addCard(columnId, newCardObj, position)
      .then(() => {
        const colTitle = this.columns().find((c) => c.id === columnId)?.title ?? '';
        this.logAction(newCardObj.id, 'created', `Created card "${newCardObj.title}" in ${colTitle}`);
      })
      .catch((err) => {
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
      this.logAction(updatedCard.id, 'edited', `Edited card "${updatedCard.title}"`);
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
    this.supabase.deleteCard(cardId)
      .then(() => {
        this.logAction(cardId, 'deleted', `Deleted card "${removedCard?.title}"`);
      })
      .catch((err) => {
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

    this.supabase.moveCard(card.id, toColumnId, newPosition)
      .then(() => {
        if (fromColumnId !== toColumnId) {
          const fromTitle = this.columns().find((c) => c.id === fromColumnId)?.title;
          const toTitle = this.columns().find((c) => c.id === toColumnId)?.title;
          this.logAction(card.id, 'moved', `Moved card "${card.title}" from ${fromTitle} to ${toTitle}`);
        }
      })
      .catch((err) => console.error('moveCard', err));
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
