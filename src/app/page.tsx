'use client';

import { useState } from 'react';
import { GalleryLanding } from '@/components/GalleryLanding';
import { SignalLanding } from '@/components/SignalLanding';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

export default function Page() {
  const [activeTab, setActiveTab] = useState<'gallery' | 'signal'>('gallery');
  const { data: session } = authClient.useSession();

  return (
    <div className="relative">
      {/* Auth Link */}
      <div className="fixed top-6 right-6 z-[100] flex gap-3">
        {session ? (
          <Link 
            href="/studio"
            className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-medium hover:bg-white/90 transition-colors"
          >
            Go to Studio
          </Link>
        ) : (
          <>
            <Link 
              href="/login"
              className="text-white/60 hover:text-white px-4 py-1.5 rounded-full text-xs font-medium transition-colors"
            >
              Sign In
            </Link>
            <Link 
              href="/register"
              className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-medium hover:bg-white/90 transition-colors"
            >
              Sign Up
            </Link>
          </>
        )}
      </div>

      {/* Toggle */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center bg-black/50 backdrop-blur-md p-1 rounded-full border border-white/10">
        <button
          onClick={() => setActiveTab('gallery')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            activeTab === 'gallery' ? "bg-white text-black" : "text-white/60 hover:text-white"
          )}
        >
          Gallery
        </button>
        <button
          onClick={() => setActiveTab('signal')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            activeTab === 'signal' ? "bg-white text-black" : "text-white/60 hover:text-white"
          )}
        >
          Signal
        </button>
      </div>

      {/* Render active landing page */}
      {activeTab === 'gallery' ? <GalleryLanding /> : <SignalLanding />}
    </div>
  );
}
