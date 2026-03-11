import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { SupabaseService } from '../supabase.service';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  authService = inject(AuthService);
  supabase = inject(SupabaseService);
  router = inject(Router);

  recentBoards = signal<any[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  get userName() {
    return this.authService.username() || 'User';
  }

  async ngOnInit() {
    this.loading.set(true);
    try {
      const user = this.authService.user();
      if (user) {
        const boards = await this.supabase.getRecentBoardsWithProgress(user.id);
        this.recentBoards.set(boards);
      }
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to fetch recent boards.');
    } finally {
      this.loading.set(false);
    }
  }

  navigateToBoard(boardId: string) {
    this.router.navigate(['/boards'], { queryParams: { boardId } });
  }
}
 
