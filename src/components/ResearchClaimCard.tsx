import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Heart, Plus, Quote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  setResearchClaimSaved,
  useRandomResearchClaim,
  type ResearchClaimPlacement,
} from '@/features/research-claims';

interface ResearchClaimCardProps {
  placement: ResearchClaimPlacement;
  className?: string;
}

const ResearchClaimCard = ({ placement, className = '' }: ResearchClaimCardProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const authScope = user?.id ?? 'anonymous';
  const authScopeRef = useRef(authScope);
  authScopeRef.current = authScope;
  const claimQuery = useRandomResearchClaim(placement, authScope);
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>({});
  const saveMutation = useMutation({
    mutationFn: ({ claimId, saved }: { claimId: string; saved: boolean; authScope: string }) => (
      setResearchClaimSaved(claimId, saved)
    ),
    onSuccess: (saved, variables) => {
      if (variables.authScope !== authScopeRef.current) return;
      setSavedOverrides((current) => ({ ...current, [variables.claimId]: saved }));
      void queryClient.invalidateQueries({
        queryKey: ['saved-community-research-claims', variables.authScope],
      });
      toast.success(saved ? 'Az idézetet elmentetted.' : 'Az idézetet eltávolítottad a mentéseid közül.');
    },
    onError: () => toast.error('Az idézet mentését most nem sikerült frissíteni.'),
  });

  useEffect(() => {
    setSavedOverrides({});
  }, [authScope]);

  if (claimQuery.isLoading) {
    return (
      <div
        aria-hidden="true"
        className={`min-h-[230px] animate-pulse rounded-[1.6rem] border border-border/75 bg-muted ${className}`}
      />
    );
  }

  const claim = claimQuery.data;
  if (!claim) return null;
  const saved = savedOverrides[claim.id] ?? claim.isSaved;

  const toggleSaved = () => {
    if (!user) {
      toast.info('Az idézet mentéséhez jelentkezz be.');
      navigate('/auth');
      return;
    }
    saveMutation.mutate({ claimId: claim.id, saved: !saved, authScope });
  };

  return (
    <article
      lang={claim.locale}
      className={`relative min-h-[230px] overflow-hidden rounded-[1.6rem] border border-border/75 bg-card p-6 shadow-[0_18px_50px_-40px_hsl(var(--foreground)/0.55)] sm:p-8 ${className}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-accent/25 blur-2xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Quote size={14} aria-hidden="true" />
            Közösségi tudástár
          </div>
          <Button
            type="button"
            size="sm"
            variant={saved ? 'destructive' : 'outline'}
            aria-pressed={saved}
            aria-label={saved ? 'Mentett idézet eltávolítása' : 'Idézet kedvelése és mentése'}
            disabled={saveMutation.isPending}
            onClick={toggleSaved}
            className={`min-h-11 shrink-0 rounded-full px-3.5 text-xs font-extrabold ${saved ? '' : 'text-destructive'}`}
          >
            <span className="inline-flex items-center" aria-hidden="true">
              <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
              {saved ? <Check size={12} strokeWidth={4} /> : <Plus size={12} strokeWidth={4} />}
            </span>
            {saved ? 'Elmentve' : 'Mentés'}
          </Button>
        </div>

        <blockquote className="mt-7 max-w-4xl font-display text-xl font-bold leading-relaxed tracking-[-0.015em] text-foreground sm:text-2xl">
          {claim.statement}
        </blockquote>

        <footer className="mt-auto pt-9 text-sm leading-relaxed text-muted-foreground">
          <p className="font-bold text-foreground">
            {claim.sourceTitle}
            {claim.sourceContainer ? ` — ${claim.sourceContainer}` : ''}
          </p>
          <p className="mt-1">
            {claim.authors} · {claim.publicationYear}
          </p>
          {claim.sourceUrl && (
            <a
              href={claim.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-foreground/15 px-5 text-sm font-bold text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Eredeti forrás <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </footer>
      </div>
    </article>
  );
};

export default ResearchClaimCard;
