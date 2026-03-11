import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-profile',
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
  avatarLoading = signal(false);

  usernameMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);
  emailMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);
  passwordMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);
  avatarMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

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

  triggerAvatarUpload() {
    const input = document.getElementById('avatar-file-input') as HTMLInputElement;
    input?.click();
  }

  async onAvatarFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      this.avatarMessage.set({ type: 'error', text: 'Please select a JPG, PNG, WebP or GIF image.' });
      return;
    }

    this.avatarLoading.set(true);
    this.avatarMessage.set(null);
    try {
      await this.authService.updateAvatar(file);
      this.avatarMessage.set({ type: 'success', text: 'Profile picture updated!' });
      this.autoDismiss(v => this.avatarMessage.set(v));
    } catch (err: any) {
      this.avatarMessage.set({ type: 'error', text: err?.message || 'Failed to upload avatar.' });
    } finally {
      this.avatarLoading.set(false);
      input.value = '';
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