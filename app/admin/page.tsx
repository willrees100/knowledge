import { getStats } from "@/lib/db";

export const dynamic = "force-dynamic";

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default async function AdminPage() {
  const { totals, testTotals, perKB, recentFeedback } = await getStats();
  const rated = totals.thumbs_up + totals.thumbs_down;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Stats</h1>
      <p className="opacity-70 text-sm mb-8">
        Every Q&amp;A answer and every practice-test generation is logged. This is the real, persisted denominator
        for the hypothesis&apos;s decision rule — see HYPOTHESIS.md.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <Stat label="Questions asked" value={totals.total_questions} />
        <Stat label="Answered from source" value={`${totals.source_answers} (${pct(totals.source_answers, totals.total_questions)})`} />
        <Stat label="Fallback (no match)" value={`${totals.fallback_answers} (${pct(totals.fallback_answers, totals.total_questions)})`} />
        <Stat label="Tests generated" value={testTotals.total_tests} />
        <Stat label="Rated 👍" value={totals.thumbs_up} />
        <Stat label="Rated 👎" value={totals.thumbs_down} />
        <Stat label="Rated positively" value={pct(totals.thumbs_up, rated)} />
        <Stat label="Total questions generated" value={testTotals.total_questions_generated} />
      </div>

      <h2 className="text-lg font-semibold mb-3">By knowledge base</h2>
      <div className="overflow-x-auto mb-10">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/15">
              <th className="py-2 pr-4">Knowledge base</th>
              <th className="py-2 pr-4">Questions asked</th>
              <th className="py-2 pr-4">👍</th>
              <th className="py-2 pr-4">👎</th>
            </tr>
          </thead>
          <tbody>
            {perKB.map((kb) => (
              <tr key={kb.id} className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pr-4">{kb.name}</td>
                <td className="py-2 pr-4">{kb.questions_asked}</td>
                <td className="py-2 pr-4">{kb.thumbs_up}</td>
                <td className="py-2 pr-4">{kb.thumbs_down}</td>
              </tr>
            ))}
            {perKB.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 opacity-50">
                  No knowledge bases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-lg font-semibold mb-3">Recent Q&amp;A log</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/15">
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">KB</th>
              <th className="py-2 pr-4">Question</th>
              <th className="py-2 pr-4">Source?</th>
              <th className="py-2 pr-4">Rating</th>
            </tr>
          </thead>
          <tbody>
            {recentFeedback.map((f, i) => (
              <tr key={i} className="border-b border-black/5 dark:border-white/5 align-top">
                <td className="py-2 pr-4 whitespace-nowrap text-xs opacity-60">
                  {new Date(f.timestamp).toLocaleString()}
                </td>
                <td className="py-2 pr-4">{f.kb_name}</td>
                <td className="py-2 pr-4 max-w-xs truncate">{f.question}</td>
                <td className="py-2 pr-4">{f.answer_source}</td>
                <td className="py-2 pr-4">{f.thumbs === "up" ? "👍" : f.thumbs === "down" ? "👎" : "—"}</td>
              </tr>
            ))}
            {recentFeedback.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 opacity-50">
                  No questions logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-black/10 dark:border-white/15 rounded-lg p-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  );
}
