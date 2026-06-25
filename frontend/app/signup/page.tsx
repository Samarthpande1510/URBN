"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { signup, validatePassword } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Please enter your full name."); return; }
    if (!email.trim()) { setError("Please enter your work email."); return; }
    if (!email.includes("@")) { setError("Enter a valid email address."); return; }

    const pwdError = validatePassword(password);
    if (pwdError) { setError(pwdError); return; }

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await signup(name.trim(), email.trim(), password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Live password strength feedback
  const checks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One letter", ok: /[A-Za-z]/.test(password) },
    { label: "One number", ok: /[0-9]/.test(password) },
    { label: "One special character", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const showChecks = password.length > 0;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Use your company email — your role is assigned automatically."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-white hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Field label="Full name" type="text" value={name} onChange={setName} placeholder="Jordan Patel" disabled={loading} />
        <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@urbn.com" disabled={loading} />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" disabled={loading} />

        {showChecks && (
          <div className="rounded-md border border-white/8 bg-[#1c1c1c] px-3.5 py-3 space-y-1.5">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-2">
                <span className={`text-xs font-bold ${c.ok ? "text-green-400" : "text-[#555]"}`}>
                  {c.ok ? "✓" : "·"}
                </span>
                <span className={`text-xs ${c.ok ? "text-[#aaa]" : "text-[#555]"}`}>{c.label}</span>
              </div>
            ))}
          </div>
        )}

        <Field label="Confirm password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" disabled={loading} />

        {confirmPassword.length > 0 && confirmPassword !== password && (
          <p className="text-xs text-red-400 -mt-3">Passwords don't match.</p>
        )}

        {error && (
          <p className="rounded-md border border-red-500/20 bg-[#1c1c1c] px-3.5 py-2.5 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-md bg-white py-2.5 text-sm font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
