import { Suspense } from 'react';
import { NearMe } from '@/components/NearMe';
export const metadata = { title: 'Near Me' };
export default function Page() { return <Suspense><NearMe /></Suspense>; }
