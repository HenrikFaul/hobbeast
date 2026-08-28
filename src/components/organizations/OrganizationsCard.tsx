import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Loader2, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ASSIGNABLE_ROLES,
  ORG_KIND_LABEL,
  ROLE_LABEL,
  acceptInvite,
  canManage,
  createOrganization,
  inviteMember,
  listMyOrganizations,
  listOrgMembers,
  removeMember,
  setMemberRole,
  type MyOrganization,
  type OrgMember,
} from '@/features/organizations/organizations';

/**
 * "My organizations" — the entry point to the B2B side (Slice O-A).
 *
 * A person can run events under an organization's name, with a team. This lists
 * the organizations they belong to, lets them create one (becoming its owner),
 * accept a pending invite, and — as owner or admin — manage the team. The
 * rules that keep it safe live in the database; this is the surface.
 */

const KINDS = Object.entries(ORG_KIND_LABEL);

function TeamManager({ org }: { org: MyOrganization }) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteId, setInviteId] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const manage = canManage(org.my_role);

  const load = useCallback(async () => {
    setLoading(true);
    setMembers(await listOrgMembers(org.id));
    setLoading(false);
  }, [org.id]);

  useEffect(() => { void load(); }, [load]);

  const invite = async () => {
    setBusy(true);
    const result = await inviteMember(org.id, inviteId, inviteRole);
    setBusy(false);
    if (result.ok === false) { toast.error(result.message); return; }
    setInviteId('');
    toast.success('Meghívó elküldve — a tag elfogadás után lesz aktív.');
    await load();
  };

  const changeRole = async (userId: string, role: string) => {
    const result = await setMemberRole(org.id, userId, role);
    if (result.ok === false) { toast.error(result.message); return; }
    await load();
  };

  const remove = async (userId: string) => {
    const result = await removeMember(org.id, userId);
    if (result.ok === false) { toast.error(result.message); return; }
    await load();
  };

  return (
    <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Csapat betöltése…
        </p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((member) => (
            <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium">{member.display_name || 'Névtelen tag'}</span>
                {member.status === 'invited' && <Badge variant="outline" className="rounded-full text-[10px]">meghívva</Badge>}
              </span>
              {manage && member.role !== 'owner' ? (
                <span className="flex items-center gap-1.5">
                  <select
                    value={member.role}
                    onChange={(e) => void changeRole(member.user_id, e.target.value)}
                    aria-label={`${member.display_name || 'tag'} szerepköre`}
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remove(member.user_id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">{member.display_name || 'tag'} eltávolítása</span>
                  </Button>
                </span>
              ) : (
                <Badge variant="secondary" className="rounded-full text-[10px]">{ROLE_LABEL[member.role]}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {manage && (
        <div className="rounded-lg border border-border/60 p-2.5">
          <Label className="text-xs text-muted-foreground">Tag meghívása (felhasználói azonosítóval)</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Input value={inviteId} onChange={(e) => setInviteId(e.target.value)} placeholder="00000000-0000-…" className="min-w-[12rem] flex-1 font-mono text-xs" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} aria-label="Meghívott szerepköre" className="rounded-md border border-input bg-background px-2 py-1 text-sm">
              {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <Button size="sm" disabled={busy || inviteId.trim().length < 10} onClick={() => void invite()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OrganizationsCard() {
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('company');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setOrgs(await listMyOrganizations());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    const result = await createOrganization(name, kind);
    setBusy(false);
    if (result.ok === false) { toast.error(result.message); return; }
    setName(''); setCreating(false);
    toast.success('Szervezet létrehozva — te vagy a tulajdonos.');
    await load();
  };

  const accept = async (orgId: string) => {
    if (await acceptInvite(orgId)) { toast.success('Meghívó elfogadva.'); await load(); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" aria-hidden="true" /> Szervezeteim
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Hozz létre szervezetet, ha cégként vagy közösségként szervezel — a saját neved
          alatt, csapattal. Az események a szervezet arcát viselik.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Betöltés…
          </p>
        ) : orgs.length === 0 && !creating ? (
          <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-sm text-muted-foreground">
            Még nincs szervezeted. Hozz létre egyet, és profi szervezői eszközöket kapsz.
          </p>
        ) : (
          <ul className="space-y-2">
            {orgs.map((org) => (
              <li key={org.id} className="rounded-xl border border-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((c) => (c === org.id ? null : org.id))}
                    className="flex items-center gap-2 text-left"
                  >
                    <span className="font-medium">{org.name}</span>
                    {org.verification_status === 'verified' && (
                      <ShieldCheck className="h-4 w-4 text-primary" aria-label="Hitelesített szervező" />
                    )}
                    <Badge variant="secondary" className="rounded-full text-[10px]">{ROLE_LABEL[org.my_role]}</Badge>
                    <span className="text-xs text-muted-foreground">{ORG_KIND_LABEL[org.kind] ?? org.kind}</span>
                  </button>
                  {org.member_status === 'invited' && (
                    <Button size="sm" variant="outline" onClick={() => void accept(org.id)}>
                      <Check className="mr-1 h-4 w-4" /> Meghívó elfogadása
                    </Button>
                  )}
                </div>
                {expanded === org.id && org.member_status === 'active' && <TeamManager org={org} />}
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <div>
              <Label htmlFor="org-name">A szervezet neve</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pl. Budapesti Túraklub" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="org-kind">Típus</Label>
              <select id="org-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm">
                {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy || name.trim().length < 2} onClick={() => void create()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Létrehozás
              </Button>
              <Button variant="ghost" onClick={() => { setCreating(false); setName(''); }}>Mégse</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Új szervezet
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
