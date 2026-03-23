import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChangePasswordCard } from '@/components/ChangePasswordCard';
import { DeleteAccountCard } from '@/components/DeleteAccountCard';
import { NotificationPreferencesCard } from '@/components/NotificationPreferencesCard';
import { FavoriteEventCategoriesCard } from '@/components/FavoriteEventCategoriesCard';
import { ArrowLeft, User, Save, Camera, MapPin, Heart, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { AddressAutocomplete, type AddressSelection } from '@/components/AddressAutocomplete';

const HOBBY_OPTIONS = [
  'Futás', 'Kerékpár', 'Túrázás', 'Jóga', 'Crossfit', 'Úszás', 'Tenisz', 'Kosárlabda', 'Foci',
  'Társasjátékok', 'Videójátékok', 'Sakk',
  'Festés', 'Rajzolás', 'Fotózás', 'Kézművesség', 'Kötés/Horgolás',
  'Gitár', 'Zongora', 'Éneklés', 'DJ',
  'Főzés', 'Sütés', 'Borkóstolás',
  'Programozás', 'AI/ML', '3D nyomtatás', 'Robotika',
  'Kutyasétáltatás', 'Önkéntesség', 'Nyelvtanulás', 'Olvasás', 'Írás', 'Tánc', 'Meditáció',
];

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [genderPublic, setGenderPublic] = useState(false);
  const [agePublic, setAgePublic] = useState(false);
  const [address, setAddress] = useState('');
  const [addressPublic, setAddressPublic] = useState(false);
  const [city, setCity] = useState('');
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLon, setLocationLon] = useState<number | null>(null);
  const [hobbies, setHobbies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single();
      if (data) {
        setDisplayName(data.display_name || '');
        setAvatarUrl(data.avatar_url);
        setDateOfBirth(data.date_of_birth || '');
        setGender(data.gender || '');
        setGenderPublic(data.gender_public);
        setAgePublic(data.age_public);
        setAddress(data.address || '');
        setAddressPublic(data.address_public);
        setCity(data.city || '');
        setLocationLat((data as any).location_lat ?? null);
        setLocationLon((data as any).location_lon ?? null);
        setHobbies(data.hobbies || []);
      }
    };
    fetchProfile();
  }, [user, navigate]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A fájl maximum 5 MB lehet.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Csak képfájlokat tölthetsz fel.');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
    if (uploadError) {
      toast.error('Hiba a feltöltés során.');
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const url = `${publicUrl}?t=${Date.now()}`;

    await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
    setAvatarUrl(url);
    toast.success('Profilkép frissítve!');
    setUploading(false);
  };

  const toggleHobby = (hobby: string) => {
    setHobbies(prev => prev.includes(hobby) ? prev.filter(h => h !== hobby) : [...prev, hobby]);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!city.trim()) {
      toast.error('Legalább a várost add meg a lokációhoz.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      gender_public: genderPublic,
      age_public: agePublic,
      address: address || null,
      address_public: addressPublic,
      city: city || null,
      district: null,
      location_lat: locationLat,
      location_lon: locationLon,
      hobbies,
    }).eq('user_id', user.id);

    if (error) toast.error('Hiba a mentés során.');
    else toast.success('Profil frissítve!');
    setSaving(false);
  };

  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : 'U';

  return (
    <main className="pt-20 pb-16 min-h-screen">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-2xl font-bold">Profilom</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="rounded-2xl shadow-card border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 font-display">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    Profil adatok
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative group">
                      <Avatar className="h-24 w-24">
                        <AvatarImage src={avatarUrl || undefined} />
                        <AvatarFallback className="gradient-primary text-primary-foreground text-2xl font-bold">{displayName ? displayName.slice(0, 2).toUpperCase() : 'U'}</AvatarFallback>
                      </Avatar>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity"
                        disabled={uploading}
                      >
                        <Camera className="h-6 w-6 text-primary-foreground" />
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </div>
                    <p className="text-xs text-muted-foreground">{uploading ? 'Feltöltés...' : 'Kattints a képre a módosításhoz (max. 5 MB)'}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Megjelenített név</Label>
                      <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="rounded-xl h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mail</Label>
                      <Input value={user?.email || ''} disabled className="rounded-xl h-11" />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Születési dátum</Label>
                      <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} className="rounded-xl h-11" />
                      <div className="flex items-center gap-2">
                        <Switch checked={agePublic} onCheckedChange={setAgePublic} />
                        <span className="text-xs text-muted-foreground">Nyilvános életkor</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nem</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Válassz..." /></SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="male" className="rounded-lg">Férfi</SelectItem>
                          <SelectItem value="female" className="rounded-lg">Nő</SelectItem>
                          <SelectItem value="other" className="rounded-lg">Egyéb</SelectItem>
                          <SelectItem value="prefer_not_to_say" className="rounded-lg">Nem kívánom megadni</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Switch checked={genderPublic} onCheckedChange={setGenderPublic} />
                        <span className="text-xs text-muted-foreground">Nyilvános nem</span>
                      </div>
                    </div>
                  </div>

                  <Button onClick={handleSave} className="w-full rounded-xl h-11 gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold" disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Mentés...' : 'Profil mentése'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="rounded-2xl shadow-card border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 font-display">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
                      <MapPin className="h-5 w-5 text-accent" />
                    </div>
                    Lokációs beállítások
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    A címadatot az eseményeknél használjuk a távolság alapú szűréshez. Minél pontosabb címet adsz meg, annál pontosabban tud működni a távolságszűrő. Ha nem szeretnéd megadni a teljes címedet, elég csak a várost kiválasztanod.
                  </p>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lokáció keresése (város / utca / házszám)</Label>
                    <AddressAutocomplete
                      value={address}
                      onSelect={(sel: AddressSelection) => {
                        setAddress(sel.displayName);
                        setCity(sel.city || '');
                        setLocationLat(sel.lat || null);
                        setLocationLon(sel.lon || null);
                      }}
                      placeholder="Kezdd a várossal, majd folytathatod utcával és házszámmal..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Város</Label>
                    <Input value={city} readOnly placeholder="A kiválasztott lokációból automatikusan kitöltjük" className="rounded-xl h-11 bg-muted/30" />
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch checked={addressPublic} onCheckedChange={setAddressPublic} />
                    <span className="text-xs text-muted-foreground">
                      {addressPublic ? 'Pontos cím nyilvános' : 'Csak a város látható mások számára'}
                    </span>
                  </div>

                  <Button onClick={handleSave} className="w-full rounded-xl h-11 gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold" disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Mentés...' : 'Lokáció mentése'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="rounded-2xl shadow-card border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2.5 font-display">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10">
                      <Heart className="h-5 w-5 text-warning" />
                    </div>
                    Érdeklődési körök
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Válaszd ki a hobbikat, amelyek érdekelnek. Ez alapján ajánlunk neked eseményeket és embereket.</p>

                  {hobbies.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {hobbies.map(h => (
                        <Badge key={h} className="rounded-lg gradient-primary text-primary-foreground border-0 cursor-pointer" onClick={() => toggleHobby(h)}>
                          {h} <X className="ml-1 h-3 w-3" />
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {HOBBY_OPTIONS.filter(h => !hobbies.includes(h)).map(hobby => (
                      <Badge key={hobby} variant="outline" className="rounded-lg cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => toggleHobby(hobby)}>
                        + {hobby}
                      </Badge>
                    ))}
                  </div>

                  <Button onClick={handleSave} className="w-full rounded-xl h-11 gradient-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity font-semibold" disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Mentés...' : 'Hobbik mentése'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="lg:w-80 xl:w-96 space-y-6 flex-shrink-0">
            <ChangePasswordCard />
            <DeleteAccountCard />
          </motion.div>
        </div>
      </div>
    </main>
  );
};

export default Profile;
