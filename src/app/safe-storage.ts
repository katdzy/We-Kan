export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return sessionStorage.getItem(key);
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      try {
        sessionStorage.setItem(key, value);
      } catch { /* ignore if both fail */ }
    }
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch { /* noop */ }
    try { sessionStorage.removeItem(key); } catch { /* noop */ }
  },
};
