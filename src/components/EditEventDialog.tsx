import { useState } from 'react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Save, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const LOCATION_TYPES = [
  { value: 'city', label: 'Város' },
  { value: 'district', label: 'Város + kerület' },
  { value: 'address', label: 'Pontos cím' },
  { value: 'free', label: 'Szabad megadás' },
  { value: 'online', label: 'Online' },
];

interface EditEventDialogProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    event_date: string | null;
    event_time: string | null;
    location_type: string | null;
    location_city: string | null;
    location_district: string | null;
    location_address: string | null;
    location_free_text: string | null;
    max_attendees: number | null;
    image_emoji: string | null;
    tags: string[] | null;
  };
  onClose: () => void;
  onUpdated: () => void;
}

export function EditEventDialog({ event, onClose, onUpdated }: EditEventDialogProps) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [eventDate, setEventDate] = useState<Date | undefined>(event.event_date ? new Date(event.event_date) : undefined);
  const [eventTime, setEventTime] = useState(event.event_time || '');
  const [locationType, setLocationType] = useState(event.location_type || 'city');
  const [locationCity, setLocationCity] = useState(event.location_city || '');
  const [locationDistrict, setLocationDistrict] = useState(event.location_district || '');
  const [locationAddress, setLocationAddress] = useState(event.location_address || '');
  const [locationFreeText, setLocationFreeText] = useState(event.location_free_text || '');
  const [maxAttendees, setMaxAttendees] = useState(event.max_attendees ? String(event.max_attendees) : '');
  const [imageEmoji, setImageEmoji] = useState(event.image_emoji || '🎉');
  const [tags, setTags] = useState((event.tags || []).join(', '));
  const [loading, setLoading] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    const { error } = await supabase.from('events').update({
      title: title.trim(),
      description: description.trim() || null,
      event_date: eventDate ? format(eventDate, 'yyyy-MM-dd') : null,
      event_time: eventTime || null,
      location_type: locationType,
      location_city: locationCity || null,
      location_district: locationDistrict || null,
      location_address: locationAddress || null,
      location_free_text: locationFreeText || null,
      max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      image_emoji: imageEmoji,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    }).eq('id', event.id);

    if (error) {
      toast.error('Hiba a mentés során.');
    } else {
      toast.success('Esemény frissítve!');
      onUpdated();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-modal" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Esemény szerkesztése</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esemény neve</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} required className="rounded-xl h-11" />
          </div>

          <div className="flex gap-3 items-end">
            <div className="space-y-2 flex-shrink-0">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emoji</Label>
              <Input value={imageEmoji} onChange={e => setImageEmoji(e.target.value)} className="rounded-xl h-11 text-center text-2xl w-20" maxLength={2} />
            </div>
            <div className="space-y-2 flex-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategória</Label>
              <Input value={event.category} disabled className="rounded-xl h-11" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leírás</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 300))} className="rounded-xl" maxLength={300} />
            <p className="text-xs text-muted-foreground text-right">{description.length}/300</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dátum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal rounded-xl h-11", !eventDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {eventDate ? format(eventDate, 'yyyy. MM. dd.', { locale: hu }) : 'Válassz...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={eventDate} onSelect={setEventDate} disabled={(date) => date < today} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Időpont</Label>
              <Input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} className="rounded-xl h-11" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Max. létszám</Label>
            <Input type="number" min={1} value={maxAttendees} onChange={e => setMaxAttendees(e.target.value)} className="rounded-xl h-11" />
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Helyszín</Label>
            <Select value={locationType} onValueChange={setLocationType}>
              <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                {LOCATION_TYPES.map(lt => <SelectItem key={lt.value} value={lt.value} className="rounded-lg">{lt.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {['city', 'district', 'address'].includes(locationType) && (
              <Input value={locationCity} onChange={e => setLocationCity(e.target.value)} placeholder="Város" className="rounded-xl h-11" />
            )}
            {['district', 'address'].includes(locationType) && (
              <Input value={locationDistrict} onChange={e => setLocationDistrict(e.target.value)} placeholder="Kerület" className="rounded-xl h-11" />
            )}
            {locationType === 'address' && (
              <Input value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="Cím" className="rounded-xl h-11" />
            )}
            {locationType === 'free' && (
              <Input value={locationFreeText} onChange={e => setLocationFreeText(e.target.value)} placeholder="Helyszín" className="rounded-xl h-11" />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Címkék (vesszővel)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} className="rounded-xl h-11" />
          </div>

          <Button type="submit" className="w-full h-11 rounded-xl gradient-primary text-primary-foreground shadow-glow font-semibold" disabled={loading || !title.trim()}>
            <Save className="h-4 w-4 mr-2" /> {loading ? 'Mentés...' : 'Módosítások mentése'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
