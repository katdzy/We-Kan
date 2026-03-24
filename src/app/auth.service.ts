import { Injectable, signal, computed } from '@angular/core';
import { SupabaseClient, Session, User } from '@supabase/supabase-js';
import { ThemeKey } from './app';
import { supabaseClient } from './supabase-client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient;

  session = signal<Session | null>(null);
  user = computed<User | null>(() => this.session()?.user ?? null);
  username = computed<string | null>(() => this.user()?.user_metadata?.['display_name'] ?? null);

  /** Public URL of the user's avatar from Supabase Storage, or null. */
  avatarUrl = computed<string | null>(() => this.user()?.user_metadata?.['avatar_url'] ?? null);

  /** The user's saved theme preference, or 'default'. */
  savedTheme = computed<ThemeKey>(() =>
    (this.user()?.user_metadata?.['theme'] as ThemeKey) ?? 'default'
  );

  constructor() {
    this.supabase = supabaseClient;

    // Seed from stored session immediately
    this.supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
    });

    // Keep in sync with auth state changes
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  async signUp(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async updateEmail(email: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ email });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  async updateUsername(username: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({
      data: { display_name: username }
    });
    if (error) throw error;
  }

  /** Saves the selected theme to Supabase user_metadata so it syncs across devices. */
  async updateTheme(theme: ThemeKey): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({
      data: { theme }
    });
    if (error) throw error;
  }

  /**
   * Uploads the avatar image to Supabase Storage (avatars/{user_id}_{timestamp}),
   * deletes the old avatar first to avoid Storage lock conflicts,
   * then saves the public URL to user_metadata.avatar_url.
   */
  async updateAvatar(file: File): Promise<string> {
    const user = this.user();
    if (!user) throw new Error('Not authenticated');

    // Remove any existing avatar to prevent "Lock broken" errors from upsert
    const oldUrl = this.avatarUrl();
    if (oldUrl) {
      // Extract the stored path from the old URL (everything after /avatars/)
      const match = oldUrl.match(/\/avatars\/([^?]+)/);
      if (match?.[1]) {
        await this.supabase.storage.from('avatars').remove([match[1]]);
      }
    }

    // Use a unique path per upload to avoid any lingering lock issues
    const ext = file.name.split('.').pop() ?? 'jpg';
    const filePath = `${user.id}_${Date.now()}.${ext}`;

    const { error: uploadErr } = await this.supabase.storage
      .from('avatars')
      .upload(filePath, file, { contentType: file.type });

    if (uploadErr) throw new Error(uploadErr.message);

    const { data: urlData } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: metaErr } = await this.supabase.auth.updateUser({
      data: { avatar_url: publicUrl }
    });
    if (metaErr) throw new Error(metaErr.message);

    return publicUrl;
  }

  /** Removes the avatar from Storage and clears user_metadata.avatar_url. */
  async removeAvatar(): Promise<void> {
    const user = this.user();
    if (!user) throw new Error('Not authenticated');

    // Extract actual stored path from the URL to remove the correct file
    const oldUrl = this.avatarUrl();
    if (oldUrl) {
      const match = oldUrl.match(/\/avatars\/([^?]+)/);
      if (match?.[1]) {
        await this.supabase.storage.from('avatars').remove([match[1]]);
      }
    }

    const { error } = await this.supabase.auth.updateUser({
      data: { avatar_url: null }
    });
    if (error) throw new Error(error.message);
  }
}