import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient;

  session = signal<Session | null>(null);
  user = computed<User | null>(() => this.session()?.user ?? null);
  username = computed<string | null>(() => this.user()?.user_metadata?.['display_name'] ?? null);

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

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
}
