'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { GalleryLanding } from '@/components/GalleryLanding';
import { SignalLanding } from '@/components/SignalLanding';

function PageContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'gallery';

  return (
    <div className="relative">
      {/* Render active landing page */}
      {activeTab === 'gallery' ? <GalleryLanding /> : <SignalLanding />}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
