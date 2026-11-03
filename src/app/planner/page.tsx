import { Suspense } from 'react';
import { Planner } from '@/components/Planner';
export const metadata = { title: 'Photography Planner' };
export default function Page() { return <Suspense><Planner /></Suspense>; }
