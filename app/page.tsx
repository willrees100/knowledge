import Link from "next/link";
import { listKBs, listFiles } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const kbs = listKBs();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Knowledge Bases</h1>
      <p className="opacity-70 mb-6">
        One knowledge base per class. Upload your materials, then ask questions or generate a practice test —
        grounded strictly in what you uploaded.
      </p>

      <Link
        href="/kb/new"
        className="inline-block mb-8 px-4 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black font-medium hover:opacity-90"
      >
        + New knowledge base
      </Link>

      {kbs.length === 0 ? (
        <p className="opacity-60 text-sm">No knowledge bases yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-3">
          {kbs.map((kb) => {
            const fileCount = listFiles(kb.id).length;
            return (
              <li key={kb.id}>
                <Link
                  href={`/kb/${kb.id}`}
                  className="block border border-black/10 dark:border-white/15 rounded-lg px-4 py-3 hover:border-black/30 dark:hover:border-white/40 transition-colors"
                >
                  <div className="font-semibold">{kb.name}</div>
                  {kb.description && <div className="text-sm opacity-70 mt-0.5">{kb.description}</div>}
                  <div className="text-xs opacity-50 mt-1">
                    {fileCount} file{fileCount === 1 ? "" : "s"} · created{" "}
                    {new Date(kb.created_at).toLocaleDateString()}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
