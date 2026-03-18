import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { User, LogOut, Settings, Shield } from 'lucide-react';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

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
        <DropdownMenuItem onClick={() => navigate('/profile')} className="rounded-lg cursor-pointer">
          <Settings className="mr-2 h-4 w-4" /> Beállítások
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { signOut(); navigate('/'); }} className="rounded-lg cursor-pointer text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Kijelentkezés
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
