export type Role = "QA" | "CEO" | "Dev" | "Sales" | "STAFF";

export interface Session {
  name: string;
  email: string;
  role: Role;
}

const SESSION_KEY = "urbn_session";
const TOKEN_KEY = "urbn_access_token";
const REFRESH_KEY = "urbn_refresh_token";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveSession(user: { user_name?: string; name?: string; email: string; role: string }, access: string, refresh: string) {
  const session: Session = {
    name: user.user_name ?? user.name ?? "",
    email: user.email,
    role: user.role as Role,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

function clearAuth() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function extractDetail(detail: unknown, fallback: string): string {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg ?? JSON.stringify(e)).join(", ");
  return fallback;
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(extractDetail(data.detail, "Login failed."));
  saveSession(data.user, data.access_token, data.refresh_token);
  return getSession()!;
}

export async function signup(name: string, email: string, password: string): Promise<Session> {
  const res = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(extractDetail(data.detail, "Signup failed."));
  saveSession(data.user, data.access_token, data.refresh_token);
  return getSession()!;
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
    } catch {
      // network failure on logout is acceptable — clear locally anyway
    }
  }
  clearAuth();
}

export async function forgotPassword(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(extractDetail(data.detail, "Something went wrong."));
  return data.message as string;
}

export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const res = await fetch(`${API}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(extractDetail(data.detail, "Reset failed."));
  return data.message as string;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least one special character (e.g. @, #, !).";
  return null;
}
