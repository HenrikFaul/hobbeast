import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { FileText, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface EventTemplate {
  id: string;
  template_name: string;
  category: string;
  description: string | null;
  image_emoji: string | null;
  tags: string[] | null;
  location_type: string | null;
  location_city: string | null;
  location_district: string | null;
  location_address: string | null;
  location_free_text: string | null;
  max_attendees: number | null;
  event_time: string | null;
}

interface EventTemplateSelectorProps {
  onSelect: (template: EventTemplate) => void;
}

export function EventTemplateSelector({ onSelect }: EventTemplateSelectorProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    setLoading(true);
    supabase
      .from('event_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTemplates((data as unknown as EventTemplate[]) || []);
        setLoading(false);
      });
  }, [user, open]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const { error } = await supabase.from('event_templates').delete().eq('id', id);
    if (error) {
      toast.error('Hiba a sablon törlésekor.');
    } else {
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Sablon törölve.');
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl h-9 text-xs gap-1.5"
        onClick={() => setOpen(!open)}
      >
        <FileText className="h-3.5 w-3.5" />
        Sablon használata
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div className="rounded-xl border bg-popover max-h-[200px] overflow-y-auto divide-y">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Betöltés...</div>
          ) : templates.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nincs mentett sablonod. Hozz létre egy eseményt, majd mentsd el sablonként!
            </div>
          ) : (
            templates.map(t => (
              <button
                key={t.id}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                onClick={() => { onSelect(t); setOpen(false); }}
              >
                <span className="text-lg">{t.image_emoji || '📋'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.template_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.category}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0 text-destructive/60 hover:text-destructive"
                  onClick={(e) => handleDelete(e, t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface SaveAsTemplateButtonProps {
  category: string;
  description: string;
  imageEmoji: string;
  tags: string;
  locationType: string;
  locationCity: string;
  locationDistrict: string;
  locationAddress: string;
  locationFreeText: string;
  maxAttendees: string;
  eventTime: string;
}

export function SaveAsTemplateButton(props: SaveAsTemplateButtonProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [showInput, setShowInput] = useState(false);

  if (!user) return null;

  const handleSave = async () => {
    if (!name.trim() || !props.category) return;
    setSaving(true);
    const { error } = await supabase.from('event_templates').insert({
      user_id: user.id,
      template_name: name.trim(),
      category: props.category,
      description: props.description || null,
      image_emoji: props.imageEmoji || '🎉',
      tags: props.tags.split(',').map(t => t.trim()).filter(Boolean),
      location_type: props.locationType,
      location_city: props.locationCity || null,
      location_district: props.locationDistrict || null,
      location_address: props.locationAddress || null,
      location_free_text: props.locationFreeText || null,
      max_attendees: props.maxAttendees ? parseInt(props.maxAttendees) : null,
      event_time: props.eventTime || null,
    });
    if (error) {
      toast.error('Hiba a sablon mentésekor.');
    } else {
      toast.success('Sablon elmentve!');
      setShowInput(false);
      setName('');
    }
    setSaving(false);
  };

  if (!showInput) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl h-9 text-xs gap-1.5"
        onClick={() => setShowInput(true)}
        disabled={!props.category}
      >
        <FileText className="h-3.5 w-3.5" />
        Mentés sablonként
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Sablon neve..."
        className="flex-1 h-9 rounded-xl border px-3 text-sm bg-background"
        autoFocus
      />
      <Button type="button" size="sm" className="rounded-xl h-9 text-xs" onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? 'Mentés...' : 'Mentés'}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="rounded-xl h-9 text-xs" onClick={() => { setShowInput(false); setName(''); }}>
        Mégsem
      </Button>
    </div>
  );
}
