"use client";

import Link from "next/link";
import { useState, FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Please enter your email."); return; }

    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-white hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      {sent ? (
        <p className="rounded-md border border-green-500/20 bg-green-500/8 px-3.5 py-2.5 text-sm text-green-400">
          If an account exists for that email, a reset link is on its way kindly check your inbox.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Field
            label="Work email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@dev.com"
            disabled={loading}
          />

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
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
