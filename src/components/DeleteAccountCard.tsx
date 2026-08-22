import { useCallback, useEffect, useState } from 'react';
import { Clock3, Download, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  buildDataRequestIdempotencyKey,
  DATA_EXPORT_SCOPES,
  downloadJsonExport,
  prepareMyDataExport,
  requestMyDataSubjectAction,
} from '@/features/identity/privacyRuntimeRepository';

interface OpenDataRequest {
  id: string;
  request_type: string;
  status: string;
  grace_period_ends_at: string | null;
  export_expires_at: string | null;
}

export function DeleteAccountCard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<OpenDataRequest[]>([]);
  const [working, setWorking] = useState<'export' | 'deletion' | 'cancel' | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [exportScopes, setExportScopes] = useState<string[]>(DATA_EXPORT_SCOPES.map((scope) => scope.value));

  const loadRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from('data_subject_requests')
      .select('id,request_type,status,grace_period_ends_at,export_expires_at')
      .eq('user_id', user.id)
      .in('status', ['requested', 'identity_verified', 'processing', 'ready', 'retention_hold'])
      .order('requested_at', { ascending: false });
    if (error) setLoadError(true);
    else setRequests(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const requestAction = async (requestType: 'export' | 'deletion') => {
    if (!user) return;
    if (requestType === 'export' && exportScopes.length === 0) {
      toast.error('Válassz legalább egy exportálható adatkört.');
      return;
    }
    setWorking(requestType);
    const requestResult = await requestMyDataSubjectAction(
      requestType,
      requestType === 'export' ? exportScopes : [],
      buildDataRequestIdempotencyKey(user.id, requestType),
    );
    if (requestResult.error || !requestResult.data) {
      toast.error('A kérés rögzítése sikertelen.');
    } else {
      if (requestType === 'export') {
        const exportResult = await prepareMyDataExport(requestResult.data.request_id);
        if (exportResult.error || !exportResult.data) {
          toast.warning('Az exportkérés elkészült, de a fájl most nem tölthető le. Később újrapróbálhatod.');
        } else {
          downloadJsonExport(exportResult.data);
          toast.success('A scope-olt JSON adatexport letöltése elindult.');
        }
      } else {
        toast.success('A törlési kérelmet rögzítettük; a 14 napos türelmi idő alatt visszavonható.');
      }
      await loadRequests();
    }
    setWorking(null);
  };

  const downloadExistingExport = async (requestId: string) => {
    setWorking('export');
    const exportResult = await prepareMyDataExport(requestId);
    if (exportResult.error || !exportResult.data) toast.error('Az export most nem készíthető el.');
    else {
      downloadJsonExport(exportResult.data);
      toast.success('A JSON adatexport letöltése elindult.');
    }
    setWorking(null);
  };

  const cancelDeletion = async () => {
    setWorking('cancel');
    const { error } = await supabase.rpc('cancel_my_data_subject_action', { _request_type: 'deletion' });
    if (error) toast.error('A törlési kérelem visszavonása sikertelen.');
    else {
      toast.success('A törlési kérelmet visszavontuk.');
      await loadRequests();
    }
    setWorking(null);
  };

  const deletion = requests.find((request) => request.request_type === 'deletion');
  const dataExport = requests.find((request) => request.request_type === 'export');
  const exportExpired = dataExport?.status === 'ready'
    && dataExport.export_expires_at !== null
    && new Date(dataExport.export_expires_at).getTime() <= Date.now();
  const exportDownloadable = Boolean(dataExport)
    && !exportExpired
    && ['requested', 'identity_verified', 'ready'].includes(dataExport?.status || '');

  return (
    <Card className="rounded-2xl border shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 font-display">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          Saját adataim
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Adatvédelmi kérelmek betöltése…</div>}
        {loadError && <div className="space-y-2" role="alert"><p className="text-sm text-destructive">A korábbi kérelmek most nem tölthetők be.</p><Button type="button" variant="outline" onClick={() => void loadRequests()}>Újrapróbálom</Button></div>}
        {!loading && !loadError && <>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Kérhetsz géppel olvasható adatexportot. Az elkészült csomag időkorlátosan lesz elérhető.</p>
          <fieldset className="space-y-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-semibold">Export adatkörök</legend>
            {DATA_EXPORT_SCOPES.map((scope) => <label key={scope.value} className="flex min-h-10 items-center gap-3 text-sm"><Checkbox checked={exportScopes.includes(scope.value)} onCheckedChange={(checked) => setExportScopes((current) => checked ? [...new Set([...current, scope.value])] : current.filter((item) => item !== scope.value))} /><span>{scope.label}</span></label>)}
          </fieldset>
          {dataExport && !exportExpired ? (
            <div className="flex flex-col gap-2">
              <Badge className="w-fit" variant="secondary">Export: {dataExport.status}</Badge>
              {exportDownloadable ? (
                <Button type="button" className="w-full rounded-xl" variant="outline" disabled={working !== null} onClick={() => void downloadExistingExport(dataExport.id)}>{working === 'export' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}JSON export letöltése</Button>
              ) : (
                <p className="text-sm text-muted-foreground" role="status">Az export előkészítése vagy megőrzési ellenőrzése folyamatban van.</p>
              )}
            </div>
          ) : (
            <Button type="button" className="w-full rounded-xl" variant="outline" disabled={working !== null || exportScopes.length === 0} onClick={() => void requestAction('export')}>
              {working === 'export' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{exportExpired ? 'Új export készítése' : 'Adataim exportálása'}
            </Button>
          )}
        </div>

        <div className="border-t pt-5">
          {deletion ? (
            <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 font-medium text-destructive"><Clock3 className="h-4 w-4" />Törlési kérelem: {deletion.status}</div>
              <p className="text-sm text-muted-foreground">
                {deletion.grace_period_ends_at
                  ? `Visszavonható eddig: ${new Date(deletion.grace_period_ends_at).toLocaleString('hu-HU')}.`
                  : 'A kérelem feldolgozás alatt áll.'}
              </p>
              {['requested', 'identity_verified'].includes(deletion.status) && (
                <Button type="button" className="w-full rounded-xl" variant="outline" disabled={working !== null} onClick={() => void cancelDeletion()}>
                  <RotateCcw className="mr-2 h-4 w-4" />Törlési kérelem visszavonása
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">A fióktörlés 14 napos türelmi idővel indul. A jogszabályi vagy moderációs megőrzési kivételeket külön kezeljük.</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" className="w-full rounded-xl" disabled={working !== null}><Trash2 className="mr-2 h-4 w-4" />Törlési kérelem indítása</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Elindítod a fióktörlést?</AlertDialogTitle>
                    <AlertDialogDescription>A kérelmet azonnal rögzítjük, de 14 napig visszavonhatod. Ezután az alkalmazható megőrzési szabályok szerint anonimizáljuk vagy töröljük az adatokat.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Mégsem</AlertDialogCancel><AlertDialogAction onClick={() => void requestAction('deletion')}>Kérelem indítása</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
        </>}
      </CardContent>
    </Card>
  );
}
