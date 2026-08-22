import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { SafetyActions } from '@/components/safety/SafetyActions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PublicProfileCard {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  interests: string[] | null;
  member_since: string | null;
}

export default function PublicMemberProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfileCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const blockQuery = user
        ? supabase.from('user_blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', userId).maybeSingle()
        : Promise.resolve({ data: null, error: null });
      const [profileResult, blockResult] = await Promise.all([
        supabase.from('public_profile_cards').select('user_id,display_name,avatar_url,bio,city,interests,member_since').eq('user_id', userId).maybeSingle(),
        blockQuery,
      ]);
      setBlocked(Boolean(blockResult.data));
      setProfile((profileResult.data as PublicProfileCard | null) || null);
      setLoading(false);
    };
    void load();
  }, [user, userId]);

  const requireAuth = () => {
    if (user || !userId) return true;
    navigate(`/auth?redirect=${encodeURIComponent(`/members/${userId}`)}`);
    return false;
  };

  const toggleBlock = async () => {
    if (!requireAuth() || !userId) return;
    setWorking(true);
    const { error } = await supabase.rpc('set_user_block', {
      _blocked_user_id: userId,
      _blocked: !blocked,
      _reason_code: blocked ? null : 'user_initiated',
    });
    if (error) toast.error('A tiltási beállítás nem menthető.');
    else {
      setBlocked(!blocked);
      if (!blocked) setProfile(null);
      toast.success(blocked ? 'A tiltást feloldottad.' : 'A felhasználót letiltottad. Az ajánlásokból és kapcsolódási felületekről is eltűnik.');
    }
    setWorking(false);
  };

  if (loading) return <main className="min-h-screen px-4 pt-24"><p role="status">Profil betöltése…</p></main>;

  if (blocked) {
    return <main className="min-h-screen px-4 pt-24"><Card className="mx-auto max-w-xl"><CardContent className="space-y-4 pt-6"><h1 className="font-display text-xl font-bold">Letiltott profil</h1><p className="text-muted-foreground">A profil és a kapcsolódási lehetőségek rejtve vannak.</p><Button variant="outline" disabled={working} onClick={() => void toggleBlock()}>Tiltás feloldása</Button></CardContent></Card></main>;
  }

  if (!profile) {
    return <main className="min-h-screen px-4 pt-24"><Card className="mx-auto max-w-xl"><CardContent className="pt-6"><h1 className="font-display text-xl font-bold">A profil nem érhető el</h1><p className="mt-2 text-muted-foreground">Lehet, hogy privát, inaktív, vagy a biztonsági beállítások miatt nem látható.</p></CardContent></Card></main>;
  }

  const initials = (profile.display_name || 'Tag').slice(0, 2).toUpperCase();
  return (
    <main className="min-h-screen px-4 pb-16 pt-24">
      <div className="mx-auto max-w-3xl space-y-5">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Vissza</Button>
        <Card className="rounded-3xl">
          <CardHeader className="items-center text-center">
            <Avatar className="h-24 w-24"><AvatarImage src={profile.avatar_url || undefined} /><AvatarFallback className="text-xl">{initials}</AvatarFallback></Avatar>
            <CardTitle className="mt-3 font-display text-2xl">{profile.display_name || 'Hobbeast tag'}</CardTitle>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
              {profile.city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{profile.city}</span>}
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" />Minimális publikus profil</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {profile.bio && <section><h2 className="font-semibold">Bemutatkozás</h2><p className="mt-2 whitespace-pre-wrap text-muted-foreground">{profile.bio}</p></section>}
            <section><h2 className="font-semibold">Megosztott érdeklődések</h2><div className="mt-3 flex flex-wrap gap-2">{profile.interests?.length ? profile.interests.map((interest) => <Badge key={interest} variant="secondary">{interest}</Badge>) : <span className="text-sm text-muted-foreground">Nincs megosztott érdeklődés.</span>}</div></section>
            <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row">
              {user?.id !== userId && (
                <SafetyActions
                  targetType="user"
                  targetRef={userId || ''}
                  targetUserId={userId}
                  sourceSurface="public_member_profile"
                  className="w-full"
                  onBlocked={() => {
                    setBlocked(true);
                    setProfile(null);
                  }}
                />
              )}
            </div>
          </CardContent>
        </Card>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"><UserRound className="h-4 w-4" />Kapcsolódási javaslat csak közös, hitelesített esemény után és kölcsönös választással jön létre.</p>
      </div>
    </main>
  );
}
