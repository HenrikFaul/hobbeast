import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { NormalizedPlace } from '@/lib/placeSearch';
import {
  FUNCTION_GROUP_LABELS,
  getProviderDisplayLabel,
  makeDbProviderId,
  type AddressSearchFunctionGroup,
  type AddressSearchProvider,
  type DbSearchTableConfig,
} from '@/lib/searchProviderConfig';
import {
  BASE_PROVIDER_OPTIONS,
  DEFAULT_DB_FORM,
  DEFAULT_DB_TEST_COLUMNS,
  INITIAL_FUNCTION_GROUP_PROVIDERS,
  INITIAL_SEATGEEK_PARAMS,
  INITIAL_TICKETMASTER_PARAMS,
  buildProviderOptions,
  enrichMapperRow,
  eventFeedApprovalDraft,
  filterDbRows,
  getErrorMessage,
  isEventFeedApprovalDraftReady,
  isAdminExternalProviderTab,
  normalizeDbQueryResult,
  normalizeEventFeedStatus,
  rankDiscoveredCategoryMatches,
  resolveMappedCategory,
  deriveCategoryAliasInfo,
  type AdminExternalEventDto,
  type AdminExternalProviderTab,
  type AdminEventFeedApprovalDraft,
  type DbConfigFormState,
  type ProviderRunState,
} from './domain';
import {
  discoverDbProviderFacets,
  loadEventFeedStatus,
  loadProviderConfiguration,
  probeEventFeedSource,
  previewSeatGeekAdmin,
  previewTicketmasterAdmin,
  pullEventbriteOrganizationEvents,
  queryDbProvider,
  saveAllFunctionGroupProviders,
  saveDbProviderConfigs,
  saveFunctionGroupProvider,
  searchEventbriteAdmin,
  reviewEventFeedSource,
  syncEventFeedSource,
  syncSeatGeekAdmin,
  syncTicketmasterAdmin,
  testAddressProvider,
  validateEventbriteToken,
} from './repository';

const EVENT_FEED_PAGE_SIZE = 20;

