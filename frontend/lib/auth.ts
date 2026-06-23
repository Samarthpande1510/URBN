export type Role = "QA" | "CEO" | "Dev" | "Purchase" | "STAFF";

export interface Session {
  name: string;
  email: string;
  role: Role;
}

const KEY = "urbn_pipeline_session";

export function getRoleFromEmail(email: string): Role {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (local.includes("qa") || domain.startsWith("qa")) return "QA";
  if (local.includes("ceo") || domain.startsWith("ceo")) return "CEO";
  if (local.includes("dev") || domain.startsWith("dev")) return "Dev";
  if (local.includes("purchase") || domain.startsWith("purchase")) return "Purchase";
  return "STAFF";
}

export function signupMock(name: string, email: string, _password: string): Session {
  const session: Session = { name, email, role: getRoleFromEmail(email) };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function loginMock(email: string): Session {
  const existing = getSession();
  const name = existing?.email === email ? existing.name : email.split("@")[0];
  const session: Session = { name, email, role: getRoleFromEmail(email) };
  localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function logout() {
  localStorage.removeItem(KEY);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/[0-9]/.test(password)) return "Password must include at least one number.";
  return null;
}
