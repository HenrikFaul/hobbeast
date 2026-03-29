import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CalendarDays, LogOut, Shield, User, Wrench } from 'lucide-react';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [organizerEventId, setOrganizerEventId] = useState<string | null>(null);
  const [hasOrganizerAccess, setHasOrganizerAccess] = useState(false);

  if (!user) return null;

  useEffect(() => {
    let active = true;

    const fetchOrganizerAccess = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id')
        .eq('created_by', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (!active || error) return;

      setHasOrganizerAccess((data?.length ?? 0) > 0);
      setOrganizerEventId(data?.[0]?.id ?? null);
    };

    fetchOrganizerAccess();

    return () => {
      active = false;
    };
  }, [user.id]);

  const initials = (user.user_metadata?.display_name || user.email || 'U').slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 gradient-primary text-primary-foreground font-bold text-xs shadow-glow">
          {initials}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl w-48">
        <DropdownMenuItem onClick={() => navigate('/profile')} className="rounded-lg cursor-pointer">
          <User className="mr-2 h-4 w-4" /> Profilom
        </DropdownMenuItem>
        {hasOrganizerAccess && (
          <>
            <DropdownMenuItem onClick={() => navigate('/events')} className="rounded-lg cursor-pointer">
              <Wrench className="mr-2 h-4 w-4" /> Organizer mód
            </DropdownMenuItem>
            {organizerEventId && (
              <DropdownMenuItem onClick={() => navigate(`/events/${organizerEventId}/organize`)} className="rounded-lg cursor-pointer">
                <CalendarDays className="mr-2 h-4 w-4" /> Szervezői műszerfal
              </DropdownMenuItem>
            )}
          </>
        )}
        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate('/admin')} className="rounded-lg cursor-pointer">
            <Shield className="mr-2 h-4 w-4" /> Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { signOut(); navigate('/'); }} className="rounded-lg cursor-pointer text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Kijelentkezés
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
