'use client';
import { CardGrid } from '@/components/LocationCard';
import { Empty, Section } from '@/components/ui';
import { listByOrder } from '@/lib/repo';
import { hasSupabase } from '@/lib/config';
import { useAsync } from '@/lib/useAsync';

export default function Trending() {
  const db = hasSupabase();
  const { data, loading } = useAsync(async () => db ? Promise.all([listByOrder('trending', 24), listByOrder('recent', 12), listByOrder('hidden', 12)]) : null, [db]);
  if (!db) return <Section title="Trending"><Empty title="Trending needs the global index">Trends are computed from popularity history collected by the six-hour refresh (Wikipedia page-view momentum, new licensed photos, community engagement). Connect Supabase to enable it.</Empty></Section>;
  if (loading || !data) return <Section title="Trending"><p className="text-sm text-zinc-400">Loading…</p></Section>;
  const [trending, recent, hidden] = data;
  return (
    <>
      <Section title="Gaining popularity" kicker="Momentum vs. the previous 30 days">
        {trending.length ? <CardGrid items={trending} /> : <Empty title="Not enough history yet">Trends appear once at least two weeks of popularity history have been collected.</Empty>}
      </Section>
      <Section title="New discoveries" kicker="Recently added by the discovery cycle">{recent.length ? <CardGrid items={recent} /> : <Empty title="Nothing discovered yet" />}</Section>
      <Section title="Hidden gems" kicker="High scenic score, low attention">{hidden.length ? <CardGrid items={hidden} /> : <Empty title="No hidden gems indexed yet" />}</Section>
    </>
  );
}
