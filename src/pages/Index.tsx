import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format, eachDayOfInterval, parseISO, isBefore, startOfDay } from 'date-fns';
import { hu } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { clearTempUpgradeSession, readTempUpgradeSession } from '@/lib/tempUpgradeSession';
import { CalendarGrid } from '@/components/CalendarGrid';
import { DayDetailsModal } from '@/components/DayDetailsModal';
import { AvailabilityModeSelector, type AvailabilityMode } from '@/components/AvailabilityModeSelector';
import { BatchVotePanel } from '@/components/BatchVotePanel';
import { VoteRanking } from '@/components/VoteRanking';
import { EventSelector } from '@/components/EventSelector';
import { ProfileMenu } from '@/components/ProfileMenu';
import { TempUserRegisterDialog } from '@/components/TempUserRegisterDialog';

import { EventInfoModal } from '@/components/EventInfoModal';
import { ShareEventDialog } from '@/components/ShareEventDialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Plus, Trash2, Zap, Share2, Info, CalendarDays, Users, UserPlus, Pin, Bell, BellRing } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CreateEventDialog } from '@/components/CreateEventDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type TempRegisterStep = 'choose' | 'register-keep' | 'register-discard';

interface Vote {
  vote_date: string;
  vote_value: string;
  user_id: string;
}

interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Event {
  id: string;
  title: string;
  is_active: boolean;
  deadline: string | null;
  created_by: string;
  month: number;
  year: number;
  start_date: string;
  end_date: string;
  default_vote: string | null;
  decided_date: string | null;
  options: any;
  allow_participant_sharing?: boolean;
  category?: string | null;
  description?: string | null;
}

interface EventNotification {
  id: string;
  eventId: string;
  eventTitle: string;
  action: 'pin_created' | 'pin_updated';
  pinnedDate: string;
  createdAt: string;
  unread: boolean;
  message: string;
}

const parseProfilePreferences = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
};

const parseNotifications = (value: unknown): EventNotification[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is EventNotification => {
    return !!item && typeof item === 'object' && typeof (item as any).id === 'string';
  });
};

const getFormattedPinnedDate = (dateStr: string) => format(parseISO(dateStr), 'yyyy.MM.dd.', { locale: hu });


function getEventStatus(event: Event): 'active' | 'inactive' | 'expired' {
  if (!event.is_active) return 'inactive';
  if (event.deadline && new Date(event.deadline) < new Date()) return 'expired';
  return 'active';
}

function getPreferredEvent(events: Event[]) {
  const active = events
    .filter((event) => getEventStatus(event) === 'active')
    .sort((a, b) => a.title.localeCompare(b.title, 'hu'));
  const fallback = events
    .filter((event) => getEventStatus(event) !== 'active')
    .sort((a, b) => a.title.localeCompare(b.title, 'hu'));

  return active[0] || fallback[0] || null;
}

