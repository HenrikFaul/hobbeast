import { MILESTONES } from '../constants/sync.ts';
import { summarizeRows } from '../utils/summarize.ts';
import type { PlaceRow } from '../types/index.ts';
import { upsertCatalogChunk } from '../repositories/catalogRepo.ts';

export async function writeCatalogRows(params: {
  supabaseAdmin: any;
  rows: PlaceRow[];
  runId: string;
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>;
}) {
  const { supabaseAdmin, rows, runId, appendLog } = params;
  let rowsWrittenThisRun = 0;

  if (rows.length === 0) {
    await appendLog('info', 'catalog_write_skipped', 'Catalog write skipped because no rows remained after filtering', {}, runId);
    return 0;
  }

  const chunkSize = 250;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);

    await appendLog('info', MILESTONES.CATALOG_WRITE_ATTEMPT, 'Attempting catalog write', {
      chunk_index: index / chunkSize,
      write_count: chunk.length,
      sample: summarizeRows(chunk),
    }, runId);

    const { data: writeData, error: writeError } = await upsertCatalogChunk(supabaseAdmin, chunk);
    if (writeError) {
      await appendLog('error', 'catalog_write_error', 'Catalog write failed', {
        chunk_index: index / chunkSize,
        attempted_count: chunk.length,
        message: writeError.message ?? null,
        details: writeError.details ?? null,
        hint: writeError.hint ?? null,
        code: writeError.code ?? null,
      }, runId);
      throw writeError;
    }

    const writtenNow = Array.isArray(writeData) ? writeData.length : 0;
    rowsWrittenThisRun += writtenNow;

    await appendLog('info', MILESTONES.CATALOG_WRITE_DONE, 'Catalog write finished successfully', {
      chunk_index: index / chunkSize,
      attempted_count: chunk.length,
      returned_count: writtenNow,
      sample: Array.isArray(writeData) ? writeData.slice(0, 3) : [],
    }, runId);
  }

  return rowsWrittenThisRun;
}
