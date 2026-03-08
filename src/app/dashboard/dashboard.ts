import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth.service';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  authService = inject(AuthService);
  supabase = inject(SupabaseService);

  get userName() {
    return this.authService.username() || this.authService.user()?.email || 'User';
  }
}
