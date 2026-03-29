import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { useOrganizerMode } from '@/hooks/useOrganizerMode';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, LogOut, Shield, BriefcaseBusiness, Compass } from 'lucide-react';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const { mode, setMode, canUseOrganizerMode, ownedEventCount } = useOrganizerMode();

  if (!user) return null;

  const initials = (user.user_metadata?.display_name || user.email || 'U').slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 gradient-primary text-primary-foreground font-bold text-xs shadow-glow">
          {initials}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {mode === 'organizer' ? 'Organizer mód' : 'Community mód'}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => navigate('/profile')} className="rounded-lg cursor-pointer">
          <User className="mr-2 h-4 w-4" /> Profilom
        </DropdownMenuItem>
        {canUseOrganizerMode && (
          <>
            <DropdownMenuItem
              onClick={() => {
                setMode(mode === 'organizer' ? 'community' : 'organizer');
                navigate(mode === 'organizer' ? '/events' : '/organizer');
              }}
              className="rounded-lg cursor-pointer"
            >
              {mode === 'organizer' ? <Compass className="mr-2 h-4 w-4" /> : <BriefcaseBusiness className="mr-2 h-4 w-4" />}
              {mode === 'organizer' ? 'Váltás community módra' : `Organizer mód (${ownedEventCount})`}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/organizer')} className="rounded-lg cursor-pointer">
              <BriefcaseBusiness className="mr-2 h-4 w-4" /> Organizer felület
            </DropdownMenuItem>
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
