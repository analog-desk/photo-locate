'use client';
export default function LocationError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="h-display text-3xl">Location data is temporarily unavailable</h1>
      <p className="mt-3 text-sm text-zinc-400">One of our open-data providers (Wikidata, OpenStreetMap or Wikimedia Commons) didn’t respond. Nothing is shown rather than incomplete or guessed information.</p>
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
