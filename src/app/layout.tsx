import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { Nav } from '@/components/Nav';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'] });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'Varo’s Eye — Photography Location Atlas', template: '%s · Varo’s Eye' },
  description: 'Discover the world’s best photography locations, plan around golden & blue hour, weather, sun and moon — with parking, access and viewpoints.',
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/manifest.webmanifest`,
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icon.svg`, apple: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/apple-touch-icon.png` },
  applicationName: 'Varo’s Eye',
};

export const viewport: Viewport = { themeColor: '#07080a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh font-sans">
        <Nav />
        <main className="pb-24 md:pb-10">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-28 pt-6 text-xs text-zinc-500 md:pb-8">
          Map data © OpenStreetMap contributors (ODbL) · Places from Wikidata (CC0) · Photos from Wikimedia Commons & Flickr under their stated licenses ·
          Weather by Open-Meteo.com (CC BY 4.0) · Elevation: Copernicus DEM. Forecast-based ratings are indicators, never guarantees. Respect private property and local rules.
        </footer>
      </body>
    </html>
  );
}
