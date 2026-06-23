"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { loginMock } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    loginMock(email);
    router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back. Lets get started."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-white hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Work email" type="email" value={email} onChange={setEmail} placeholder="you@urbn.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
        {error && (
          <p className="rounded-md border border-red-500/20 bg-red-500/8 px-3.5 py-2.5 text-sm text-red-400">{error}</p>
        )}
        <button
          type="submit"
          className="mt-2 w-full rounded-md bg-white py-2.5 text-sm font-medium text-black transition hover:bg-[#e5e5e5] active:scale-[0.99]"
        >
          Log in
        </button>
      </form>
    </AuthShell>
  );
}
