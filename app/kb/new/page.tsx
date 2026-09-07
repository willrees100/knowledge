"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewKBPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Class name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, focus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create knowledge base.");
      router.push(`/kb/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">New knowledge base</h1>
      <p className="opacity-70 mb-6 text-sm">
        This short setup form is folded into the assistant&apos;s system prompt — it steers tone and scope, it&apos;s
        not just decorative.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Class name *</label>
          <input
            className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ECON 301"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">What does this class cover, at a high level?</label>
          <textarea
            className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Intermediate microeconomics: consumer theory, firm theory, market structures."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Anything you especially want the assistant to focus on?
          </label>
          <textarea
            className="w-full border border-black/15 dark:border-white/20 rounded-lg px-3 py-2 bg-transparent"
            rows={3}
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Emphasize problem-solving steps over definitions; this class is exam-heavy."
          />
        </div>

        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create knowledge base"}
        </button>
      </form>
    </div>
  );
}
