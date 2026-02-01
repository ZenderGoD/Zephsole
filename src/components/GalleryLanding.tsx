import InfiniteGallery from '@/components/InfiniteGallery';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export function GalleryLanding() {
	const landingAssets = useQuery(api.siteAssets.listAssets, { type: 'landing' });
	
	const sampleImages = [
		{ src: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=800', alt: 'Footwear Design' },
		{ src: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=800', alt: 'Performance Sole' },
		{ src: 'https://images.unsplash.com/photo-1511556820780-d912e42b4980?auto=format&fit=crop&q=80&w=800', alt: 'Manufacturing Process' },
		{ src: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=800', alt: 'Material Analysis' },
		{ src: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&q=80&w=800', alt: 'Upper Pattern' },
		{ src: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=800', alt: 'Lacing Systems' },
		{ src: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&q=80&w=800', alt: 'Schematic Generation' },
		{ src: 'https://images.unsplash.com/photo-1560769629-975ec94e6a86?auto=format&fit=crop&q=80&w=800', alt: 'Sole Prototype' },
	];

	const displayImages = landingAssets && landingAssets.length > 0 
		? landingAssets.map(asset => ({ src: asset.url, alt: asset.fileName }))
		: sampleImages;

	return (
		<div className="min-h-screen bg-white">
			<InfiniteGallery
				images={displayImages}
				speed={1.2}
				zSpacing={3}
				visibleCount={12}
				falloff={{ near: 0.8, far: 14 }}
				className="h-screen w-full rounded-lg overflow-hidden"
			/>
			<div className="h-screen inset-0 pointer-events-none fixed flex flex-col items-center justify-center text-center px-3 mix-blend-exclusion text-white">
				<h1 className="font-serif text-4xl md:text-7xl tracking-tight">
					<span className="italic">ZEPHSOLE:</span> AI-Powered Footwear Design
				</h1>
				<div className="mt-8 pointer-events-auto">
					<Link href="/studio" className="px-8 py-3 border border-white/20 hover:bg-white hover:text-black transition-all rounded-full font-mono text-[10px] uppercase tracking-[0.2em]">
						Enter Studio
					</Link>
				</div>
			</div>

			<div className="text-center fixed bottom-10 left-0 right-0 font-mono uppercase text-[11px] font-semibold text-white/60">
				<p>From uppers to soles, from schematics to costing</p>
				<p className=" opacity-60">
					The complete AI pipeline for shoe creation
				</p>
			</div>
		</div>
	);
}
