import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-profile',
  imports: [RouterLink, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile {
  authService = inject(AuthService);
  private router = inject(Router);

  newUsername = signal('');
  newEmail = signal('');
  newPassword = signal('');

  usernameLoading = signal(false);
  emailLoading = signal(false);
  passwordLoading = signal(false);

  usernameMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);
  emailMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);
  passwordMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  /** First letter of the user's email for the avatar */
  userInitial = computed(() => {
    const email = this.authService.user()?.email ?? '';
    return email.charAt(0).toUpperCase();
  });

  /** Formatted member-since date */
  memberSince = computed(() => {
    const createdAt = this.authService.user()?.created_at;
    if (!createdAt) return null;
    return new Date(createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  });

  /** Basic email format validation */
  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  private autoDismiss(
    messageFn: (v: { type: 'success' | 'error', text: string } | null) => void,
    delay = 4000
  ) {
    setTimeout(() => messageFn(null), delay);
  }

  async updateUsername() {
    const username = this.newUsername().trim();
    if (!username) return;

    this.usernameLoading.set(true);
    this.usernameMessage.set(null);

    try {
      await this.authService.updateUsername(username);
      this.usernameMessage.set({ type: 'success', text: 'Username updated successfully.' });
      this.autoDismiss(v => this.usernameMessage.set(v));
      this.newUsername.set('');
    } catch (err: any) {
      this.usernameMessage.set({ type: 'error', text: err?.message || 'Failed to update username.' });
    } finally {
      this.usernameLoading.set(false);
    }
  }

  async updateEmail() {
    const email = this.newEmail().trim();
    if (!email) return;

    if (!this.isValidEmail(email)) {
      this.emailMessage.set({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    this.emailLoading.set(true);
    this.emailMessage.set(null);

    try {
      await this.authService.updateEmail(email);
      this.emailMessage.set({ type: 'success', text: 'Confirmation sent — check your new inbox.' });
      this.autoDismiss(v => this.emailMessage.set(v), 6000);
      this.newEmail.set('');
    } catch (err: any) {
      this.emailMessage.set({ type: 'error', text: err?.message || 'Failed to update email.' });
    } finally {
      this.emailLoading.set(false);
    }
  }

  async updatePassword() {
    const password = this.newPassword();
    if (password.length < 6) return;

    this.passwordLoading.set(true);
    this.passwordMessage.set(null);

    try {
      await this.authService.updatePassword(password);
      this.passwordMessage.set({ type: 'success', text: 'Password updated successfully.' });
      this.autoDismiss(v => this.passwordMessage.set(v));
      this.newPassword.set('');
    } catch (err: any) {
      this.passwordMessage.set({ type: 'error', text: err?.message || 'Failed to update password.' });
    } finally {
      this.passwordLoading.set(false);
    }
  }

  async signOut() {
    try {
      await this.authService.signOut();
      this.router.navigate(['/']);
    } catch (err: any) {
      console.error('Sign out failed:', err);
    }
  }
}
