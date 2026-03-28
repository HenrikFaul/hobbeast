import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Users, MessageSquare, ClipboardList, Search, Download, CheckCircle, XCircle, Clock, UserX, UserCheck, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ParticipantStatus = 'going' | 'waitlist' | 'checked_in' | 'cancelled' | 'no_show';

interface Participant {
  id: string;
  user_id: string;
  status: string;
  joined_at: string;
  checked_in_at: string | null;
  organizer_note: string | null;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface EventInfo {
  id: string;
  title: string;
  max_attendees: number | null;
  event_date: string | null;
  event_time: string | null;
  waitlist_enabled: boolean | null;
  created_by: string;
}

interface AuditEntry {
  id: string;
  action: string;
  created_at: string;
  metadata: any;
  target_user_id: string | null;
}

interface OrganizerMessage {
  id: string;
  subject: string | null;
  body: string;
  message_type: string;
  audience_filter: string;
  delivery_state: string;
  created_at: string;
}

const STATUS_LABELS: Record<ParticipantStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  going: { label: 'Résztvevő', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: UserCheck },
  waitlist: { label: 'Várólistán', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
  checked_in: { label: 'Bejelentkezett', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle },
  cancelled: { label: 'Lemondta', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
  no_show: { label: 'Nem jelent meg', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: UserX },
};

const VALID_TRANSITIONS: Record<string, ParticipantStatus[]> = {
  going: ['checked_in', 'cancelled', 'no_show'],
  waitlist: ['going', 'cancelled'],
  checked_in: ['no_show'],
  cancelled: ['going', 'waitlist'],
  no_show: [],
};

export default function OrganizerDashboard() {
  const { id: eventId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [messages, setMessages] = useState<OrganizerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [drawerNote, setDrawerNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Message compose
  const [msgBody, setMsgBody] = useState('');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgAudience, setMsgAudience] = useState('all');
  const [sendingMsg, setSendingMsg] = useState(false);

  useEffect(() => {
    if (!eventId || !user) return;
    fetchAll();
  }, [eventId, user]);

  const fetchAll = async () => {
    if (!eventId || !user) return;
    setLoading(true);

    // Fetch event
    const { data: ev } = await supabase.from('events').select('id, title, max_attendees, event_date, event_time, waitlist_enabled, created_by').eq('id', eventId).single();
    if (!ev || ev.created_by !== user.id) {
      toast.error('Nincs jogosultságod ehhez az eseményhez.');
      navigate('/events');
      return;
    }
    setEvent(ev);

    // Fetch participants with profiles
    const { data: parts } = await supabase
      .from('event_participants')
      .select('id, user_id, status, joined_at, checked_in_at, organizer_note')
      .eq('event_id', eventId)
      .order('joined_at', { ascending: true });

    if (parts) {
      // Fetch profiles for participants
      const userIds = parts.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      setParticipants(parts.map(p => ({
        ...p,
        profile: profileMap.get(p.user_id) ? {
          display_name: profileMap.get(p.user_id)!.display_name,
          avatar_url: profileMap.get(p.user_id)!.avatar_url,
        } : undefined,
      })));
    }

    // Fetch audit log
    const { data: audit } = await supabase
      .from('organizer_audit_log')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(50);
    setAuditLog(audit || []);

    // Fetch messages
    const { data: msgs } = await supabase
      .from('organizer_messages')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    setMessages(msgs || []);

    setLoading(false);
  };

  const logAuditAction = async (action: string, targetUserId?: string | null, metadata?: any) => {
    if (!eventId || !user) return;
    await supabase.from('organizer_audit_log').insert({
      event_id: eventId,
      actor_user_id: user.id,
      action,
      target_user_id: targetUserId || null,
      metadata: metadata || {},
    });
  };

  const changeStatus = async (participantId: string, userId: string, currentStatus: string, newStatus: ParticipantStatus) => {
    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      toast.error(`Nem lehet ${STATUS_LABELS[currentStatus as ParticipantStatus]?.label} → ${STATUS_LABELS[newStatus].label} váltást csinálni.`);
      return;
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'checked_in') updateData.checked_in_at = new Date().toISOString();

    const { error } = await supabase
      .from('event_participants')
      .update(updateData)
      .eq('id', participantId);

    if (error) {
      toast.error('Hiba a státusz módosításakor.');
      return;
    }

    await logAuditAction(`status_change:${currentStatus}→${newStatus}`, userId, { from: currentStatus, to: newStatus });
    toast.success(`Státusz módosítva: ${STATUS_LABELS[newStatus].label}`);

    // If someone moved from waitlist to going, check if there's room
    if (newStatus === 'going' && currentStatus === 'waitlist') {
      // Auto-promote logic could go here
    }

    fetchAll();
  };

  const saveNote = async () => {
    if (!selectedParticipant) return;
    setSavingNote(true);
    const { error } = await supabase
      .from('event_participants')
      .update({ organizer_note: drawerNote || null })
      .eq('id', selectedParticipant.id);
    if (error) toast.error('Hiba a jegyzet mentésekor.');
    else {
      toast.success('Jegyzet mentve.');
      await logAuditAction('note_updated', selectedParticipant.user_id);
      fetchAll();
    }
    setSavingNote(false);
  };

  const sendMessage = async () => {
    if (!eventId || !msgBody.trim()) return;
    setSendingMsg(true);
    const { error } = await supabase.from('organizer_messages').insert({
      event_id: eventId,
      subject: msgSubject.trim() || null,
      body: msgBody.trim(),
      audience_filter: msgAudience,
      delivery_state: 'sent',
      message_type: 'custom_message',
    });
    if (error) {
      toast.error('Hiba az üzenet küldésekor.');
    } else {
      toast.success('Üzenet elmentve!');
      await logAuditAction('message_sent', null, { audience: msgAudience, subject: msgSubject });
      setMsgBody('');
      setMsgSubject('');
      fetchAll();
    }
    setSendingMsg(false);
  };

  const exportCSV = () => {
    const rows = [['Név', 'Státusz', 'Csatlakozott', 'Bejelentkezve', 'Jegyzet']];
    for (const p of filteredParticipants) {
      rows.push([
        p.profile?.display_name || p.user_id,
        STATUS_LABELS[p.status as ParticipantStatus]?.label || p.status,
        new Date(p.joined_at).toLocaleDateString('hu-HU'),
        p.checked_in_at ? new Date(p.checked_in_at).toLocaleDateString('hu-HU') : '',
        p.organizer_note || '',
      ]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredParticipants = participants.filter(p => {
    const matchSearch = !search || (p.profile?.display_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = participants.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const goingCount = (statusCounts['going'] || 0) + (statusCounts['checked_in'] || 0);

  if (loading) {
    return (
      <main className="pt-24 pb-16 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </main>
    );
  }

  if (!event) return null;

  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/events/${eventId}`)} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-xl font-bold">Szervezői műszerfal</h1>
            <p className="text-sm text-muted-foreground">{event.title}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{goingCount}</p>
              <p className="text-xs text-muted-foreground">Résztvevők{event.max_attendees ? ` / ${event.max_attendees}` : ''}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{statusCounts['waitlist'] || 0}</p>
              <p className="text-xs text-muted-foreground">Várólistán</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{statusCounts['checked_in'] || 0}</p>
              <p className="text-xs text-muted-foreground">Bejelentkezve</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{(statusCounts['cancelled'] || 0) + (statusCounts['no_show'] || 0)}</p>
              <p className="text-xs text-muted-foreground">Lemondva / Nem jelent meg</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="attendees" className="space-y-4">
          <TabsList className="rounded-xl">
            <TabsTrigger value="attendees" className="rounded-lg gap-1"><Users className="h-4 w-4" /> Résztvevők</TabsTrigger>
            <TabsTrigger value="messages" className="rounded-lg gap-1"><MessageSquare className="h-4 w-4" /> Üzenetek</TabsTrigger>
            <TabsTrigger value="audit" className="rounded-lg gap-1"><ClipboardList className="h-4 w-4" /> Napló</TabsTrigger>
          </TabsList>

          {/* ── Attendees Tab ── */}
          <TabsContent value="attendees" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Keresés név alapján..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg">Minden státusz</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="rounded-lg">{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="rounded-xl" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </div>

            <div className="space-y-2">
              {filteredParticipants.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nincs találat.</p>
              )}
              {filteredParticipants.map(p => {
                const statusInfo = STATUS_LABELS[p.status as ParticipantStatus] || STATUS_LABELS.going;
                const StatusIcon = statusInfo.icon;
                const transitions = VALID_TRANSITIONS[p.status] || [];

                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.profile?.display_name || 'Névtelen'}</p>
                      <p className="text-xs text-muted-foreground">
                        Csatlakozott: {new Date(p.joined_at).toLocaleDateString('hu-HU')}
                      </p>
                    </div>

                    <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                      <StatusIcon className="h-3 w-3 mr-1" /> {statusInfo.label}
                    </Badge>

                    <div className="flex gap-1">
                      {transitions.map(t => (
                        <Button
                          key={t}
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2 rounded-lg"
                          onClick={() => changeStatus(p.id, p.user_id, p.status, t)}
                          title={STATUS_LABELS[t].label}
                        >
                          {React.createElement(STATUS_LABELS[t].icon, { className: 'h-3.5 w-3.5' })}
                        </Button>
                      ))}
                    </div>

                    <Button size="sm" variant="outline" className="rounded-lg text-xs"
                      onClick={() => { setSelectedParticipant(p); setDrawerNote(p.organizer_note || ''); }}>
                      Jegyzet
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Messages Tab ── */}
          <TabsContent value="messages" className="space-y-4">
            <Card className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base">Új üzenet küldése</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={msgSubject} onChange={e => setMsgSubject(e.target.value)} placeholder="Tárgy (opcionális)" className="rounded-xl" />
                <Textarea value={msgBody} onChange={e => setMsgBody(e.target.value)} placeholder="Üzenet szövege..." className="rounded-xl" rows={4} />
                <div className="flex gap-3 items-center">
                  <Select value={msgAudience} onValueChange={setMsgAudience}>
                    <SelectTrigger className="w-48 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all" className="rounded-lg">Minden résztvevő</SelectItem>
                      <SelectItem value="going" className="rounded-lg">Csak going</SelectItem>
                      <SelectItem value="waitlist" className="rounded-lg">Csak várólistán</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="gradient-primary text-primary-foreground border-0 rounded-xl" onClick={sendMessage} disabled={sendingMsg || !msgBody.trim()}>
                    <Send className="h-4 w-4 mr-1" /> {sendingMsg ? 'Küldés...' : 'Küldés'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Üzenet előzmények</h3>
              {messages.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Még nincs üzenet.</p>}
              {messages.map(m => (
                <Card key={m.id} className="rounded-xl">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm">{m.subject || '(Nincs tárgy)'}</p>
                      <Badge variant="outline" className="text-xs">{m.audience_filter}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{m.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">{new Date(m.created_at).toLocaleString('hu-HU')}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Audit Tab ── */}
          <TabsContent value="audit" className="space-y-2">
            {auditLog.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Még nincs naplóbejegyzés.</p>}
            {auditLog.map(a => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card text-sm">
                <ClipboardList className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{a.action}</p>
                  {a.metadata && Object.keys(a.metadata).length > 0 && (
                    <p className="text-xs text-muted-foreground">{JSON.stringify(a.metadata)}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {new Date(a.created_at).toLocaleString('hu-HU')}
                </span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* Participant Drawer */}
      <Sheet open={!!selectedParticipant} onOpenChange={(open) => { if (!open) setSelectedParticipant(null); }}>
        <SheetContent className="w-96">
          <SheetHeader>
            <SheetTitle>{selectedParticipant?.profile?.display_name || 'Résztvevő'}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Státusz</p>
              <Badge variant="outline" className={STATUS_LABELS[selectedParticipant?.status as ParticipantStatus]?.color || ''}>
                {STATUS_LABELS[selectedParticipant?.status as ParticipantStatus]?.label || selectedParticipant?.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Csatlakozott</p>
              <p className="text-sm">{selectedParticipant ? new Date(selectedParticipant.joined_at).toLocaleString('hu-HU') : ''}</p>
            </div>
            {selectedParticipant?.checked_in_at && (
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Bejelentkezve</p>
                <p className="text-sm">{new Date(selectedParticipant.checked_in_at).toLocaleString('hu-HU')}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Szervezői jegyzet</p>
              <Textarea
                value={drawerNote}
                onChange={e => setDrawerNote(e.target.value)}
                placeholder="Ide írhatsz jegyzetet erről a résztvevőről..."
                className="rounded-xl"
                rows={4}
              />
              <Button className="mt-2 w-full rounded-xl" size="sm" onClick={saveNote} disabled={savingNote}>
                {savingNote ? 'Mentés...' : 'Jegyzet mentése'}
              </Button>
            </div>

            {/* Audit timeline for this participant */}
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Előzmények</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {auditLog
                  .filter(a => a.target_user_id === selectedParticipant?.user_id)
                  .map(a => (
                    <div key={a.id} className="text-xs p-2 rounded-lg bg-muted/30">
                      <span className="font-medium">{a.action}</span>
                      <span className="text-muted-foreground ml-2">{new Date(a.created_at).toLocaleString('hu-HU')}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
