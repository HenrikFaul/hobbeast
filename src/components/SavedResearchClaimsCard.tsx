import { ExternalLink, Heart, HeartOff, Loader2, Quote } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useSavedResearchClaims, type SavedCommunityResearchClaim } from '@/features/research-claims';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function getSourceHref(claim: SavedCommunityResearchClaim): string | null {
  if (claim.sourceUrl) return claim.sourceUrl;
  return claim.doi ? `https://doi.org/${claim.doi}` : null;
}

export function SavedResearchClaimsCard() {
  const { user } = useAuth();
  const {
    claims,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    removeSavedClaim,
    removingClaimId,
    removeError,
  } = useSavedResearchClaims(user?.id);

  if (!user) return null;

  const handleRemove = async (claimId: string) => {
    try {
      await removeSavedClaim(claimId);
      toast.success('Az idézetet eltávolítottad a mentéseid közül.');
    } catch {
      toast.error('Az idézet eltávolítása most nem sikerült.');
    }
  };

  return (
    <Card className="rounded-2xl border shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 font-display text-base">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10">
            <Heart className="h-5 w-5 text-destructive" aria-hidden="true" />
          </span>
          Mentett idézetek
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Azok a közösségi kutatási állítások, amelyeket későbbre elmentettél.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex min-h-24 items-center justify-center" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Mentett idézetek betöltése…</span>
          </div>
        )}

        {isError && (
          <div className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            <p>A mentett idézeteket most nem sikerült betölteni.</p>
            <Button type="button" variant="link" className="h-auto" onClick={() => void refetch()}>
              Újrapróbálom
            </Button>
          </div>
        )}

        {!isLoading && !isError && claims.length === 0 && (
          <div className="rounded-xl border border-dashed p-4 text-center">
            <Quote className="mx-auto h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold">Még nincs mentett idézeted.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A piros szív plusz gombbal bármely megjelenő állítást ide teheted.
            </p>
          </div>
        )}

        {claims.map((claim) => {
          const sourceHref = getSourceHref(claim);
          const isRemoving = removingClaimId === claim.id;
          return (
            <article key={claim.id} lang={claim.locale} className="rounded-xl bg-muted/50 p-3.5">
              <blockquote className="text-sm font-semibold leading-relaxed text-foreground">
                {claim.statement}
              </blockquote>
              <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">
                  {claim.sourceTitle}
                  {claim.sourceContainer ? ` — ${claim.sourceContainer}` : ''}
                </p>
                <p>{claim.authors} · {claim.publicationYear}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {sourceHref ? (
                  <a
                    href={sourceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Eredeti forrás <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : <span />}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-10 text-xs text-destructive hover:text-destructive"
                  aria-label={`Mentett idézet eltávolítása: ${claim.sourceTitle}`}
                  disabled={isRemoving}
                  onClick={() => void handleRemove(claim.id)}
                >
                  {isRemoving
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <HeartOff className="h-4 w-4" aria-hidden="true" />}
                  Eltávolítás
                </Button>
              </div>
            </article>
          );
        })}

        {removeError && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            Az idézet eltávolítása nem sikerült; a korábbi állapot visszaállt.
          </p>
        )}

        {hasNextPage && (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Betöltés…' : 'További mentett idézetek'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
