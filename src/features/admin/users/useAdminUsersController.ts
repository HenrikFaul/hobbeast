import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  EMPTY_FILTERS,
  allVisibleProfilesSelected,
  applyClientBulkFilters,
  buildBulkConfirmation,
  filterProfiles,
  hasServerBulkFilters,
  mergePreviewSelection,
  selectedProfilesAreGeneratedOnly,
  toggleProfileSelection,
  toggleVisibleProfileSelection,
  type BulkAction,
  type BulkFilters,
  type EventOption,
  type EventParticipation,
  type HubOriginStatus,
  type PageSize,
  type ProfileRow,
  type VirtualHub,
} from './domain';
import {
  AdminUsersRepositoryError,
  applyAdminBulkAction,
  listAdminProfiles,
  loadAdminHubs,
  loadAdminUserDetail,
  previewAdminBulkSelection,
  reconcileAdminHubs,
  updateAdminProfile,
} from './repository';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof AdminUsersRepositoryError || error instanceof Error
    ? error.message
    : fallback;
}

export function useAdminUsersController() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [lastBulkJobId, setLastBulkJobId] = useState<string | null>(null);

  const [hubs, setHubs] = useState<VirtualHub[]>([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [hubsReconciling, setHubsReconciling] = useState(false);
  const [hubOriginStatus, setHubOriginStatus] = useState<HubOriginStatus>('available');
  const [userHubMap, setUserHubMap] = useState<Map<string, VirtualHub[]>>(new Map());

  const [bulkFilters, setBulkFilters] = useState<BulkFilters>(EMPTY_FILTERS);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkConfirmation, setBulkConfirmation] = useState('');
  const [bulkApprovalRequestId, setBulkApprovalRequestId] = useState('');
  const [bulkIdempotencyKey, setBulkIdempotencyKey] = useState('');

  const [selectedUser, setSelectedUser] = useState<ProfileRow | null>(null);
  const [participations, setParticipations] = useState<EventParticipation[]>([]);
  const [allEvents, setAllEvents] = useState<EventOption[]>([]);
  const [allHobbyOptions, setAllHobbyOptions] = useState<string[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedHobbies, setSelectedHobbies] = useState<Set<string>>(new Set());
  const [eventSearch, setEventSearch] = useState('');
  const [hobbySearch, setHobbySearch] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [editGender, setEditGender] = useState('unspecified');
  const [editActiveStatus, setEditActiveStatus] = useState<'active' | 'inactive'>('active');
  const [editBio, setEditBio] = useState('');
  const [editReason, setEditReason] = useState('');

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const page = await listAdminProfiles();
      setProfiles(page.profiles);
      if (page.truncated) {
        toast.warning('Az admin profillista az első 1000 allowlisted rekordot mutatja.');
      }
    } catch {
      toast.error('Nem sikerült betölteni a profilokat. Ellenőrizd a users.manage_profile jogosultságot.');
      setProfiles([]);
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  const loadHubs = useCallback(async () => {
    setHubsLoading(true);
    try {
      const snapshot = await loadAdminHubs();
      setHubs(snapshot.hubs);
      setUserHubMap(snapshot.userHubMap);
      setHubOriginStatus(snapshot.originStatus);
      if (snapshot.membershipWarning) {
        console.warn('[admin-users] Hub membership map unavailable');
      }
    } catch {
      toast.error('Nem sikerült betölteni a virtuális közösségeket.');
      setHubs([]);
      setUserHubMap(new Map());
    } finally {
      setHubsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
    void loadHubs();
  }, [loadHubs, loadProfiles]);

  const reconcileHubs = useCallback(async () => {
    setHubsReconciling(true);
    try {
      const result = await reconcileAdminHubs(`admin-ui:${new Date().toISOString().slice(0, 13)}`);
      if (result.status === 'failed') {
        toast.error(`A hub-egyeztetés részhibával zárult (${result.profiles_failed ?? 0} profil).`);
      } else {
        toast.success(`Hub-egyeztetés kész (${result.profiles_completed ?? 0} profil).`);
      }
      await loadHubs();
    } catch (error) {
      toast.error(`Hub-egyeztetés sikertelen: ${errorMessage(error, 'ismeretlen hiba')}`);
    } finally {
      setHubsReconciling(false);
    }
  }, [loadHubs]);

  const hydrateDetail = useCallback(async (profile: ProfileRow) => {
    setSelectedUser(profile);
    setDetailLoading(true);
    const snapshot = await loadAdminUserDetail(profile.user_id);
    snapshot.warnings.forEach((warning) => {
      console.warn('[admin-users] Detail slice unavailable', { slice: warning.split(':')[0] });
    });
    setParticipations(snapshot.participations);
    setAllEvents(snapshot.events);
    setAllHobbyOptions(snapshot.hobbyOptions);
    setSelectedEventIds(new Set(
      snapshot.participations
        .map((row) => row.event?.id || row.event_id)
        .filter((eventId): eventId is string => Boolean(eventId)),
    ));
    setSelectedHobbies(new Set(profile.hobbies || []));
    setEditGender(profile.gender || 'unspecified');
    setEditActiveStatus(profile.is_active === false ? 'inactive' : 'active');
    setEditBio((profile.bio || '').slice(0, 500));
    setEditReason('');
    setEventSearch('');
    setHobbySearch('');
    setDetailLoading(false);
  }, []);

  const openDetail = useCallback(async (profile: ProfileRow) => {
    try {
      await hydrateDetail(profile);
    } catch {
      setDetailLoading(false);
      toast.error('A profil részletes adatai nem tölthetők be.');
    }
  }, [hydrateDetail]);

  const openUserDetailById = useCallback(async (userId: string) => {
    const profile = profiles.find((row) => row.user_id === userId);
    if (!profile) {
      toast.error('A kiválasztott tag profilja nem található.');
      return;
    }
    await openDetail(profile);
  }, [openDetail, profiles]);

  const closeDetail = useCallback(() => setSelectedUser(null), []);

  const saveUserDetail = useCallback(async () => {
    if (!selectedUser?.user_id) {
      toast.error('A profil user_id hiányzik, ezért nem menthető.');
      return;
    }
    if (editReason.trim().length < 3) {
      toast.error('Adj meg legalább 3 karakteres, auditálható módosítási indokot.');
      return;
    }

    setDetailSaving(true);
    const updatedProfile: ProfileRow = {
      ...selectedUser,
      gender: editGender === 'unspecified' ? null : editGender,
      is_active: editActiveStatus === 'active',
      bio: editBio.trim().slice(0, 500) || null,
      hobbies: Array.from(selectedHobbies),
    };

    try {
      await updateAdminProfile({
        userId: selectedUser.user_id,
        gender: updatedProfile.gender,
        isActive: updatedProfile.is_active !== false,
        bio: updatedProfile.bio || '',
        hobbies: updatedProfile.hobbies || [],
        eventIds: Array.from(selectedEventIds),
        reason: editReason.trim(),
        idempotencyKey: `admin-profile:${crypto.randomUUID()}`,
      });
      toast.success('Profil adatok mentve.');
      setProfiles((current) => current.map((profile) => (
        profile.user_id === updatedProfile.user_id ? updatedProfile : profile
      )));
      await hydrateDetail(updatedProfile);
    } catch {
      toast.error('A profil módosítását a capability/audit határ elutasította.');
    } finally {
      setDetailSaving(false);
    }
  }, [
    editActiveStatus,
    editBio,
    editGender,
    editReason,
    hydrateDetail,
    selectedEventIds,
    selectedHobbies,
    selectedUser,
  ]);

  const visibleProfiles = useMemo(
    () => filterProfiles(profiles, search, userHubMap),
    [profiles, search, userHubMap],
  );
  const allVisibleSelected = useMemo(
    () => allVisibleProfilesSelected(visibleProfiles, selectedUserIds),
    [selectedUserIds, visibleProfiles],
  );
  const selectedGeneratedOnly = useMemo(
    () => selectedProfilesAreGeneratedOnly(profiles, selectedUserIds),
    [profiles, selectedUserIds],
  );
  const expectedBulkConfirmation = buildBulkConfirmation(pendingAction, selectedUserIds.size);

  const toggleVisible = useCallback((checked: boolean) => {
    setSelectedUserIds((current) => toggleVisibleProfileSelection(current, visibleProfiles, checked));
  }, [visibleProfiles]);

  const toggleSingle = useCallback((userId: string, checked: boolean) => {
    setSelectedUserIds((current) => toggleProfileSelection(current, userId, checked));
  }, []);

  const openBulkAction = useCallback((action: BulkAction) => {
    setPendingAction(action);
    setBulkConfirmation('');
    setBulkApprovalRequestId('');
    setBulkIdempotencyKey(`bulk-ui:${crypto.randomUUID()}`);
    setLastBulkJobId(null);
  }, []);

  const closeBulkAction = useCallback(() => setPendingAction(null), []);

  const resetBulkFilters = useCallback(() => {
    setBulkFilters(EMPTY_FILTERS);
    setSelectedUserIds(new Set());
  }, []);

  const applyBulkSelection = useCallback(async () => {
    const requiresServerPreview = hasServerBulkFilters(bulkFilters);
    let candidateIds: Set<string>;

    if (!requiresServerPreview) {
      candidateIds = new Set(profiles.map((profile) => profile.user_id).filter(Boolean));
    } else {
      if (bulkReason.trim().length < 3) {
        toast.error('A szerveroldali tömeges kereséshez legalább 3 karakteres indok szükséges.');
        return;
      }
      setBulkApplying(true);
      try {
        const preview = await previewAdminBulkSelection({
          reason: bulkReason.trim(),
          filters: {
            userType: bulkFilters.userType,
            registeredOlderThanDays: bulkFilters.registeredOlderThanDays
              ? Number(bulkFilters.registeredOlderThanDays)
              : null,
            inactiveDays: bulkFilters.inactiveDays ? Number(bulkFilters.inactiveDays) : null,
            hasOpenOwnedEvents: bulkFilters.hasOpenOwnedEvents,
          },
        });
        candidateIds = mergePreviewSelection(
          profiles,
          preview.selectedProfileIds,
          preview.selectedUserIds,
        );
        if (preview.truncated) {
          toast.warning('A találati halmaz nagyobb 500-nál; biztonsági okból csak az első 500 profil lett kijelölve.');
        }
      } catch (error) {
        toast.error(`Tömeges kijelölés hiba: ${errorMessage(error, 'ismeretlen hiba')}`);
        return;
      } finally {
        setBulkApplying(false);
      }
    }

    const selection = applyClientBulkFilters(candidateIds, profiles, userHubMap, bulkFilters);
    setSelectedUserIds(selection);
    toast.success(`${selection.size} profil kijelölve a szűrők alapján.`);
  }, [bulkFilters, bulkReason, profiles, userHubMap]);

  const runBulkAction = useCallback(async (action: BulkAction) => {
    if (selectedUserIds.size === 0) return;
    if (bulkReason.trim().length < 3) {
      toast.error('Adj meg legalább 3 karakteres, auditálható műveleti indokot.');
      return;
    }
    if (bulkConfirmation !== expectedBulkConfirmation) {
      toast.error('A megerősítő kifejezés nem egyezik.');
      return;
    }
    if (action === 'delete' && !selectedGeneratedOnly) {
      toast.error('Tömegesen csak generált/szimulációs felhasználó törölhető.');
      return;
    }

    setBulkApplying(true);
    try {
      const result = await applyAdminBulkAction({
        action,
        reason: bulkReason.trim(),
        confirmation: bulkConfirmation,
        idempotencyKey: bulkIdempotencyKey,
        approvalRequestId: bulkApprovalRequestId.trim() || undefined,
        filterSnapshot: {
          userType: bulkFilters.userType,
          registeredOlderThanDays: bulkFilters.registeredOlderThanDays || null,
          inactiveDays: bulkFilters.inactiveDays || null,
          hasOpenOwnedEvents: bulkFilters.hasOpenOwnedEvents,
          hobbyFilterApplied: Boolean(bulkFilters.hobbyFilter.trim()),
          hubFilterApplied: Boolean(bulkFilters.hubFilter.trim()),
        },
        userIds: Array.from(selectedUserIds),
        profileIds: profiles
          .filter((profile) => profile.user_id && selectedUserIds.has(profile.user_id))
          .map((profile) => profile.id),
      });

      if (result.pendingApproval) {
        const approvalId = result.approvalRequestId || '';
        setBulkApprovalRequestId(approvalId);
        toast.info(`Jóváhagyási kérés létrejött (${approvalId}). Egy másik security admin jóváhagyása után ugyanitt futtasd újra.`);
        return;
      }

      setLastBulkJobId(result.jobId);
      if (result.failures) {
        toast.warning(`${result.affected} profil művelete lefutott, ${result.failures} cél hibás. Job: ${result.jobId || '—'}`);
      } else {
        toast.success(`${result.affected} profil művelete lefutott. Job: ${result.jobId || '—'}`);
      }
      setPendingAction(null);
      setSelectedUserIds(new Set());
      await loadProfiles();
    } catch (error) {
      toast.error(`Tömeges művelet hiba: ${errorMessage(error, 'ismeretlen hiba')}`);
    } finally {
      setBulkApplying(false);
    }
  }, [
    bulkApprovalRequestId,
    bulkConfirmation,
    bulkFilters,
    bulkIdempotencyKey,
    bulkReason,
    expectedBulkConfirmation,
    loadProfiles,
    profiles,
    selectedGeneratedOnly,
    selectedUserIds,
  ]);

  const toggleHobby = useCallback((hobby: string, checked: boolean) => {
    setSelectedHobbies((current) => {
      const next = new Set(current);
      if (checked) next.add(hobby);
      else next.delete(hobby);
      return next;
    });
  }, []);

  const toggleEvent = useCallback((eventId: string, checked: boolean) => {
    setSelectedEventIds((current) => {
      const next = new Set(current);
      if (checked) next.add(eventId);
      else next.delete(eventId);
      return next;
    });
  }, []);

  return {
    directory: {
      profiles,
      visibleProfiles,
      profilesLoading,
      search,
      pageSize,
      selectedUserIds,
      allVisibleSelected,
      selectedGeneratedOnly,
      lastBulkJobId,
      userHubMap,
      setSearch,
      setPageSize,
      toggleVisible,
      toggleSingle,
      openBulkAction,
      openDetail,
      openBulkSelection: () => setBulkModalOpen(true),
    },
    hubs: {
      hubs,
      hubsLoading,
      hubsReconciling,
      hubOriginStatus,
      reconcileHubs,
      loadHubs,
      openUserDetailById,
    },
    bulk: {
      filters: bulkFilters,
      modalOpen: bulkModalOpen,
      applying: bulkApplying,
      pendingAction,
      reason: bulkReason,
      confirmation: bulkConfirmation,
      approvalRequestId: bulkApprovalRequestId,
      expectedConfirmation: expectedBulkConfirmation,
      selectedCount: selectedUserIds.size,
      selectedGeneratedOnly,
      setFilters: setBulkFilters,
      setModalOpen: setBulkModalOpen,
      setReason: setBulkReason,
      setConfirmation: setBulkConfirmation,
      setApprovalRequestId: setBulkApprovalRequestId,
      applySelection: applyBulkSelection,
      resetFilters: resetBulkFilters,
      closeAction: closeBulkAction,
      runAction: runBulkAction,
    },
    detail: {
      selectedUser,
      participations,
      events: allEvents,
      hobbyOptions: allHobbyOptions,
      selectedEventIds,
      selectedHobbies,
      eventSearch,
      hobbySearch,
      loading: detailLoading,
      saving: detailSaving,
      gender: editGender,
      activeStatus: editActiveStatus,
      bio: editBio,
      reason: editReason,
      close: closeDetail,
      save: saveUserDetail,
      setEventSearch,
      setHobbySearch,
      setGender: setEditGender,
      setActiveStatus: setEditActiveStatus,
      setBio: setEditBio,
      setReason: setEditReason,
      toggleHobby,
      toggleEvent,
    },
    loadProfiles,
  };
}

export type AdminUsersController = ReturnType<typeof useAdminUsersController>;