export function useExternalEventsAdminController() {
  const [providerTab, setProviderTab] = useState<AdminExternalProviderTab>('eventbrite');

  const [eventbriteKeyword, setEventbriteKeyword] = useState('Budapest');
  const [eventbriteEvents, setEventbriteEvents] = useState<AdminExternalEventDto[]>([]);
  const [eventbriteLoading, setEventbriteLoading] = useState(false);
  const [eventbriteError, setEventbriteError] = useState<string | null>(null);
  const [eventbriteDebug, setEventbriteDebug] = useState<string | null>(null);

  const [ticketmasterParams, setTicketmasterParams] = useState(INITIAL_TICKETMASTER_PARAMS);
  const [ticketmasterEvents, setTicketmasterEvents] = useState<AdminExternalEventDto[]>([]);
  const [ticketmasterLoading, setTicketmasterLoading] = useState(false);
  const [ticketmasterInfo, setTicketmasterInfo] = useState<string | null>(null);

  const [seatGeekParams, setSeatGeekParams] = useState(INITIAL_SEATGEEK_PARAMS);
  const [seatGeekEvents, setSeatGeekEvents] = useState<AdminExternalEventDto[]>([]);
  const [seatGeekLoading, setSeatGeekLoading] = useState(false);
  const [seatGeekInfo, setSeatGeekInfo] = useState<string | null>(null);

  const [feedSnapshot, setFeedSnapshot] = useState(() => normalizeEventFeedStatus({}));
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [feedActionSourceId, setFeedActionSourceId] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedApprovalDrafts, setFeedApprovalDrafts] = useState<Record<string, AdminEventFeedApprovalDraft>>({});
  const [feedPage, setFeedPage] = useState(1);
  const [feedQuery, setFeedQuery] = useState('');
  const [feedQueryDraft, setFeedQueryDraft] = useState('');

  const [functionGroupProviders, setFunctionGroupProviders] = useState(INITIAL_FUNCTION_GROUP_PROVIDERS);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerSaving, setProviderSaving] = useState(false);
  const [testQuery, setTestQuery] = useState('Budapest társasjáték');
  const [testFunctionGroup, setTestFunctionGroup] = useState<AddressSearchFunctionGroup>('venue');
  const [testResults, setTestResults] = useState<NormalizedPlace[]>([]);
  const [testLoading, setTestLoading] = useState(false);

  const [dbConfigs, setDbConfigs] = useState<DbSearchTableConfig[]>([]);
  const [dbConfigLoading, setDbConfigLoading] = useState(false);
  const [dbConfigSaving, setDbConfigSaving] = useState(false);
  const [dbForm, setDbForm] = useState<DbConfigFormState>(DEFAULT_DB_FORM);
  const [dbTestResults, setDbTestResults] = useState<NormalizedPlace[]>([]);
  const [dbTestRows, setDbTestRows] = useState<Record<string, unknown>[]>([]);
  const [dbTestColumns, setDbTestColumns] = useState<string[]>(DEFAULT_DB_TEST_COLUMNS);
  const [dbTotalCount, setDbTotalCount] = useState<number | null>(null);
  const [dbTestLoading, setDbTestLoading] = useState(false);
  const [dbDebug, setDbDebug] = useState<Record<string, unknown> | null>(null);
  const [dbQueryExecuted, setDbQueryExecuted] = useState(false);
  const [dbQueryError, setDbQueryError] = useState<string | null>(null);
  const [dbDiscovery, setDbDiscovery] = useState<Awaited<ReturnType<typeof discoverDbProviderFacets>> | null>(null);
  const [dbDiscoveryLoading, setDbDiscoveryLoading] = useState(false);
  const [dbDiscoveryError, setDbDiscoveryError] = useState<string | null>(null);
  const [dbSlowQueryNotice, setDbSlowQueryNotice] = useState(false);
  const [dbResponseMs, setDbResponseMs] = useState<number | null>(null);
  const [dbColumnFilters, setDbColumnFilters] = useState<Record<string, string>>({});
  const [dbMapperColumnFilters, setDbMapperColumnFilters] = useState<Record<string, string>>({});

  const providerOptions = useMemo(
    () => buildProviderOptions(BASE_PROVIDER_OPTIONS, dbConfigs),
    [dbConfigs],
  );
  const dbCategorySuggestions = useMemo(
    () => rankDiscoveredCategoryMatches(dbForm.category, dbDiscovery?.categories || []),
    [dbDiscovery, dbForm.category],
  );
  const dbMappedCategory = useMemo(
    () => resolveMappedCategory(dbForm.category, dbDiscovery?.categories || []),
    [dbDiscovery, dbForm.category],
  );
  const dbDiscoveryCategoryAliases = useMemo(
    () => (dbDiscovery?.categories || []).slice(0, 120).map((category) => ({
      value: category.value,
      count: category.count,
      ...deriveCategoryAliasInfo(category.value),
    })),
    [dbDiscovery],
  );
  const mapperRows = useMemo(() => dbTestRows.map(enrichMapperRow), [dbTestRows]);
  const mapperColumns = useMemo(() => {
    const preferred = [
      'id', 'name', 'city', 'formatted_address', 'categories', 'categories_en', 'categories_hu',
      'local_catalog_path_hu', 'local_catalog_path_en', 'local_catalog_slug', 'source_provider',
      'translation_source',
    ];
    const seen = new Set<string>();
    return [...preferred, ...dbTestColumns].filter((column) => {
      if (seen.has(column)) return false;
      seen.add(column);
      return mapperRows.some((row) => row[column] !== undefined);
    });
  }, [dbTestColumns, mapperRows]);
  const filteredDbTestRows = useMemo(
    () => filterDbRows(dbTestRows, dbColumnFilters),
    [dbColumnFilters, dbTestRows],
  );
  const filteredMapperRows = useMemo(
    () => filterDbRows(mapperRows, dbMapperColumnFilters),
    [dbMapperColumnFilters, mapperRows],
  );

  const loadDbDiscovery = useCallback(async (table = dbForm.table, label = dbForm.label) => {
    setDbDiscoveryLoading(true);
    setDbDiscoveryError(null);
    try {
      setDbDiscovery(await discoverDbProviderFacets({ table, label, limit: 5000 }));
    } catch (error) {
      setDbDiscovery(null);
      setDbDiscoveryError(getErrorMessage(error, 'Nem sikerült betölteni az élő kategória-felderítést.'));
    } finally {
      setDbDiscoveryLoading(false);
    }
  }, [dbForm.label, dbForm.table]);

  const loadProviderState = useCallback(async () => {
    setProviderLoading(true);
    setDbConfigLoading(true);
    try {
      const snapshot = await loadProviderConfiguration();
      setFunctionGroupProviders(snapshot.groups);
      setDbConfigs(snapshot.dbConfigs);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Nem sikerült betölteni a provider konfigurációt.'));
    } finally {
      setProviderLoading(false);
      setDbConfigLoading(false);
    }
  }, []);

  const loadFeedStatusPage = useCallback(async (page: number, query: string) => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const normalizedQuery = query.trim();
      const snapshot = await loadEventFeedStatus({
        page,
        limit: EVENT_FEED_PAGE_SIZE,
        query: normalizedQuery || undefined,
      });
      setFeedSnapshot(snapshot);
      setFeedPage(snapshot.pagination.page);
      setFeedQuery(normalizedQuery);
      setFeedApprovalDrafts((current) => {
        const next = { ...current };
        snapshot.sources.forEach((source) => {
          next[source.sourceId] = current[source.sourceId] ?? eventFeedApprovalDraft(source);
        });
        return next;
      });
      setFeedLoaded(true);
    } catch (error) {
      setFeedError(getErrorMessage(error, 'Nem sikerült betölteni a feed registry állapotát.'));
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const refreshFeedStatus = useCallback(
    () => loadFeedStatusPage(feedPage, feedQuery),
    [feedPage, feedQuery, loadFeedStatusPage],
  );

  const searchFeedSources = useCallback(
    () => loadFeedStatusPage(1, feedQueryDraft),
    [feedQueryDraft, loadFeedStatusPage],
  );

  const clearFeedSourceSearch = useCallback(() => {
    setFeedQueryDraft('');
    return loadFeedStatusPage(1, '');
  }, [loadFeedStatusPage]);

  const goToFeedPage = useCallback((requestedPage: number) => {
    const page = Math.max(1, Math.min(feedSnapshot.pagination.totalPages, Math.trunc(requestedPage)));
    return loadFeedStatusPage(page, feedQuery);
  }, [feedQuery, feedSnapshot.pagination.totalPages, loadFeedStatusPage]);

  const updateFeedApprovalDraft = useCallback((
    sourceId: string,
    patch: Partial<AdminEventFeedApprovalDraft>,
  ) => {
    setFeedApprovalDrafts((current) => {
      const existing = current[sourceId];
      if (!existing) return current;
      return { ...current, [sourceId]: { ...existing, ...patch } };
    });
  }, []);

  useEffect(() => {
    void loadProviderState();
  }, [loadProviderState]);

  useEffect(() => {
    if (providerTab === 'places') void loadDbDiscovery(dbForm.table, dbForm.label);
  }, [dbForm.label, dbForm.table, loadDbDiscovery, providerTab]);

  useEffect(() => {
    if (providerTab === 'feeds' && !feedLoaded) void refreshFeedStatus();
  }, [feedLoaded, providerTab, refreshFeedStatus]);

  const selectProviderTab = useCallback((value: string) => {
    if (isAdminExternalProviderTab(value)) setProviderTab(value);
  }, []);

  const searchEventbrite = useCallback(async () => {
    setEventbriteLoading(true);
    setEventbriteError(null);
    setEventbriteDebug(null);
    try {
      const events = await searchEventbriteAdmin(eventbriteKeyword);
      setEventbriteEvents(events);
      if (events.length > 0) {
        toast.success(`${events.length} esemény betöltve az Eventbrite-ról`);
      } else {
        setEventbriteDebug('Az Eventbrite API nem adott vissza eseményeket. Ez lehet a keresési kifejezés, az API kulcs jogosultsága, vagy az Eventbrite API korlátozása miatt.');
      }
    } catch (error) {
      setEventbriteError(getErrorMessage(error, 'Hiba az Eventbrite API hívásnál'));
      toast.error('Eventbrite hiba');
    } finally {
      setEventbriteLoading(false);
    }
  }, [eventbriteKeyword]);

  const testEventbriteToken = useCallback(async () => {
    setEventbriteLoading(true);
    setEventbriteError(null);
    setEventbriteDebug(null);
    try {
      const status = await validateEventbriteToken();
      if (status.ok) {
        toast.success('Eventbrite token validálva');
        setEventbriteDebug(`Token rendben. Webhook ID: ${status.webhookId || 'nincs beállítva'}`);
      } else {
        setEventbriteError(`Eventbrite token hiba: ${status.status} - ${JSON.stringify(status.response)}`);
      }
    } catch (error) {
      setEventbriteError(getErrorMessage(error, 'Token teszt hiba'));
    } finally {
      setEventbriteLoading(false);
    }
  }, []);

  const pullEventbriteOrganization = useCallback(async () => {
    setEventbriteLoading(true);
    setEventbriteError(null);
    setEventbriteDebug(null);
    try {
      const result = await pullEventbriteOrganizationEvents();
      if (result.hasOrganization) {
        setEventbriteEvents(result.events);
        toast.success(`${result.events.length} szervezeti esemény betöltve`);
      } else {
        setEventbriteDebug('Nincs szervezet társítva az Eventbrite API kulcshoz. Az Eventbrite v3 API csak szervezeti eseményeket tud listázni. Hozz létre egy szervezetet az Eventbrite dashboardon, vagy használj személyes OAuth tokent.');
      }
    } catch (error) {
      setEventbriteError(getErrorMessage(error, 'Hiba'));
    } finally {
      setEventbriteLoading(false);
    }
  }, []);

  const previewTicketmaster = useCallback(async () => {
    setTicketmasterLoading(true);
    setTicketmasterInfo(null);
    try {
      const events = await previewTicketmasterAdmin(ticketmasterParams);
      setTicketmasterEvents(events);
      setTicketmasterInfo(events.length > 0
        ? `${events.length} Ticketmaster/Universe esemény találat.`
        : 'A Ticketmaster nem adott vissza találatot erre a kombinációra.');
    } catch (error) {
      setTicketmasterInfo(getErrorMessage(error, 'Ticketmaster előnézeti hiba.'));
      setTicketmasterEvents([]);
    } finally {
      setTicketmasterLoading(false);
    }
  }, [ticketmasterParams]);

  const syncTicketmaster = useCallback(async () => {
    setTicketmasterLoading(true);
    try {
      const synced = await syncTicketmasterAdmin(ticketmasterParams);
      toast.success(`${synced} Ticketmaster esemény szinkronizálva`);
      await previewTicketmaster();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Ticketmaster szinkron hiba'));
    } finally {
      setTicketmasterLoading(false);
    }
  }, [previewTicketmaster, ticketmasterParams]);

  const previewSeatGeek = useCallback(async () => {
    setSeatGeekLoading(true);
    setSeatGeekInfo(null);
    try {
      const events = await previewSeatGeekAdmin(seatGeekParams);
      setSeatGeekEvents(events);
      setSeatGeekInfo(events.length > 0
        ? `${events.length} SeatGeek esemény találat.`
        : 'A SeatGeek nem adott vissza találatot.');
    } catch (error) {
      setSeatGeekInfo(getErrorMessage(error, 'SeatGeek előnézeti hiba.'));
      setSeatGeekEvents([]);
    } finally {
      setSeatGeekLoading(false);
    }
  }, [seatGeekParams]);

  const syncSeatGeek = useCallback(async () => {
    setSeatGeekLoading(true);
    try {
      const synced = await syncSeatGeekAdmin(seatGeekParams);
      toast.success(`${synced} SeatGeek esemény szinkronizálva`);
      await previewSeatGeek();
    } catch (error) {
      toast.error(getErrorMessage(error, 'SeatGeek szinkron hiba'));
    } finally {
      setSeatGeekLoading(false);
    }
  }, [previewSeatGeek, seatGeekParams]);

  const probeFeed = useCallback(async (sourceId: string) => {
    setFeedActionSourceId(sourceId);
    setFeedError(null);
    try {
      const [result] = await probeEventFeedSource(sourceId);
      toast.success(result
        ? `Feed próba kész: ${result.discovered} észlelt, ${result.quarantined} karanténban.`
        : 'Feed próba sikeresen lefutott.');
      await refreshFeedStatus();
    } catch (error) {
      const message = getErrorMessage(error, 'A feed próbája nem sikerült.');
      setFeedError(message);
      toast.error(message);
    } finally {
      setFeedActionSourceId(null);
    }
  }, [refreshFeedStatus]);

  const syncFeed = useCallback(async (sourceId: string) => {
    setFeedActionSourceId(sourceId);
    setFeedError(null);
    try {
      const [result] = await syncEventFeedSource(sourceId);
      toast.success(result
        ? `Feed szinkron kész: ${result.published} publikált, ${result.quarantined} karanténban.`
        : 'Feed szinkron sikeresen lefutott.');
      await refreshFeedStatus();
    } catch (error) {
      const message = getErrorMessage(error, 'A feed szinkronja nem sikerült.');
      setFeedError(message);
      toast.error(message);
    } finally {
      setFeedActionSourceId(null);
    }
  }, [refreshFeedStatus]);

  const reviewFeed = useCallback(async (sourceId: string, decision: 'approved' | 'disabled') => {
    const draft = feedApprovalDrafts[sourceId];
    const reason = draft?.reason.trim() || '';
    if (reason.length < 8) {
      const message = 'A jóváhagyáshoz vagy kikapcsoláshoz legalább 8 karakteres indoklás szükséges.';
      setFeedError(message);
      toast.error(message);
      return;
    }
    if (decision === 'approved' && !isEventFeedApprovalDraftReady(draft)) {
      const message = 'A jóváhagyáshoz pontos fetch host, jóváhagyott jogi review, robots engedély és érvényes poll/minőség szükséges.';
      setFeedError(message);
      toast.error(message);
      return;
    }

    setFeedActionSourceId(sourceId);
    setFeedError(null);
    try {
      if (decision === 'approved' && draft) {
        await reviewEventFeedSource({
          sourceId,
          decision,
          reason,
          enable: draft.enable,
          fetchHosts: [draft.fetchHost.trim().toLocaleLowerCase('en-US')],
          legalReviewStatus: 'approved',
          robotsAllowed: true,
          pollIntervalMinutes: draft.pollIntervalMinutes,
          minPublishQuality: draft.minPublishQuality,
        });
      } else {
        await reviewEventFeedSource({ sourceId, decision: 'disabled', reason });
      }
      setFeedApprovalDrafts((current) => current[sourceId]
        ? {
          ...current,
          [sourceId]: {
            ...current[sourceId],
            legalReviewApproved: false,
            robotsAllowed: false,
            reason: '',
          },
        }
        : current);
      toast.success(decision === 'approved' ? 'Feed forrás jóváhagyva.' : 'Feed forrás kikapcsolva.');
      await refreshFeedStatus();
    } catch (error) {
      const message = getErrorMessage(error, 'A feed felülvizsgálata nem sikerült.');
      setFeedError(message);
      toast.error(message);
    } finally {
      setFeedActionSourceId(null);
    }
  }, [feedApprovalDrafts, refreshFeedStatus]);

  const saveProvider = useCallback(async (group: AddressSearchFunctionGroup) => {
    setProviderSaving(true);
    try {
      await saveFunctionGroupProvider(group, functionGroupProviders[group]);
      await loadProviderState();
      toast.success(`${FUNCTION_GROUP_LABELS[group]} provider elmentve és visszaellenőrizve`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Nem sikerült menteni a provider beállítást'));
    } finally {
      setProviderSaving(false);
    }
  }, [functionGroupProviders, loadProviderState]);

  const saveAllProviders = useCallback(async () => {
    setProviderSaving(true);
    try {
      await saveAllFunctionGroupProviders(functionGroupProviders);
      await loadProviderState();
      toast.success('Minden provider beállítás elmentve és visszaellenőrizve');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Nem sikerült menteni'));
    } finally {
      setProviderSaving(false);
    }
  }, [functionGroupProviders, loadProviderState]);

  const testProvider = useCallback(async () => {
    setTestLoading(true);
    try {
      const provider = functionGroupProviders[testFunctionGroup];
      const results = await testAddressProvider(testQuery, provider);
      setTestResults(results);
      toast.success(`${results.length} találat (${FUNCTION_GROUP_LABELS[testFunctionGroup]} — ${getProviderDisplayLabel(provider, dbConfigs)})`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Provider tesztelési hiba'));
      setTestResults([]);
    } finally {
      setTestLoading(false);
    }
  }, [dbConfigs, functionGroupProviders, testFunctionGroup, testQuery]);

  const persistDbConfigs = useCallback(async (next: DbSearchTableConfig[]) => {
    setDbConfigSaving(true);
    try {
      setDbConfigs(await saveDbProviderConfigs(next));
      await loadProviderState();
      toast.success('Adatbázistábla provider konfiguráció elmentve és visszaellenőrizve');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Nem sikerült menteni az adatbázistábla konfigurációt'));
    } finally {
      setDbConfigSaving(false);
    }
  }, [loadProviderState]);

  const addDbConfig = useCallback(async () => {
    const id = makeDbProviderId(dbForm.label, dbForm.table);
    const now = new Date().toISOString();
    const nextRow: DbSearchTableConfig = {
      id,
      provider: `db:${id}`,
      label: dbForm.label.trim() || dbForm.table.split('.').pop() || dbForm.table,
      table: dbForm.table,
      enabled: true,
      createdAt: dbConfigs.find((row) => row.id === id)?.createdAt || now,
      updatedAt: now,
    };
    await persistDbConfigs([...dbConfigs.filter((row) => row.id !== id), nextRow]);
  }, [dbConfigs, dbForm.label, dbForm.table, persistDbConfigs]);

  const removeDbConfig = useCallback(async (provider: AddressSearchProvider) => {
    setFunctionGroupProviders((current) => {
      const next = { ...current };
      (Object.keys(next) as AddressSearchFunctionGroup[]).forEach((group) => {
        if (next[group] === provider) next[group] = 'geoapify_tomtom';
      });
      return next;
    });
    await persistDbConfigs(dbConfigs.filter((row) => row.provider !== provider));
  }, [dbConfigs, persistDbConfigs]);

  const editDbConfig = useCallback((row: DbSearchTableConfig) => {
    setDbForm((current) => ({ ...current, table: row.table, label: row.label }));
  }, []);

  const runDbQuery = useCallback(async () => {
    setDbQueryExecuted(true);
    setDbQueryError(null);
    setDbDebug(null);
    setDbTestResults([]);
    setDbTestRows([]);
    setDbTotalCount(null);

    if (dbForm.columns.length === 0) {
      const message = 'Válassz ki legalább egy megjelenítendő oszlopot a lekérdezés futtatásához.';
      setDbQueryError(message);
      toast.error(message);
      return;
    }

    setDbTestLoading(true);
    setDbSlowQueryNotice(false);
    const slowTimer = window.setTimeout(() => setDbSlowQueryNotice(true), 500);
    const startedAt = performance.now();
    try {
      const mappedCategory = dbMappedCategory || dbForm.category;
      const result = await queryDbProvider({
        table: dbForm.table,
        label: dbForm.label,
        city: dbForm.city,
        category: mappedCategory,
        source: dbForm.source,
        columns: dbForm.columns,
        limit: dbForm.limit,
      });
      const normalized = normalizeDbQueryResult(
        result,
        dbForm.columns,
        dbForm.category,
        mappedCategory,
        Math.round(performance.now() - startedAt),
      );
      setDbTestResults(normalized.places);
      setDbTestRows(normalized.rows);
      setDbColumnFilters({});
      setDbMapperColumnFilters({});
      setDbTestColumns(normalized.columns);
      setDbTotalCount(normalized.totalCount);
      setDbResponseMs(normalized.responseMs);
      setDbDebug(normalized.debug);
      const countLabel = typeof normalized.totalCount === 'number'
        ? ` / ${normalized.totalCount} találat az adatbázisban`
        : '';
      toast.success(`${normalized.rows.length} sor lekérve: ${dbForm.table}${countLabel}`);
    } catch (error) {
      const message = getErrorMessage(error, 'Adatbázistábla lekérdezési hiba');
      setDbQueryError(message);
      toast.error(message);
    } finally {
      window.clearTimeout(slowTimer);
      setDbSlowQueryNotice(false);
      setDbTestLoading(false);
    }
  }, [dbForm, dbMappedCategory]);

  const updateProvider = useCallback((group: AddressSearchFunctionGroup, provider: AddressSearchProvider) => {
    setFunctionGroupProviders((current) => ({ ...current, [group]: provider }));
  }, []);

  const updateDbColumnFilter = useCallback((column: string, value: string) => {
    setDbColumnFilters((current) => ({ ...current, [column]: value }));
  }, []);

  const updateMapperColumnFilter = useCallback((column: string, value: string) => {
    setDbMapperColumnFilters((current) => ({ ...current, [column]: value }));
  }, []);

  const toggleDbColumn = useCallback((column: string, checked: boolean) => {
    setDbForm((current) => ({
      ...current,
      columns: checked
        ? Array.from(new Set([...current.columns, column]))
        : current.columns.filter((value) => value !== column),
    }));
  }, []);

  const ticketmasterRunState: ProviderRunState = {
    phase: ticketmasterLoading
      ? 'loading'
      : ticketmasterInfo
        ? ticketmasterEvents.length > 0 ? 'success' : 'empty'
        : 'idle',
    message: ticketmasterInfo,
  };
  const seatGeekRunState: ProviderRunState = {
    phase: seatGeekLoading
      ? 'loading'
      : seatGeekInfo
        ? seatGeekEvents.length > 0 ? 'success' : 'empty'
        : 'idle',
    message: seatGeekInfo,
  };

  return {
    navigation: { providerTab, selectProviderTab },
    eventbrite: {
      keyword: eventbriteKeyword,
      events: eventbriteEvents,
      loading: eventbriteLoading,
      error: eventbriteError,
      debugInfo: eventbriteDebug,
      setKeyword: setEventbriteKeyword,
      search: searchEventbrite,
      testToken: testEventbriteToken,
      pullOrganization: pullEventbriteOrganization,
    },
    ticketmaster: {
      params: ticketmasterParams,
      events: ticketmasterEvents,
      loading: ticketmasterLoading,
      runState: ticketmasterRunState,
      setParams: setTicketmasterParams,
      preview: previewTicketmaster,
      sync: syncTicketmaster,
    },
    seatGeek: {
      params: seatGeekParams,
      events: seatGeekEvents,
      loading: seatGeekLoading,
      runState: seatGeekRunState,
      setParams: setSeatGeekParams,
      preview: previewSeatGeek,
      sync: syncSeatGeek,
    },
    feeds: {
      summary: feedSnapshot.summary,
      sources: feedSnapshot.sources,
      runs: feedSnapshot.runs,
      pagination: feedSnapshot.pagination,
      query: feedQuery,
      queryDraft: feedQueryDraft,
      loading: feedLoading,
      actionSourceId: feedActionSourceId,
      error: feedError,
      approvalDrafts: feedApprovalDrafts,
      setQueryDraft: setFeedQueryDraft,
      searchSources: searchFeedSources,
      clearSearch: clearFeedSourceSearch,
      goToPage: goToFeedPage,
      updateApprovalDraft: updateFeedApprovalDraft,
      refresh: refreshFeedStatus,
      probe: probeFeed,
      sync: syncFeed,
      approve: (sourceId: string) => reviewFeed(sourceId, 'approved'),
      disable: (sourceId: string) => reviewFeed(sourceId, 'disabled'),
    },
    providerConfig: {
      providers: functionGroupProviders,
      providerOptions,
      dbConfigs,
      loading: providerLoading,
      dbLoading: dbConfigLoading,
      saving: providerSaving,
      updateProvider,
      saveProvider,
      saveAllProviders,
      reload: loadProviderState,
    },
    databaseConfig: {
      form: dbForm,
      configs: dbConfigs,
      saving: dbConfigSaving,
      queryLoading: dbTestLoading,
      discovery: dbDiscovery,
      discoveryLoading: dbDiscoveryLoading,
      discoveryError: dbDiscoveryError,
      categorySuggestions: dbCategorySuggestions,
      categoryAliases: dbDiscoveryCategoryAliases,
      mappedCategory: dbMappedCategory,
      setForm: setDbForm,
      toggleColumn: toggleDbColumn,
      selectAllColumns: () => setDbForm((current) => ({ ...current, columns: DEFAULT_DB_TEST_COLUMNS })),
      clearColumns: () => setDbForm((current) => ({ ...current, columns: [] })),
      addConfig: addDbConfig,
      removeConfig: removeDbConfig,
      editConfig: editDbConfig,
      runQuery: runDbQuery,
    },
    runStatus: {
      form: dbForm,
      rows: dbTestRows,
      filteredRows: filteredDbTestRows,
      columns: dbTestColumns,
      totalCount: dbTotalCount,
      loading: dbTestLoading,
      executed: dbQueryExecuted,
      error: dbQueryError,
      slow: dbSlowQueryNotice,
      responseMs: dbResponseMs,
      mappedCategory: dbMappedCategory,
      discovery: dbDiscovery,
      debug: dbDebug,
      filters: dbColumnFilters,
      updateFilter: updateDbColumnFilter,
      mapperRows,
      filteredMapperRows,
      mapperColumns,
      mapperFilters: dbMapperColumnFilters,
      updateMapperFilter: updateMapperColumnFilter,
      normalizedPlaces: dbTestResults,
    },
    providerTest: {
      query: testQuery,
      functionGroup: testFunctionGroup,
      results: testResults,
      loading: testLoading,
      activeProviderLabel: getProviderDisplayLabel(functionGroupProviders[testFunctionGroup], dbConfigs),
      setQuery: setTestQuery,
      setFunctionGroup: setTestFunctionGroup,
      run: testProvider,
    },
  };
}

export type ExternalEventsAdminController = ReturnType<typeof useExternalEventsAdminController>;
