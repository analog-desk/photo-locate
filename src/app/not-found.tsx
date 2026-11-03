import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="h-display text-3xl">Nothing here</h1>
      <p className="mt-3 text-sm text-zinc-400">This location or page doesn’t exist, or it was merged into another entry during de-duplication.</p>
      <Link href="/" className="btn-primary mt-6">Back to Discover</Link>
    </div>
  );
}
