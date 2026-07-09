"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { resetPassword, validatePassword } from "@/lib/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const checks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "One letter", ok: /[A-Za-z]/.test(password) },
    { label: "One number", ok: /[0-9]/.test(password) },
    { label: "One special character", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const showChecks = password.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) { setError("This reset link is missing its token — request a new one."); return; }
    const pwdError = validatePassword(password);
    if (pwdError) { setError(pwdError); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="Reset password"
        subtitle="This link is invalid or missing its token."
        footer={
          <Link href="/forgot-password" className="font-medium text-white hover:underline">
            Request a new reset link
          </Link>
        }
      >
        <p className="rounded-md border border-red-500/20 bg-red-500/8 px-3.5 py-2.5 text-sm text-red-400">
          No reset token found in this URL. Please use the link from your email, or request a new one.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="Choose a new password for your account."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-white hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      {done ? (
        <p className="rounded-md border border-green-500/20 bg-green-500/8 px-3.5 py-2.5 text-sm text-green-400">
          Password reset — taking you to log in…
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Field
            label="New password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            disabled={loading}
          />

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

          <Field
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="••••••••"
            disabled={loading}
          />

          {confirmPassword.length > 0 && confirmPassword !== password && (
            <p className="text-xs text-red-400 -mt-3">Passwords don&apos;t match.</p>
          )}

          {error && (
            <p className="rounded-md border border-red-500/20 bg-red-500/8 px-3.5 py-2.5 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-md bg-white py-2.5 text-sm font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
