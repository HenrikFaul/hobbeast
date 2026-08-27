import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import {
  CREW_CAPABILITIES,
  EMPTY_CAPABILITIES,
  describeCapabilities,
  grantsAnything,
  listEventCrew,
  saveCrewRole,
  type CrewCapabilities,
  type CrewMember,
} from '@/features/organizer/eventCrew';

/**
 * Who else may help run this event.
 *
 * Everything behind this screen already existed and had never been reachable:
 * the table, its read policies, and an atomic RPC that records an audit entry
 * and refuses a change without a reason. This adds no new privilege — it makes
 * the existing one usable.
 *
 * Capabilities are shown as five separate switches rather than one "helper"
 * role, because the difference between letting somebody check people in and
 * letting them see the money should be a deliberate choice, visible on screen.
 */

interface OrganizerCrewTabProps {
  eventId: string | null;
  eventTitle: string | null;
  /** Only the owner may manage crew; helpers can see the list but not edit. */
  canManage: boolean;
}

function CapabilityToggles({
  value,
  onChange,
  idPrefix,
  disabled,
}: {
  value: CrewCapabilities;
  onChange: (next: CrewCapabilities) => void;
  idPrefix: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CREW_CAPABILITIES.map(({ key, label, hint }) => (
        <label
          key={key}
          htmlFor={`${idPrefix}-${key}`}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:bg-secondary/40"
        >
          <Checkbox
            id={`${idPrefix}-${key}`}
            checked={value[key]}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...value, [key]: checked === true })}
          />
          <span>
            <span className="block text-sm font-medium leading-none">{label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function OrganizerCrewTab({ eventId, eventTitle, canManage }: OrganizerCrewTabProps) {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newUserId, setNewUserId] = useState('');
  const [newCapabilities, setNewCapabilities] = useState<CrewCapabilities>(EMPTY_CAPABILITIES);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!eventId) {
      setCrew([]);
      return;
    }
    setLoading(true);
    setCrew(await listEventCrew(eventId));
    setLoading(false);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const mutate = async (
    userId: string,
    action: 'upsert' | 'remove',
    capabilities?: CrewCapabilities,
  ) => {
    if (!eventId) return;
    setSaving(true);
    const result = await saveCrewRole({ eventId, userId, action, capabilities, reason });
    setSaving(false);

    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    // A replay means the same request arrived twice — the state is right
    // either way, and saying so is less confusing than a second success.
    toast.success(result.replayed
      ? 'Ez a módosítás már el volt mentve.'
      : action === 'remove' ? 'Segítő eltávolítva.' : 'Segítő jogosultsága mentve.');
    setNewUserId('');
    setNewCapabilities(EMPTY_CAPABILITIES);
    setReason('');
    await load();
  };

  const canSubmitNew = Boolean(eventId)
    && newUserId.trim().length > 10
    && grantsAnything(newCapabilities)
    && reason.trim().length >= 3;

  return (
    <TabsContent value="crew" className="space-y-4">
      {!eventId ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Válassz ki egy eseményt a „Saját események" fülön, és itt tudod majd
            beállítani, ki segít a lebonyolításban.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                Segítők{eventTitle ? ` — ${eventTitle}` : ''}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Add át pontosan azt, amire szükség van. Minden módosítás naplózódik,
                és bármikor visszavonható.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Betöltés…
                </p>
              ) : crew.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  Még nincs segítőd ehhez az eseményhez. Egyedül is működik —
                  de ha valaki beléptet vagy üzen helyetted, itt tudod megadni neki.
                </p>
              ) : (
                <ul className="space-y-2">
                  {crew.map((member) => (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {member.display_name || 'Névtelen felhasználó'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {describeCapabilities(member)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="rounded-full">
                          {CREW_CAPABILITIES.filter(({ key }) => member[key]).length} jog
                        </Badge>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={saving || reason.trim().length < 3}
                            title={reason.trim().length < 3 ? 'Írd meg alul, miért veszed el' : undefined}
                            onClick={() => void mutate(member.user_id, 'remove')}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">
                              {member.display_name || 'Segítő'} eltávolítása
                            </span>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" /> Segítő hozzáadása
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="crew-user-id">A segítő felhasználói azonosítója</Label>
                  <Input
                    id="crew-user-id"
                    value={newUserId}
                    onChange={(event) => setNewUserId(event.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    A profiljának címsorában találod. Csak valódi, regisztrált fiók lehet segítő.
                  </p>
                </div>

                <CapabilityToggles
                  value={newCapabilities}
                  onChange={setNewCapabilities}
                  idPrefix="crew-new"
                  disabled={saving}
                />

                <div>
                  <Label htmlFor="crew-reason">Indoklás</Label>
                  <Input
                    id="crew-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Pl. a helyszíni beléptetést ő intézi"
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Bekerül a naplóba, hogy később is látszódjon, miért kapta meg.
                    Az eltávolításhoz is ezt használjuk.
                  </p>
                </div>

                <Button
                  disabled={!canSubmitNew || saving}
                  onClick={() => void mutate(newUserId.trim(), 'upsert', newCapabilities)}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Jogosultság megadása
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </TabsContent>
  );
}
