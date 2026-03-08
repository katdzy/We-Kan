import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  newUsername = signal('');
  newEmail = signal('');
  newPassword = signal('');
  
  usernameLoading = signal(false);
  emailLoading = signal(false);
  passwordLoading = signal(false);
  
  usernameMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);
  emailMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);
  passwordMessage = signal<{ type: 'success' | 'error', text: string } | null>(null);

  async updateUsername() {
    const username = this.newUsername().trim();
    if (!username) return;

    this.usernameLoading.set(true);
    this.usernameMessage.set(null);

    try {
      await this.authService.updateUsername(username);
      this.usernameMessage.set({ type: 'success', text: 'Username updated successfully.' });
      this.newUsername.set('');
    } catch (err: any) {
      this.usernameMessage.set({ type: 'error', text: err?.message || 'Failed to update username' });
    } finally {
      this.usernameLoading.set(false);
    }
  }

  async updateEmail() {
    const email = this.newEmail().trim();
    if (!email) return;

    this.emailLoading.set(true);
    this.emailMessage.set(null);

    try {
      await this.authService.updateEmail(email);
      this.emailMessage.set({ type: 'success', text: 'Email updated successfully. Check your new email to confirm.' });
      this.newEmail.set('');
    } catch (err: any) {
      this.emailMessage.set({ type: 'error', text: err?.message || 'Failed to update email' });
    } finally {
      this.emailLoading.set(false);
    }
  }

  async updatePassword() {
    const password = this.newPassword();
    if (!password) return;

    this.passwordLoading.set(true);
    this.passwordMessage.set(null);

    try {
      await this.authService.updatePassword(password);
      this.passwordMessage.set({ type: 'success', text: 'Password updated successfully.' });
      this.newPassword.set('');
    } catch (err: any) {
      this.passwordMessage.set({ type: 'error', text: err?.message || 'Failed to update password' });
    } finally {
      this.passwordLoading.set(false);
    }
  }
}
