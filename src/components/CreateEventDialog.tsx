import { useState } from 'react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, CalendarPlus, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const CATEGORY_OPTIONS = [
  'Sport', 'Túra', 'Társasjátékok', 'Kreatív', 'Zene', 'Gasztronómia',
  'Kutyasétáltatás', 'Kultúra', 'Tech', 'Nyelv', 'Tánc', 'Jóga & Meditáció',
];

const LOCATION_TYPES = [
  { value: 'city', label: 'Város' },
  { value: 'district', label: 'Város + kerület' },
  { value: 'address', label: 'Pontos cím' },
  { value: 'free', label: 'Szabad megadás' },
  { value: 'online', label: 'Online' },
];

interface CreateEventDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateEventDialog({ onClose, onCreated }: CreateEventDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [eventDate, setEventDate] = useState<Date>();
  const [eventTime, setEventTime] = useState('');
  const [locationType, setLocationType] = useState('city');
  const [locationCity, setLocationCity] = useState('');
  const [locationDistrict, setLocationDistrict] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [locationFreeText, setLocationFreeText] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [imageEmoji, setImageEmoji] = useState('🎉');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !category) return;

    setLoading(true);
    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim() || null,
      category,
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
      created_by: user.id,
    });

    if (error) {
      toast.error('Hiba az esemény létrehozásakor.');
    } else {
      toast.success('Esemény sikeresen létrehozva!');
      onCreated();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2 }}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border bg-card p-6 shadow-modal" onClick={e => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <CalendarPlus className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-display text-lg font-bold">Új esemény létrehozása</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl"><X className="h-4 w-4" /></Button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esemény neve *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="pl. Vasárnapi futás" required className="rounded-xl h-11" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategória *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Válassz..." /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {CATEGORY_OPTIONS.map(opt => <SelectItem key={opt} value={opt} className="rounded-lg">{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emoji ikon</Label>
              <Input value={imageEmoji} onChange={e => setImageEmoji(e.target.value)} className="rounded-xl h-11 text-center text-2xl" maxLength={2} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leírás (max. 300 karakter)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 300))} placeholder="Részletek..." className="rounded-xl" maxLength={300} />
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
            <Input type="number" min="2" max="500" value={maxAttendees} onChange={e => setMaxAttendees(e.target.value)} placeholder="pl. 20 (opcionális)" className="rounded-xl h-11" />
          </div>

          {/* Location */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Helyszín típusa</Label>
            <Select value={locationType} onValueChange={setLocationType}>
              <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                {LOCATION_TYPES.map(lt => <SelectItem key={lt.value} value={lt.value} className="rounded-lg">{lt.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {(locationType === 'city' || locationType === 'district' || locationType === 'address') && (
              <Input value={locationCity} onChange={e => setLocationCity(e.target.value)} placeholder="Város (pl. Budapest)" className="rounded-xl h-11" />
            )}
            {(locationType === 'district' || locationType === 'address') && (
              <Input value={locationDistrict} onChange={e => setLocationDistrict(e.target.value)} placeholder="Kerület (pl. XIII. kerület)" className="rounded-xl h-11" />
            )}
            {locationType === 'address' && (
              <Input value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="Pontos cím (pl. Váci utca 10.)" className="rounded-xl h-11" />
            )}
            {locationType === 'free' && (
              <Input value={locationFreeText} onChange={e => setLocationFreeText(e.target.value)} placeholder="Szabadon megadott helyszín..." className="rounded-xl h-11" />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Címkék (vesszővel elválasztva)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="pl. Kezdő-barát, Reggeli, Ingyenes" className="rounded-xl h-11" />
          </div>

          <Button type="submit" className="w-full h-11 rounded-xl gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold" disabled={loading || !title.trim() || !category}>
            {loading ? 'Létrehozás...' : 'Esemény létrehozása'}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
