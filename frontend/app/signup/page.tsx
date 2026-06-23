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
          <Link href="/login" className="font-medium text-white hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Full name" type="text" value={name} onChange={setName} placeholder="Jordan Patel" />
        <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@urbn.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

        <p className="rounded-md border border-white/8 bg-[#1c1c1c] px-3.5 py-2.5 text-xs text-[#555555]">
          Password must be at least 8 characters with a letter and a number.
        </p>

        {error && (
          <p className="rounded-md border border-red-500/20 bg-[#1c1c1c] px-3.5 py-2.5 text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          className="mt-2 w-full rounded-md bg-white py-2.5 text-sm font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.99]"
        >
          Create account
        </button>
      </form>
    </AuthShell>
  );
}
