import { Suspense } from 'react';
import { UploadForm } from '@/components/UploadForm';
export const metadata = { title: 'Upload a photo' };
export default function Page() {
  return <div className="mx-auto max-w-6xl px-4 py-6"><h1 className="section-title mb-5">Upload a photograph</h1><Suspense><UploadForm /></Suspense></div>;
}
