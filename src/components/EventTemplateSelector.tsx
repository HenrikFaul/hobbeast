import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { FileText, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CURATED_EVENT_TEMPLATES,
  deleteOwnedEventTemplate,
  loadOwnedEventTemplates,
  saveOwnedEventTemplate,
  type EventTemplateContract,
} from '@/features/organizer/eventTemplates';

interface EventTemplateSelectorProps {
  onSelect: (template: EventTemplateContract) => void;
}

export function EventTemplateSelector({ onSelect }: EventTemplateSelectorProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EventTemplateContract[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    let active = true;
    setLoading(true);
    void loadOwnedEventTemplates(user.id)
      .then((data) => { if (active) setTemplates(data); })
      .catch(() => {
        if (!active) return;
        setTemplates([]);
        toast.error('A mentett sablonokat most nem sikerült betölteni.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, open]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteOwnedEventTemplate(user.id, id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Sablon törölve.');
    } catch {
      toast.error('Hiba a sablon törlésekor.');
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
        aria-expanded={open}
        aria-controls="event-template-options"
      >
        <FileText className="h-3.5 w-3.5" />
        Sablon használata
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {open && (
        <div
          id="event-template-options"
          className="rounded-xl border bg-popover max-h-[200px] overflow-y-auto divide-y"
          aria-busy={loading}
        >
          <div className="p-2" aria-label="Beépített eseménysablonok">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Beépített formátumok</p>
            {CURATED_EVENT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => { onSelect(template); setOpen(false); }}
              >
                {template.template_name}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Betöltés...</div>
          ) : templates.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nincs saját mentett sablonod. Hozz létre egy eseményt, majd mentsd el sablonként!
            </div>
          ) : (
            templates.map(t => (
              <div key={t.id} className="flex items-center gap-1 px-2 hover:bg-muted/50 transition-colors">
                <button
                  type="button"
                  className="min-w-0 flex-1 px-2 py-3 text-left flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => { onSelect(t); setOpen(false); }}
                >
                  <span className="text-lg" aria-hidden="true">{t.image_emoji || '📋'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{t.template_name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{t.category}</span>
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0 text-destructive/60 hover:text-destructive"
                  onClick={(e) => handleDelete(e, t.id)}
                  aria-label={`${t.template_name} sablon törlése`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
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
    try {
      await saveOwnedEventTemplate({
        userId: user.id,
        templateName: name.trim(),
        category: props.category,
        description: props.description || null,
        imageEmoji: props.imageEmoji || '🎉',
        tags: props.tags.split(',').map(t => t.trim()).filter(Boolean),
        locationType: props.locationType,
        locationCity: props.locationCity || null,
        locationDistrict: props.locationDistrict || null,
        locationAddress: props.locationAddress || null,
        locationFreeText: props.locationFreeText || null,
        maxAttendees: props.maxAttendees ? Number.parseInt(props.maxAttendees, 10) : null,
        eventTime: props.eventTime || null,
      });
      toast.success('Sablon elmentve!');
      setShowInput(false);
      setName('');
    } catch {
      toast.error('Hiba a sablon mentésekor.');
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