const Index = () => {
  const { user, isTemporary, linkedEventId, signOut, setSessionFromTokens, refreshTempStatus } = useAuth();
  const isTemporarySession =
    isTemporary ||
    (user?.user_metadata as Record<string, unknown> | undefined)?.is_temporary === true ||
    user?.email?.endsWith('@temp.syncfolk.local') === true;
  const [showTempRegister, setShowTempRegister] = useState(false);
  const [tempRegisterInitialStep, setTempRegisterInitialStep] = useState<TempRegisterStep>('choose');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [detailsDate, setDetailsDate] = useState<Date | null>(null);
  const [activeVoteMode, setActiveVoteMode] = useState<AvailabilityMode>('good');
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(searchParams.get('event'));
  const [initialEventApplied, setInitialEventApplied] = useState(false);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  
  const [showEventInfo, setShowEventInfo] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<EventNotification[]>([]);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogDates, setPinDialogDates] = useState<string[]>([]);
  const [pinCandidateDate, setPinCandidateDate] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const tempLogoutTriggeredRef = useRef(false);
  const tempGoogleUpgradeHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const eventFromUrl = searchParams.get('event');
    if (eventFromUrl && !initialEventApplied) {
      setSelectedEventId(eventFromUrl);
      setInitialEventApplied(true);
    }
  }, [searchParams, initialEventApplied]);


  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle();

    const preferences = parseProfilePreferences(data?.preferences);
    const parsedNotifications = parseNotifications(preferences.notifications);
      
    setNotifications(
      [...parsedNotifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );
  }, [user]);

  const markNotificationsRead = useCallback(async () => {
    if (!user || notifications.length === 0 || !notifications.some((item) => item.unread)) return;

    const nextNotifications = notifications.map((item) => ({ ...item, unread: false }));
    setNotifications(nextNotifications);

    const { data } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle();

    const preferences = parseProfilePreferences(data?.preferences);
    await supabase
      .from('profiles')
      .update({ preferences: { ...preferences, notifications: nextNotifications } as any })
      .eq('user_id', user.id);
  }, [user, notifications]);

  const pushPinnedDayNotifications = useCallback(async (event: Event, pinnedDate: string, action: 'pin_created' | 'pin_updated') => {
    const { data: participants } = await supabase
      .from('event_participants')
      .select('user_id')
      .eq('event_id', event.id);

    const recipientIds = Array.from(new Set([event.created_by, ...(participants || []).map((item) => item.user_id)]));
    if (recipientIds.length === 0) return;

    const { data: recipientProfiles } = await supabase
      .from('profiles')
      .select('user_id, preferences')
      .in('user_id', recipientIds);

    const now = new Date().toISOString();
    const message = action === 'pin_created'
      ? `${event.title} — Nap kitűzve: ${getFormattedPinnedDate(pinnedDate)}`
      : `${event.title} — Kitűzött nap módosítva: ${getFormattedPinnedDate(pinnedDate)}`;

    await Promise.all((recipientProfiles || []).map(async (profile: any) => {
      const preferences = parseProfilePreferences(profile.preferences);
      const currentNotifications = parseNotifications(preferences.notifications);
      const nextNotifications: EventNotification[] = [
        {
          id: `${event.id}:${pinnedDate}:${now}:${profile.user_id}`,
          eventId: event.id,
          eventTitle: event.title,
          action,
          pinnedDate,
          createdAt: now,
          unread: true,
          message,
        },
        ...currentNotifications,
      ].slice(0, 30);

      await supabase
        .from('profiles')
        .update({ preferences: { ...preferences, notifications: nextNotifications } as any })
        .eq('user_id', profile.user_id);
    }));

    if (recipientIds.includes(user?.id || '')) {
      fetchNotifications();
    }
  }, [fetchNotifications, user]);

  const fetchEvents = useCallback(async () => {

    if (!user) {
      setEvents([]);
      setSelectedEventId(null);
      return;
    }

    // Temp users: only show linked event
    if (isTemporarySession) {
      if (!linkedEventId) {
        setEvents([]);
        setSelectedEventId(null);
        return;
      }

      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', linkedEventId);

      const evts = (data || []) as Event[];

      if (evts.length === 0) {
        setEvents([]);
        setSelectedEventId(null);

        if (!tempLogoutTriggeredRef.current) {
          tempLogoutTriggeredRef.current = true;
          toast.error('A hozzád tartozó eseménynaptár már nem elérhető, kijelentkeztettünk.');
          await signOut();
        }
        return;
      }

      tempLogoutTriggeredRef.current = false;
      setEvents(evts);
      setSelectedEventId(evts[0]?.id || null);
      return;
    }

    tempLogoutTriggeredRef.current = false;

    const { data: createdEvents } = await supabase
      .from('events')
      .select('*')
      .eq('created_by', user.id);

    const { data: participations } = await supabase
      .from('event_participants')
      .select('event_id')
      .eq('user_id', user.id);

    const participatedEventIds = participations?.map(p => p.event_id) || [];

    let participatedEvents: Event[] = [];
    if (participatedEventIds.length > 0) {
      const { data } = await supabase
        .from('events')
        .select('*')
        .in('id', participatedEventIds);
      participatedEvents = (data || []) as Event[];
    }

    const allEvents = [...(createdEvents || []), ...participatedEvents] as Event[];
    const uniqueEvents = allEvents.filter(
      (event, index, self) => index === self.findIndex(e => e.id === event.id)
    );

    setEvents(uniqueEvents);
    setSelectedEventId((currentSelectedEventId) => {
      if (currentSelectedEventId && uniqueEvents.some(event => event.id === currentSelectedEventId)) {
        return currentSelectedEventId;
      }

      return getPreferredEvent(uniqueEvents)?.id || null;
    });
  }, [user, isTemporarySession, linkedEventId, signOut]);


  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (notificationsOpen) {
      markNotificationsRead();
    }
  }, [notificationsOpen, markNotificationsRead]);

  useEffect(() => {
    const upgradeNonce = searchParams.get('temp_upgrade_nonce');
    const tempUpgradeUserId = searchParams.get('temp_upgrade_user');

    if (!upgradeNonce || !tempUpgradeUserId || !user) return;

    const upgradeKey = `${upgradeNonce}:${tempUpgradeUserId}`;
    if (tempGoogleUpgradeHandledRef.current === upgradeKey) return;
    tempGoogleUpgradeHandledRef.current = upgradeKey;

    const finalizeGoogleUpgrade = async () => {
      const { data, error } = await supabase.functions.invoke('join-event', {
        body: {
          action: 'finalize-temp-google-upgrade',
          upgrade_nonce: upgradeNonce,
          temp_user_id: tempUpgradeUserId,
        },
      });

      const params = new URLSearchParams(searchParams);
      params.delete('temp_upgrade_nonce');
      params.delete('temp_upgrade_user');
      navigate(`/${params.toString() ? `?${params.toString()}` : ''}`, { replace: true });

      let resolvedErrorMessage = '';
      let resolvedErrorCode = '';

      if (error || data?.error) {
        resolvedErrorMessage = data?.error || 'A Google-regisztráció nem sikerült, kérlek próbáld újra.';
        resolvedErrorCode = data?.error_code || '';

        const invokeError = error as { context?: Response } | null;
        if (invokeError?.context) {
          try {
            const payload = await invokeError.context.clone().json();
            if (typeof payload?.error === 'string' && payload.error.trim().length > 0) {
              resolvedErrorMessage = payload.error;
            }
            if (typeof payload?.error_code === 'string' && payload.error_code.trim().length > 0) {
              resolvedErrorCode = payload.error_code;
            }
          } catch {
            // fallback stays
          }
        }
      }

      if (resolvedErrorMessage) {
        if (resolvedErrorCode === 'google_account_exists') {
          const tempSession = readTempUpgradeSession();
          if (tempSession && tempSession.tempUserId === tempUpgradeUserId) {
            try {
              await setSessionFromTokens(tempSession.accessToken, tempSession.refreshToken);
              await refreshTempStatus();
              clearTempUpgradeSession();
              setTempRegisterInitialStep('register-keep');
              setShowTempRegister(true);
            } catch {
              await signOut();
            }
          }
          toast.error('Ez a Google-fiók már foglalt. Válassz másik Google-fiókot az adatmigráláshoz.');
        } else {
          toast.error(resolvedErrorMessage);
        }
        return;
      }

      if (data?.success && data?.verification_required) {
        clearTempUpgradeSession();
        await signOut();
        toast.success(`Aktivációs linket küldtünk a(z) ${data?.email || 'megadott'} e-mail címre. Aktiválás után tudsz belépni.`);
        navigate('/auth', { replace: true });
        return;
      }

      clearTempUpgradeSession();
      toast.success('Sikeres regisztráció Google fiókkal, az adataidat átvettük.');
      await fetchEvents();
    };

    finalizeGoogleUpgrade();
  }, [user, searchParams, navigate, fetchEvents, refreshTempStatus, setSessionFromTokens, signOut]);

  useEffect(() => {
    if (!user) return;

    const refreshInterval = window.setInterval(() => {
      fetchEvents();
    }, 4000);

    return () => window.clearInterval(refreshInterval);
  }, [user, fetchEvents]);

  useEffect(() => {
    if (!selectedEventId) {
      setVotes([]);
      setProfiles([]);
      setSelectedDate(null);
      setDetailsDate(null);
    }
  }, [selectedEventId]);

  // Set calendar month when event changes (only on explicit event switch)
  const [prevEventId, setPrevEventId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedEventId && selectedEventId !== prevEventId) {
      setPrevEventId(selectedEventId);
      const ev = events.find(e => e.id === selectedEventId);
      if (ev?.start_date) {
        const evStart = parseISO(ev.start_date);
        const today = new Date();
        if (isBefore(evStart, startOfDay(today))) {
          setCurrentMonth(today);
        } else {
          setCurrentMonth(evStart);
        }
      }
    }
  }, [selectedEventId, events, prevEventId]);

  const fetchVotesAndProfiles = useCallback(async () => {
    if (!selectedEventId) {
      setVotes([]);
      setProfiles([]);
      return;
    }

    const { data: votesData } = await supabase
      .from('votes')
      .select('vote_date, vote_value, user_id')
      .eq('event_id', selectedEventId);
    setVotes((votesData || []) as Vote[]);

    const { data: participants } = await supabase
      .from('event_participants')
      .select('user_id')
      .eq('event_id', selectedEventId);

    const userIds = [...new Set([
      ...(participants || []).map(p => p.user_id),
      ...(votesData || []).map(v => v.user_id),
    ])];

    if (userIds.length === 0) {
      setProfiles([]);
      return;
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds);

    setProfiles((profilesData || []) as Profile[]);
  }, [selectedEventId]);

  useEffect(() => {
    fetchVotesAndProfiles();
  }, [fetchVotesAndProfiles]);

  useEffect(() => {
    if (!selectedEventId) return;

    const votesRefreshInterval = window.setInterval(() => {
      fetchVotesAndProfiles();
    }, 4000);

    return () => window.clearInterval(votesRefreshInterval);
  }, [selectedEventId, fetchVotesAndProfiles]);

  const selectedEvent = events.find(e => e.id === selectedEventId);

  useEffect(() => {
    if (!selectedEventId || selectedEvent) return;
    setSelectedEventId(getPreferredEvent(events)?.id || null);
  }, [events, selectedEvent, selectedEventId]);

  const isDeadlinePassed = selectedEvent?.deadline
    ? new Date(selectedEvent.deadline) < new Date()
    : false;
  const isCreator = selectedEvent?.created_by === user?.id;
  const canShare = isCreator || selectedEvent?.allow_participant_sharing;
  const isEventInactive = selectedEvent?.is_active === false;
  const canVote = !isDeadlinePassed && !isEventInactive;
  const currentUserVoteMap = useMemo<Record<string, AvailabilityMode>>(() => {
    if (!user) return {};

    const map: Record<string, AvailabilityMode> = {};
    votes.forEach((vote) => {
      if (vote.user_id === user.id) {
        map[vote.vote_date] = vote.vote_value as AvailabilityMode;
      }
    });

    return map;
  }, [votes, user]);


  const handleVote = useCallback(async (date: Date, value: string) => {
    if (!user || !selectedEventId) return;
    // Block voting on past dates
    if (isBefore(startOfDay(date), startOfDay(new Date()))) {
      toast.error('Múltbeli napra nem lehet szavazni.');
      return;
    }
    const dateStr = format(date, 'yyyy-MM-dd');

    const { error } = await supabase
      .from('votes')
      .upsert(
        { event_id: selectedEventId, user_id: user.id, vote_date: dateStr, vote_value: value },
        { onConflict: 'event_id,user_id,vote_date' }
      );

    if (error) {
      toast.error('Hiba történt a szavazás során.');
      return;
    }

    const { data: votesData } = await supabase
      .from('votes')
      .select('vote_date, vote_value, user_id')
      .eq('event_id', selectedEventId);
    setVotes((votesData || []) as Vote[]);
  }, [user, selectedEventId]);

  const handleRemoveVote = useCallback(async (date: Date) => {
    if (!user || !selectedEventId) return;
    const dateStr = format(date, 'yyyy-MM-dd');

    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('event_id', selectedEventId)
      .eq('user_id', user.id)
      .eq('vote_date', dateStr);

    if (error) {
      toast.error('Hiba történt a szavazat eltávolítása során.');
      return;
    }

    const { data: votesData } = await supabase
      .from('votes')
      .select('vote_date, vote_value, user_id')
      .eq('event_id', selectedEventId);
    setVotes((votesData || []) as Vote[]);
    toast.success('Szavazat eltávolítva!');
  }, [user, selectedEventId]);

  const handleCalendarDayInteraction = useCallback(async (date: Date, interaction: 'click' | 'drag') => {
    if (!user || !selectedEventId || !canVote) return;

    setSelectedDate(date);

    const dateStr = format(date, 'yyyy-MM-dd');
    const existingVote = currentUserVoteMap[dateStr];

    if (interaction === 'click' && existingVote === activeVoteMode) {
      await handleRemoveVote(date);
      return;
    }

    if (existingVote !== activeVoteMode) {
      await handleVote(date, activeVoteMode);
    }
  }, [user, selectedEventId, canVote, currentUserVoteMap, activeVoteMode, handleRemoveVote, handleVote]);

  const handleOpenDayDetails = useCallback((date: Date) => {
    setSelectedDate(date);
    setDetailsDate(date);
  }, []);

  const handleBatchVote = useCallback(async (startDate: Date, endDate: Date, value: string) => {
    if (!user || !selectedEventId) return;
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const votesToUpsert = days
      .filter(day => !isBefore(startOfDay(day), startOfDay(new Date())))
      .map(day => ({
        event_id: selectedEventId,
        user_id: user.id,
        vote_date: format(day, 'yyyy-MM-dd'),
        vote_value: value,
      }));

    if (votesToUpsert.length === 0) {
      toast.error('Nincs szavazható (jövőbeli) nap a kiválasztott intervallumban.');
      return;
    }

    const { error } = await supabase.from('votes').upsert(votesToUpsert, {
      onConflict: 'event_id,user_id,vote_date',
    });

    if (error) {
      toast.error('Hiba történt a batch szavazás során.');
      return;
    }

    const { data: votesData } = await supabase
      .from('votes')
      .select('vote_date, vote_value, user_id')
      .eq('event_id', selectedEventId);
    setVotes((votesData || []) as Vote[]);
  }, [user, selectedEventId]);

  const handleDeleteVotesInRange = useCallback(async (startDate: Date, endDate: Date) => {
    if (!user || !selectedEventId) return;
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('event_id', selectedEventId)
      .eq('user_id', user.id)
      .gte('vote_date', startDateStr)
      .lte('vote_date', endDateStr);

    if (error) {
      toast.error('Hiba történt az intervallum törlése során.');
      return;
    }

    const { data: votesData } = await supabase
      .from('votes')
      .select('vote_date, vote_value, user_id')
      .eq('event_id', selectedEventId);
    setVotes((votesData || []) as Vote[]);
  }, [user, selectedEventId]);

  const handleDeleteAllVotes = useCallback(async () => {
    if (!user || !selectedEventId) return;
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('event_id', selectedEventId)
      .eq('user_id', user.id);

    if (error) {
      toast.error('Hiba történt a törlés során.');
      return;
    }

    const { data: votesData } = await supabase
      .from('votes')
      .select('vote_date, vote_value, user_id')
      .eq('event_id', selectedEventId);
    setVotes((votesData || []) as Vote[]);
    toast.success('Összes szavazatod törölve!');
  }, [user, selectedEventId]);

  const handleEventUpdated = useCallback(async () => {
    if (!selectedEventId) return;
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('id', selectedEventId)
      .single();
    if (data) {
      setEvents(prev => prev.map(e => e.id === selectedEventId ? (data as Event) : e));
    }
    // Also refresh votes
    const { data: votesData } = await supabase
      .from('votes')
      .select('vote_date, vote_value, user_id')
      .eq('event_id', selectedEventId);
    setVotes((votesData || []) as Vote[]);
  }, [selectedEventId]);

  const rankings = useMemo(() => {
    if (!selectedEventId || !selectedEvent) return [];
    const today = startOfDay(new Date());
    const evStart = selectedEvent.start_date ? startOfDay(parseISO(selectedEvent.start_date)) : null;
    const evEnd = selectedEvent.end_date ? startOfDay(parseISO(selectedEvent.end_date)) : null;

    const dateMap: Record<string, { good: number; maybe: number; bad: number }> = {};

    votes.forEach(v => {
      const vDate = startOfDay(parseISO(v.vote_date));
      // Skip dates outside event range
      if (evStart && vDate < evStart) return;
      if (evEnd && vDate > evEnd) return;
      // Skip past dates
      if (vDate < today) return;

      if (!dateMap[v.vote_date]) dateMap[v.vote_date] = { good: 0, maybe: 0, bad: 0 };
      if (v.vote_value === 'good') dateMap[v.vote_date].good++;
      else if (v.vote_value === 'maybe') dateMap[v.vote_date].maybe++;
      else dateMap[v.vote_date].bad++;
    });

    return Object.entries(dateMap)
      .filter(([, counts]) => counts.good > 0 || counts.maybe > 0)
      .map(([date, counts]) => ({
        date,
        dateFormatted: format(new Date(date), 'yyyy.MM.dd.'),
        ...counts,
        score: counts.good * 3 + counts.maybe,
      }));
  }, [votes, selectedEventId, selectedEvent]);


  const sortedRankings = useMemo(
    () => [...rankings].sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)),
    [rankings]
  );

  const topRankedDates = useMemo(() => {
    if (sortedRankings.length === 0) return [] as string[];
    const topScore = sortedRankings[0].score;
    return sortedRankings.filter((item) => item.score === topScore).map((item) => item.date);
  }, [sortedRankings]);

  const openPinDialog = useCallback(() => {
    if (!selectedEvent || !isCreator || topRankedDates.length === 0) return;
    const defaultDate = selectedEvent.decided_date && topRankedDates.includes(selectedEvent.decided_date)
      ? selectedEvent.decided_date
      : [...topRankedDates].sort((a, b) => a.localeCompare(b))[0];

    setPinDialogDates(topRankedDates);
    setPinCandidateDate(defaultDate || null);
    setPinDialogOpen(true);
  }, [selectedEvent, isCreator, topRankedDates]);

  const handleSavePinnedDate = useCallback(async () => {
    if (!selectedEvent || !selectedEventId || !pinCandidateDate || !isCreator) return;
    setPinSaving(true);

    const action: 'pin_created' | 'pin_updated' = selectedEvent.decided_date ? 'pin_updated' : 'pin_created';

    const { error } = await supabase
      .from('events')
      .update({ decided_date: pinCandidateDate, updated_at: new Date().toISOString() })
      .eq('id', selectedEventId);

    if (error) {
      toast.error('Nem sikerült menteni a kitűzött napot.');
      setPinSaving(false);
      return;
    }

    const updatedEvent: Event = { ...selectedEvent, decided_date: pinCandidateDate };
    setEvents((prev) => prev.map((item) => (item.id === selectedEventId ? updatedEvent : item)));
    setPinDialogOpen(false);
    setPinSaving(false);

    await pushPinnedDayNotifications(updatedEvent, pinCandidateDate, action);

    toast.success(
      action === 'pin_created'
        ? `Nap kitűzve: ${getFormattedPinnedDate(pinCandidateDate)}`
        : `Kitűzött nap módosítva: ${getFormattedPinnedDate(pinCandidateDate)}`
    );
  }, [selectedEvent, selectedEventId, pinCandidateDate, isCreator, pushPinnedDayNotifications]);

  const unreadNotifications = notifications.filter((item) => item.unread).length;

  return (

    <div className="relative flex min-h-screen flex-col pb-safe">
      {/* Background image */}
      <div className="fixed inset-0 -z-10">
        <img src="/images/bg-hero.jpg" alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-background/85 dark:bg-background/92" />
      </div>
      {/* Header */}
      <header className="sticky top-0 z-40 glass-strong border-b w-full">
        <div className="flex items-center px-4 py-3 lg:px-0 w-full">
          {/* Left section - mirrors sidebar width on lg */}
          <div className="flex items-center gap-3 lg:w-96 lg:shrink-0 lg:border-r lg:px-5">
            <img src="/syncfolk-logo.png" alt="Syncfolk" className="h-8 w-8 rounded-lg" />
            <span className="font-display text-lg font-bold hidden sm:inline">Syncfolk</span>
          </div>

          {/* Center section - aligned with calendar */}
          <div className="flex flex-1 items-center justify-between lg:px-6">
            {isTemporarySession ? (
              <button
                onClick={() => {
                  setTempRegisterInitialStep('choose');
                  setShowTempRegister(true);
                }}
                className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Tetszik az oldal? Regisztrálj!</span>
                <span className="sm:hidden">Regisztráció</span>
              </button>
            ) : (
              <button
                onClick={() => setShowCreateEvent(true)}
                className="gradient-primary text-primary-foreground font-semibold text-sm px-5 py-2 rounded-full shadow-glow hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Plus className="inline-block mr-1.5 h-4 w-4 -mt-0.5" />
                Eseménynaptár létrehozás
              </button>
            )}
            {!isTemporarySession && (
              <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <Button variant="ghost" size="icon" className="relative rounded-xl" onClick={() => setNotificationsOpen(true)}>
                  {unreadNotifications > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                  {unreadNotifications > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </Button>
                <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden rounded-2xl p-0">
                  <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>Értesítések</DialogTitle>
                    <DialogDescription>Nap kitűzésekről és módosításokról.</DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
                    {notifications.length === 0 ? (
                      <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                        Még nincs értesítésed.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notifications.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setNotificationsOpen(false);
                              if (events.some((event) => event.id === item.eventId)) {
                                setSelectedEventId(item.eventId);
                              }
                            }}
                            className="w-full rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-secondary"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold">{item.eventTitle}</div>
                                <div className="mt-1 text-sm text-muted-foreground">{item.message}</div>
                              </div>
                              {item.unread && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {format(new Date(item.createdAt), 'yyyy.MM.dd. HH:mm')}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <ProfileMenu showLabel />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left sidebar - Vote ranking (narrow) */}
        {selectedEvent && (
          <aside className="hidden w-96 shrink-0 border-r px-4 pb-4 lg:block overflow-y-auto">
            <div className="sticky top-0 pt-4">
              <VoteRanking rankings={rankings} onDayClick={(dateStr) => handleOpenDayDetails(new Date(dateStr))} />
            </div>
          </aside>
        )}

        {/* Main content - Calendar centered and large */}
        <main className="flex-1 overflow-y-auto p-3 lg:p-4">
          {selectedEvent ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mx-auto max-w-4xl space-y-2"
            >
              {/* Inactive banner */}
              {isEventInactive && (
                <div className="rounded-2xl border border-muted bg-muted/50 p-3 text-center text-sm font-medium text-muted-foreground">
                  Ez az eseménynaptár inaktív. Szavazás nem lehetséges.
                </div>
              )}

              {/* Event toolbar */}
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-3 shadow-card sm:px-4">
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <EventSelector
                    events={events}
                    selectedEventId={selectedEventId}
                    onSelect={setSelectedEventId}
                    disabled={isTemporarySession}
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setShowEventInfo(true)} title="Eseménynaptár adatai" className="rounded-xl">
                    <Info className="h-4 w-4" />
                  </Button>
                  {isCreator && !isTemporarySession && (
                    <Button variant="ghost" size="icon" onClick={() => setShowShareDialog(true)} title="Megosztás" className="rounded-xl">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                  {canVote && (
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-xl lg:hidden" title="Batch kitöltés">
                          <Zap className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="w-[320px] sm:w-[380px]">
                        <SheetHeader>
                          <SheetTitle className="font-display">Batch kitöltés</SheetTitle>
                        </SheetHeader>
                        <div className="mt-4">
                          <BatchVotePanel
                            onBatchVote={handleBatchVote}
                            onClearRangeVotes={handleDeleteVotesInRange}
                            onClearAll={handleDeleteAllVotes}
                            eventStartDate={selectedEvent?.start_date}
                            eventEndDate={selectedEvent?.end_date}
                          />
                        </div>
                      </SheetContent>
                    </Sheet>
                  )}
                </div>

                {selectedEvent?.category && (
                  <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                    {selectedEvent.category}
                  </Badge>
                )}

                {selectedEvent?.decided_date && (
                  <Badge className="gap-1.5 rounded-full px-3 py-1 text-sm font-semibold">
                    <Pin className="h-3.5 w-3.5" />
                    Kitűzve: {getFormattedPinnedDate(selectedEvent.decided_date)}
                  </Badge>
                )}

                {isCreator && topRankedDates.length > 0 && (
                  <Button variant="outline" className="rounded-xl" onClick={openPinDialog}>
                    <Pin className="mr-2 h-4 w-4" />
                    {selectedEvent?.decided_date ? 'Kitűzött nap módosítása' : 'Nap kitűzése'}
                  </Button>
                )}

                {canVote && (
                  <div className="basis-full">
                    <AvailabilityModeSelector
                      value={activeVoteMode}
                      onChange={setActiveVoteMode}
                      disabled={!canVote}
                    />
                  </div>
                )}

                {(() => {
                  const memberCount = profiles.length;
                  const voterIds = new Set(votes.map(v => v.user_id));
                  const voters = profiles.filter(p => voterIds.has(p.user_id));
                  const nonVoters = profiles.filter(p => !voterIds.has(p.user_id));
                  const voterCount = voters.length;
                  return (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex shrink-0 cursor-help items-center gap-1.5 rounded-xl border bg-secondary/60 px-3 py-1.5">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="text-sm font-bold tabular-nums">{memberCount}<span className="text-muted-foreground font-medium">/</span>{voterCount}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <div className="space-y-1.5 text-xs">
                            <p className="font-semibold">{memberCount} tag, {voterCount} szavazott</p>
                            {nonVoters.length > 0 && (
                              <div>
                                <p className="text-muted-foreground mb-0.5">Még nem szavazott:</p>
                                <p>{nonVoters.map(p => p.display_name || 'Névtelen').join(', ')}</p>
                              </div>
                            )}
                            {voters.length > 0 && (
                              <div>
                                <p className="text-muted-foreground mb-0.5">Szavazott:</p>
                                <p>{voters.map(p => p.display_name || 'Névtelen').join(', ')}</p>
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              </div>

              {/* Calendar - primary focus */}
              <div className="rounded-2xl border bg-card p-4 shadow-card lg:p-6">
                <CalendarGrid
                  votes={votes}
                  currentMonth={currentMonth}
                  onMonthChange={setCurrentMonth}
                  onDayInteract={handleCalendarDayInteraction}
                  onDayInfo={handleOpenDayDetails}
                  selectedDate={selectedDate}
                  participantCount={profiles.length}
                  startDate={selectedEvent.start_date}
                  endDate={selectedEvent.end_date}
                  isInactive={isEventInactive}
                  activeVoteMode={activeVoteMode}
                  currentUserVotes={currentUserVoteMap}
                />
              </div>

              {/* Mobile ranking */}
              <div className="lg:hidden">
                <VoteRanking rankings={rankings} onDayClick={(dateStr) => handleOpenDayDetails(new Date(dateStr))} />
              </div>

            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex min-h-[400px] items-center justify-center"
            >
              <div className="space-y-4 text-center">
                <div className="gradient-primary shadow-glow mx-auto flex h-20 w-20 items-center justify-center rounded-3xl">
                  <CalendarDays className="h-10 w-10 text-primary-foreground" />
                </div>
                {isTemporarySession ? (
                  <div>
                    <h2 className="font-display text-xl font-bold">
                      Az eseménynaptár nem elérhető
                    </h2>
                    <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                      A hozzád rendelt eseménynaptár már nem létezik vagy nem elérhető.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className="font-display text-xl font-bold">
                        Nincs kiválasztott eseménynaptár
                      </h2>
                      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                        Válassz egy eseménynaptárat a legördülő menüből, vagy hozz létre egy újat.
                      </p>
                    </div>
                    <Button className="gradient-primary text-primary-foreground shadow-glow rounded-xl transition-opacity hover:opacity-90" onClick={() => setShowCreateEvent(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Új eseménynaptár létrehozása
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </main>

        {/* Right sidebar - Batch panel */}
        {selectedEvent && canVote && (
          <aside className="hidden w-72 shrink-0 border-l p-4 lg:block overflow-y-auto">
            <div className="sticky top-24 pt-2">
              <BatchVotePanel
                onBatchVote={handleBatchVote}
                onClearRangeVotes={handleDeleteVotesInRange}
                onClearAll={handleDeleteAllVotes}
                eventStartDate={selectedEvent?.start_date}
                eventEndDate={selectedEvent?.end_date}
              />
            </div>
          </aside>
        )}
      </div>


      {detailsDate && selectedEventId && (
        <DayDetailsModal
          date={detailsDate}
          votes={votes}
          profiles={profiles}
          currentUserId={user?.id || ''}
          onClose={() => setDetailsDate(null)}
          onVote={handleVote}
          onRemoveVote={handleRemoveVote}
          isDeadlinePassed={isDeadlinePassed}
          isEventInactive={isEventInactive}
        />
      )}

      {showCreateEvent && (
        <CreateEventDialog
          onClose={() => setShowCreateEvent(false)}
          onCreated={(event) => {
            setEvents(prev => [...prev, event as Event]);
            setSelectedEventId(event.id);
            setShowCreateEvent(false);
          }}
        />
      )}

      {selectedEvent && (
        <>
          <EventInfoModal
            event={selectedEvent}
            open={showEventInfo}
            onOpenChange={setShowEventInfo}
            onEventUpdated={handleEventUpdated}
            onEventDeleted={() => {
              setEvents(prev => {
                const remaining = prev.filter(e => e.id !== selectedEventId);
                const next = getPreferredEvent(remaining);
                setSelectedEventId(next?.id || null);
                if (!next) {
                  setVotes([]);
                  setProfiles([]);
                  setSelectedDate(null);
                  setDetailsDate(null);
                }
                return remaining;
              });
            }}
          />
          <ShareEventDialog
            eventId={selectedEvent.id}
            eventTitle={selectedEvent.title}
            open={showShareDialog}
            onOpenChange={setShowShareDialog}
          />
        </>
      )}


      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.decided_date ? 'Kitűzött nap módosítása' : 'Nap kitűzése'}</DialogTitle>
            <DialogDescription>
              {pinDialogDates.length > 1
                ? 'Több nap is ugyanannyi szavazatot kapott. Válaszd ki, melyik legyen a végleges nap.'
                : 'A legtöbb szavazatot kapott nap kerül kiválasztásra.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {pinDialogDates.map((dateStr) => {
              const selected = pinCandidateDate === dateStr;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setPinCandidateDate(dateStr)}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary'}`}
                >
                  <div>
                    <div className="font-semibold">{getFormattedPinnedDate(dateStr)}</div>
                    <div className="text-sm text-muted-foreground">Legtöbb szavazatot kapott nap</div>
                  </div>
                  <div className={`h-4 w-4 rounded-full border ${selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`} />
                </button>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPinDialogOpen(false)}>Mégse</Button>
            <Button onClick={handleSavePinnedDate} disabled={!pinCandidateDate || pinSaving}>
              Mentés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TempUserRegisterDialog
        open={showTempRegister}
        onOpenChange={(open) => {
          setShowTempRegister(open);
          if (!open) setTempRegisterInitialStep('choose');
        }}
        initialStep={tempRegisterInitialStep}
      />
    </div>
  );
};

export default Index;
