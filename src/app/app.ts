import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

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
export class App {
  columns = signal<Column[]>([
    {
      id: 'backlog',
      title: 'Backlog',
      color: '#6b7280',
      cards: [
        {
          id: 'c1',
          title: 'Research competitors',
          description: 'Analyze top 5 competitors in the market.',
          priority: 'low',
          tag: 'Research',
          subtasks: [
            { id: 's1', title: 'Identify top 5 competitors', done: true },
            { id: 's2', title: 'Analyze pricing models', done: false },
            { id: 's3', title: 'Document findings', done: false },
          ],
        },
        {
          id: 'c2',
          title: 'Write API docs',
          description: 'Document all REST endpoints with examples.',
          priority: 'medium',
          tag: 'Docs',
          subtasks: [],
        },
      ],
    },
    {
      id: 'todo',
      title: 'To Do',
      color: '#3b82f6',
      cards: [
        {
          id: 'c3',
          title: 'Design login screen',
          description: 'Create wireframes and high-fidelity mockups.',
          priority: 'high',
          tag: 'Design',
          subtasks: [
            { id: 's4', title: 'Sketch wireframes', done: true },
            { id: 's5', title: 'Create hi-fi mockup in Figma', done: true },
            { id: 's6', title: 'Get design review', done: false },
            { id: 's7', title: 'Handoff to dev', done: false },
          ],
        },
        {
          id: 'c4',
          title: 'Set up CI/CD pipeline',
          description: 'Configure GitHub Actions for automated deploys.',
          priority: 'medium',
          tag: 'DevOps',
          subtasks: [
            { id: 's8', title: 'Create workflow YAML', done: false },
            { id: 's9', title: 'Add build & test steps', done: false },
          ],
        },
        {
          id: 'c5',
          title: 'Write unit tests',
          description: 'Achieve 80% code coverage for core modules.',
          priority: 'medium',
          tag: 'Testing',
          subtasks: [],
        },
      ],
    },
    {
      id: 'in-progress',
      title: 'In Progress',
      color: '#f59e0b',
      cards: [
        {
          id: 'c6',
          title: 'Build kanban board',
          description: 'Implement drag-and-drop with Angular signals.',
          priority: 'high',
          tag: 'Feature',
          subtasks: [
            { id: 's10', title: 'Column layout', done: true },
            { id: 's11', title: 'Drag & drop', done: true },
            { id: 's12', title: 'Add card modal', done: true },
            { id: 's13', title: 'Subtasks & progress', done: false },
          ],
        },
        {
          id: 'c7',
          title: 'Refactor auth service',
          description: 'Migrate to JWT-based authentication flow.',
          priority: 'high',
          tag: 'Backend',
          subtasks: [
            { id: 's14', title: 'Audit current auth code', done: true },
            { id: 's15', title: 'Implement JWT middleware', done: false },
            { id: 's16', title: 'Update tests', done: false },
          ],
        },
      ],
    },
    {
      id: 'done',
      title: 'Done',
      color: '#10b981',
      cards: [
        {
          id: 'c8',
          title: 'Project kickoff',
          description: 'Initial team meeting and goal setting.',
          priority: 'low',
          tag: 'Management',
          subtasks: [
            { id: 's17', title: 'Schedule kickoff meeting', done: true },
            { id: 's18', title: 'Define project goals', done: true },
          ],
        },
        {
          id: 'c9',
          title: 'Set up repo',
          description: 'Initialize monorepo with Angular and Node.',
          priority: 'low',
          tag: 'Setup',
          subtasks: [
            { id: 's19', title: 'Create GitHub repo', done: true },
            { id: 's20', title: 'Configure workspace', done: true },
            { id: 's21', title: 'Add README', done: true },
          ],
        },
      ],
    },
  ]);

  draggingCard = signal<{ card: Card; fromColumnId: string } | null>(null);
  dragOverColumnId = signal<string | null>(null);
  dragOverCardId = signal<string | null>(null);

  // Add card modal state
  showAddModal = signal(false);
  addingToColumnId = signal<string | null>(null);
  newCard = signal<Partial<Card> & { subtasks: Subtask[] }>({
    title: '', description: '', priority: 'medium', tag: '', subtasks: [],
  });
  newSubtaskText = signal('');

