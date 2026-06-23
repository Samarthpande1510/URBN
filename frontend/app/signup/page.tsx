"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { signupMock, validatePassword } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Fill in every field to continue.");
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    signupMock(name, email, password);
    router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Kindly enter your company email"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-[#5b9eff] hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Full name" type="text" value={name} onChange={setName} placeholder="Jordan Patel" />
        <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@urbn.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

        <p className="rounded-lg border border-[#1a3a6e]/40 bg-[#060f26] px-4 py-2.5 text-xs text-[#5a8fc4]">
          Password must be at least 8 characters with a letter and a number.
        </p>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          className="mt-2 w-full rounded-xl py-3.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #5b9eff, #1d3a8a)" }}
        >
          Create account
        </button>
      </form>
    </AuthShell>
  );
}
