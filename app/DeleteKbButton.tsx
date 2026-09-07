"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteKbButton({ kbId, kbName }: { kbId: string; kbName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${kbName}"? This removes all its files, questions, and generated tests. This can't be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/kb/${kbId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to delete. Try again.");
        setBusy(false);
      }
    } catch {
      alert("Failed to delete. Try again.");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className="text-xs opacity-40 hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 px-2 py-1 disabled:opacity-20"
      aria-label={`Delete ${kbName}`}
      title="Delete this knowledge base"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}
