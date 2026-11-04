'use client';
import Link from 'next/link';
import { Logo } from './Logo';
import { usePathname } from 'next/navigation';
import { CalendarClock, CloudSun, Compass, FolderHeart, LocateFixed, Map, SunMoon, TrendingUp, User, Users } from 'lucide-react';

export const NAV = [
  { href: '/', label: 'Discover', icon: Compass },
  { href: '/explore', label: 'Explore Map', icon: Map },
  { href: '/near-me', label: 'Near Me', icon: LocateFixed },
  { href: '/trending', label: 'Trending', icon: TrendingUp },
  { href: '/sun-moon', label: 'Sun & Moon', icon: SunMoon },
  { href: '/weather', label: 'Weather', icon: CloudSun },
  { href: '/community', label: 'Community', icon: Users },
  { href: '/collections', label: 'My Collections', icon: FolderHeart },
  { href: '/planner', label: 'Planner', icon: CalendarClock },
  { href: '/profile', label: 'Profile', icon: User },
];
const MOBILE = ['/', '/explore', '/near-me', '/planner', '/profile'];

export function Nav() {
  const path = usePathname();
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  return (
    <>
      <header className="sticky top-0 z-[1000] border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={30} />
            <span className="h-display text-lg">Varo’s Eye</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition ${active(n.href) ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-100'}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            {NAV.filter((n) => !MOBILE.includes(n.href)).map((n) => (
              <Link key={n.href} href={n.href} aria-label={n.label} className={`rounded-full p-2 ${active(n.href) ? 'bg-white/10 text-white' : 'text-zinc-400'}`}>
                <n.icon size={18} />
              </Link>
            ))}
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-white/5 bg-ink-950/90 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE.includes(n.href)).map((n) => (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] ${active(n.href) ? 'text-gold-400' : 'text-zinc-400'}`}>
              <n.icon size={20} />
              {n.label.replace('Explore ', '')}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
