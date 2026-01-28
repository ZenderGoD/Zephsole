'use client';

export default function InvitationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tighter">Invitations</h1>
        <p className="text-sm text-neutral-500 mt-1">Pending studio and collaboration invites.</p>
      </div>
      
      <div className="bg-neutral-900/50 border border-white/5 rounded-2xl p-12 flex items-center justify-center text-neutral-600 text-[10px] uppercase tracking-[0.3em]">
        No Pending Invitations
      </div>
    </div>
  );
}