  // Edit card modal state
  showEditModal = signal(false);
  editingCard = signal<{ card: Card; columnId: string } | null>(null);
  editCard = signal<Partial<Card> & { subtasks: Subtask[] }>({ subtasks: [] });
  editSubtaskText = signal('');

  totalCards = computed(() => this.columns().reduce((sum, col) => sum + col.cards.length, 0));

  progress(card: Card): number {
    if (!card.subtasks.length) return 0;
    return Math.round((card.subtasks.filter((s) => s.done).length / card.subtasks.length) * 100);
  }

  doneCount(card: Card): number {
    return card.subtasks.filter((s) => s.done).length;
  }

  // ── Subtask toggling on card ──────────────────
  toggleSubtask(cardId: string, columnId: string, subtaskId: string) {
    this.columns.update((cols) =>
      cols.map((col) =>
        col.id !== columnId
          ? col
          : {
            ...col,
            cards: col.cards.map((c) =>
              c.id !== cardId
                ? c
                : {
                  ...c,
                  subtasks: c.subtasks.map((s) =>
                    s.id === subtaskId ? { ...s, done: !s.done } : s
                  ),
                }
            ),
          }
      )
    );
  }

  // ── Add card modal ────────────────────────────
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

  submitAddCard() {
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

    this.columns.update((cols) =>
      cols.map((col) =>
        col.id === columnId ? { ...col, cards: [...col.cards, newCardObj] } : col
      )
    );
    this.closeAddModal();
  }

  // ── Edit card modal ───────────────────────────
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

  submitEditCard() {
    const editing = this.editingCard();
    const updated = this.editCard();
    if (!editing || !updated.title?.trim()) return;

    this.columns.update((cols) =>
      cols.map((col) =>
        col.id === editing.columnId
          ? {
            ...col,
            cards: col.cards.map((c) =>
              c.id === editing.card.id
                ? {
                  ...c,
                  title: updated.title!.trim(),
                  description: updated.description?.trim() ?? '',
                  priority: updated.priority as 'low' | 'medium' | 'high',
                  tag: updated.tag?.trim() ?? '',
                  subtasks: updated.subtasks ?? [],
                }
                : c
            ),
          }
          : col
      )
    );
    this.closeEditModal();
  }

  deleteCard(cardId: string, columnId: string) {
    this.columns.update((cols) =>
      cols.map((col) =>
        col.id === columnId ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) } : col
      )
    );
  }

  // ── Drag and drop ─────────────────────────────
  onDragStart(event: DragEvent, card: Card, fromColumnId: string) {
    this.draggingCard.set({ card, fromColumnId });
    event.dataTransfer!.effectAllowed = 'move';
    const el = event.target as HTMLElement;
    el.classList.add('dragging');
  }

  onDragEnd(event: DragEvent) {
    const el = event.target as HTMLElement;
    el.classList.remove('dragging');
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
    this.columns.update((cols) => {
      const newCols = cols.map((col) =>
        col.id === fromColumnId ? { ...col, cards: col.cards.filter((c) => c.id !== card.id) } : col
      );
      return newCols.map((col) => {
        if (col.id !== toColumnId) return col;
        if (!targetCardId) return { ...col, cards: [...col.cards, card] };
        const targetIdx = col.cards.findIndex((c) => c.id === targetCardId);
        const newCards = [...col.cards];
        newCards.splice(targetIdx, 0, card);
        return { ...col, cards: newCards };
      });
    });

    this.draggingCard.set(null);
    this.dragOverColumnId.set(null);
    this.dragOverCardId.set(null);
  }

  updateNewCard(partial: Partial<Card>) {
    this.newCard.update((c) => ({ ...c, ...partial }));
  }

  updateEditCard(partial: Partial<Card>) {
    this.editCard.update((c) => ({ ...c, ...partial }));
  }

  onNewSubtaskKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') { event.preventDefault(); this.addNewSubtask(); }
  }

  onEditSubtaskKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') { event.preventDefault(); this.addEditSubtask(); }
  }

  trackColumn(_: number, col: Column) { return col.id; }
  trackCard(_: number, card: Card) { return card.id; }
  trackSubtask(_: number, s: Subtask) { return s.id; }
}
