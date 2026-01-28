'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  Sparkles, 
  PencilRuler, 
  Beaker, 
  ArrowLeft,
  ChevronRight,
  Target,
  BarChart3,
  Lightbulb,
  Palette,
  DraftingCompass,
  Zap,
  Microscope,
  FlaskConical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const INTELLIGENCE_MODES = {
  research: {
    title: "Market Intelligence",
    icon: Search,
    color: "text-blue-500",
    description: "Scan the horizon for what's next. Our Market Intelligence engine processes global consumer shifts, retail trends, and cultural signals to give you a strategic edge.",
    capabilities: [
      {
        title: "Trend Forecasting",
        description: "Analyze emerging silhouettes, color palettes, and material preferences before they hit the mainstream.",
        icon: Target
      },
      {
        title: "Competitive Analysis",
        description: "Monitor market leaders and disruptive startups to identify whitespace opportunities in your category.",
        icon: BarChart3
      },
      {
        title: "Consumer Sentiment",
        description: "Understand the 'why' behind the 'what' by processing millions of social and search signals.",
        icon: Lightbulb
      }
    ]
  },
  ideation: {
    title: "Visual Ideation",
    icon: Sparkles,
    color: "text-purple-500",
    description: "Break through creative blocks with AI-accelerated visual exploration. Transform abstract concepts into tangible design directions in seconds.",
    capabilities: [
      {
        title: "Moodboard Generation",
        description: "Instantly create cohesive visual directions from simple text prompts or uploaded reference images.",
        icon: Palette
      },
      {
        title: "Rapid Iteration",
        description: "Explore dozens of silhouette variations and colorways without the overhead of manual sketching.",
        icon: Zap
      },
      {
        title: "Concept Refinement",
        description: "Use advanced AI to polish rough sketches into presentation-ready design concepts.",
        icon: Sparkles
      }
    ]
  },
  technical: {
    title: "Technical Drafting",
    icon: PencilRuler,
    color: "text-emerald-500",
    description: "Bridge the gap between vision and production. Generate precise technical specifications, patterns, and construction details automatically.",
    capabilities: [
      {
        title: "Pattern Engineering",
        description: "Generate initial 2D patterns based on 3D silhouettes, optimized for material efficiency.",
        icon: DraftingCompass
      },
      {
        title: "Spec Sheet Automation",
        description: "Automatically compile BOMs (Bill of Materials) and technical callouts for manufacturer communication.",
        icon: PencilRuler
      },
      {
        title: "Construction Analysis",
        description: "Verify design feasibility with AI that understands footwear assembly and structural integrity.",
        icon: Microscope
      }
    ]
  },
  material: {
    title: "Material Science",
    icon: Beaker,
    color: "text-orange-500",
    description: "Explore the next generation of footwear materials. From bio-synthetics to high-performance polymers, find the perfect match for your design.",
    capabilities: [
      {
        title: "Performance Simulation",
        description: "Predict how materials will behave under stress, heat, and moisture before physical prototyping.",
        icon: Zap
      },
      {
        title: "Sustainability Scoring",
        description: "Evaluate the environmental impact of your material choices with comprehensive LCA data.",
        icon: FlaskConical
      },
      {
        title: "Smart Sourcing",
        description: "Connect with a global database of innovative material suppliers and sustainable alternatives.",
        icon: Beaker
      }
    ]
  }
};

export default function IntelligencePage({ params }: { params: Promise<{ mode: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const modeData = INTELLIGENCE_MODES[resolvedParams.mode as keyof typeof INTELLIGENCE_MODES];

  if (!modeData) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Intelligence Mode Not Found</h1>
          <Button onClick={() => router.back()} variant="outline">Go Back</Button>
        </div>
      </div>
    );
  }

  const Icon = modeData.icon;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 md:p-12 lg:p-16 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <header className="space-y-6">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors text-xs uppercase tracking-widest font-mono"
          >
            <ArrowLeft size={14} />
            Back to Studio
          </button>
          
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl bg-white/5 ${modeData.color}`}>
              <Icon size={32} />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{modeData.title}</h1>
          </div>
          
          <p className="text-lg md:text-xl text-neutral-400 leading-relaxed max-w-2xl">
            {modeData.description}
          </p>
        </header>

        {/* Capabilities Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modeData.capabilities.map((cap, i) => (
            <Card key={i} className="bg-white/5 border-white/10 hover:border-white/20 transition-all group">
              <CardHeader className="space-y-4">
                <div className="p-2 w-fit rounded-lg bg-white/5 text-neutral-300 group-hover:text-white transition-colors">
                  <cap.icon size={20} />
                </div>
                <CardTitle className="text-lg text-white font-semibold tracking-tight">{cap.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-neutral-500 leading-relaxed group-hover:text-neutral-400 transition-colors">
                  {cap.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Action Section */}
        <section className="pt-12 border-t border-white/5">
          <div className="bg-gradient-to-r from-neutral-900 to-black rounded-3xl p-8 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Ready to start?</h2>
              <p className="text-neutral-500">Launch a new thread to apply {modeData.title} to your project.</p>
            </div>
            <Button 
              onClick={() => router.push('/studio')}
              className="bg-white text-black hover:bg-neutral-200 h-14 px-8 rounded-2xl font-bold uppercase tracking-widest"
            >
              Start Generation
              <ChevronRight size={18} />
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
