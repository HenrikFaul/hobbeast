export type PinnedHttpsFetch = (
  url: URL,
  init: RequestInit,
  pinnedAddress: string,
  maxBodyBytes: number,
) => Promise<Response>;

export type PinnedHttpsTransportErrorCode =
  | 'transport_unavailable'
  | 'remote_address_mismatch'
  | 'invalid_response'
  | 'headers_too_large'
  | 'body_too_large'
  | 'aborted';

export class PinnedHttpsTransportError extends Error {
  constructor(message: string, readonly code: PinnedHttpsTransportErrorCode) {
    super(message);
    this.name = 'PinnedHttpsTransportError';
  }
}

interface NativeAddress {
  hostname: string;
  port?: number;
  transport?: string;
}

interface NativeConnection {
  readonly remoteAddr?: NativeAddress;
  read(buffer: Uint8Array): Promise<number | null>;
  write(buffer: Uint8Array): Promise<number>;
  close(): void;
}

interface NativeDenoRuntime {
  connect(options: { hostname: string; port: number; transport: 'tcp' }): Promise<NativeConnection>;
  startTls(
    connection: NativeConnection,
    options: { hostname: string; alpnProtocols?: string[] },
  ): Promise<NativeConnection>;
}

const RESPONSE_HEADER_CAP = 64 * 1024;
const RESPONSE_HEADER_COUNT_CAP = 200;
const RESPONSE_LINE_CAP = 8 * 1024;
const RESPONSE_TRAILER_CAP = 16 * 1024;
const REQUEST_HEADER_CAP = 32 * 1024;
const READ_CHUNK_BYTES = 16 * 1024;
const CRLF = new Uint8Array([13, 10]);
const HEADER_END = new Uint8Array([13, 10, 13, 10]);
const encoder = new TextEncoder();
const headerDecoder = new TextDecoder('latin1');

function transportError(message: string, code: PinnedHttpsTransportErrorCode) {
  return new PinnedHttpsTransportError(message, code);
}

function abortError() {
  return transportError('Pinned HTTPS request aborted', 'aborted');
}

function normalizeIpAddress(value: string) {
  let address = value.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%', 1)[0];
  if (address.startsWith('::ffff:') && /^\d+\.\d+\.\d+\.\d+$/.test(address.slice(7))) {
    address = address.slice(7);
  }
  if (!address.includes(':')) {
    const parts = address.split('.');
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part))
      ? parts.map((part) => String(Number(part))).join('.')
      : address;
  }
  try {
    return new URL('http://[' + address + ']/').hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return address;
  }
}

function assertPinnedRemote(connection: NativeConnection, pinnedAddress: string) {
  const actual = normalizeIpAddress(connection.remoteAddr?.hostname || '');
  const expected = normalizeIpAddress(pinnedAddress);
  if (!actual || actual !== expected) {
    throw transportError('TLS connection remote address differs from the validated IP', 'remote_address_mismatch');
  }
}

function indexOfSequence(buffer: Uint8Array, marker: Uint8Array) {
  outer: for (let index = 0; index <= buffer.length - marker.length; index += 1) {
    for (let offset = 0; offset < marker.length; offset += 1) {
      if (buffer[index + offset] !== marker[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function joinedBytes(chunks: Uint8Array[], total: number) {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

class BoundedConnectionReader {
  private buffered = new Uint8Array();

  constructor(private readonly connection: NativeConnection) {}

  private async fill() {
    const chunk = new Uint8Array(READ_CHUNK_BYTES);
    const read = await this.connection.read(chunk);
    if (read === null) return false;
    if (read <= 0) throw transportError('TLS response returned an empty read', 'invalid_response');
    const next = new Uint8Array(this.buffered.byteLength + read);
    next.set(this.buffered);
    next.set(chunk.subarray(0, read), this.buffered.byteLength);
    this.buffered = next;
    return true;
  }

  async readUntil(marker: Uint8Array, maxBytes: number) {
    while (true) {
      const markerIndex = indexOfSequence(this.buffered, marker);
      if (markerIndex >= 0) {
        if (markerIndex > maxBytes) throw transportError('HTTP response metadata exceeds its cap', 'headers_too_large');
        const value = this.buffered.slice(0, markerIndex);
        this.buffered = this.buffered.slice(markerIndex + marker.byteLength);
        return value;
      }
      if (this.buffered.byteLength > maxBytes + marker.byteLength) {
        throw transportError('HTTP response metadata exceeds its cap', 'headers_too_large');
      }
      if (!await this.fill()) throw transportError('HTTP response ended before metadata completed', 'invalid_response');
    }
  }

  async readLine(maxBytes = RESPONSE_LINE_CAP) {
    return this.readUntil(CRLF, maxBytes);
  }

  async readExact(length: number) {
    const result = new Uint8Array(length);
    let offset = 0;
    if (this.buffered.byteLength > 0) {
      const available = Math.min(length, this.buffered.byteLength);
      result.set(this.buffered.subarray(0, available));
      this.buffered = this.buffered.slice(available);
      offset = available;
    }
    while (offset < length) {
      const read = await this.connection.read(result.subarray(offset));
      if (read === null || read <= 0) {
        throw transportError('HTTP response body ended before its declared length', 'invalid_response');
      }
      offset += read;
    }
    return result;
  }

  async readToEof(maxBodyBytes: number) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (this.buffered.byteLength > 0) {
      total = this.buffered.byteLength;
      if (total > maxBodyBytes) throw transportError('HTTP response body exceeds its cap', 'body_too_large');
      chunks.push(this.buffered);
      this.buffered = new Uint8Array();
    }
    while (true) {
      const chunk = new Uint8Array(Math.min(READ_CHUNK_BYTES, maxBodyBytes - total + 1));
      const read = await this.connection.read(chunk);
      if (read === null) break;
      if (read <= 0) throw transportError('TLS response returned an empty read', 'invalid_response');
      total += read;
      if (total > maxBodyBytes) throw transportError('HTTP response body exceeds its cap', 'body_too_large');
      chunks.push(chunk.slice(0, read));
    }
    return joinedBytes(chunks, total);
  }
}

function parseResponseHead(value: Uint8Array) {
  const text = headerDecoder.decode(value);
  const lines = text.split('\r\n');
  const statusMatch = /^HTTP\/1\.[01] ([2-5]\d{2})(?:[ \t]+([^\r\n]*))?$/.exec(lines.shift() || '');
  if (!statusMatch) throw transportError('Invalid HTTP/1.1 status line', 'invalid_response');
  if (lines.length > RESPONSE_HEADER_COUNT_CAP) {
    throw transportError('HTTP response contains too many headers', 'headers_too_large');
  }

  const headers = new Headers();
  const raw = new Map<string, string[]>();
  for (const line of lines) {
    if (!line || /^[ \t]/.test(line)) throw transportError('Invalid folded HTTP response header', 'invalid_response');
    const separator = line.indexOf(':');
    if (separator <= 0) throw transportError('Invalid HTTP response header', 'invalid_response');
    const name = line.slice(0, separator).trim().toLowerCase();
    const headerValue = line.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9!#$%&'*+.^_|~-]+$/.test(name) || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(headerValue)) {
      throw transportError('Unsafe HTTP response header', 'invalid_response');
    }
    headers.append(name, headerValue);
    raw.set(name, [...(raw.get(name) || []), headerValue]);
  }

  return {
    status: Number(statusMatch[1]),
    statusText: statusMatch[2] || '',
    headers,
    raw,
  };
}

function contentLength(raw: Map<string, string[]>) {
  const values = (raw.get('content-length') || [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim());
  if (values.length === 0) return null;
  if (values.some((value) => !/^\d+$/.test(value)) || new Set(values).size !== 1) {
    throw transportError('Ambiguous HTTP Content-Length', 'invalid_response');
  }
  const length = Number(values[0]);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw transportError('Invalid HTTP Content-Length', 'invalid_response');
  }
  return length;
}

function isChunked(raw: Map<string, string[]>) {
  const codings = (raw.get('transfer-encoding') || [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (codings.length === 0) return false;
  if (codings.length !== 1 || codings[0] !== 'chunked') {
    throw transportError('Unsupported HTTP Transfer-Encoding', 'invalid_response');
  }
  return true;
}

async function readChunkedBody(reader: BoundedConnectionReader, maxBodyBytes: number) {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const line = headerDecoder.decode(await reader.readLine());
    const sizeToken = line.split(';', 1)[0].trim();
    if (!/^[0-9a-f]+$/i.test(sizeToken)) throw transportError('Invalid HTTP chunk size', 'invalid_response');
    const sizeBigInt = BigInt('0x' + sizeToken);
    if (sizeBigInt > BigInt(maxBodyBytes - total)) {
      throw transportError('HTTP response body exceeds its cap', 'body_too_large');
    }
    const size = Number(sizeBigInt);
    if (size === 0) {
      let trailerBytes = 0;
      while (true) {
        const trailer = await reader.readLine();
        trailerBytes += trailer.byteLength + CRLF.byteLength;
        if (trailerBytes > RESPONSE_TRAILER_CAP) {
          throw transportError('HTTP response trailers exceed their cap', 'headers_too_large');
        }
        if (trailer.byteLength === 0) break;
        if (trailer[0] === 32 || trailer[0] === 9 || !headerDecoder.decode(trailer).includes(':')) {
          throw transportError('Invalid HTTP response trailer', 'invalid_response');
        }
      }
      return joinedBytes(chunks, total);
    }

    const chunk = await reader.readExact(size);
    const ending = await reader.readExact(CRLF.byteLength);
    if (ending[0] !== CRLF[0] || ending[1] !== CRLF[1]) {
      throw transportError('Invalid HTTP chunk terminator', 'invalid_response');
    }
    chunks.push(chunk);
    total += size;
  }
}

function serializedRequest(url: URL, init: RequestInit) {
  const headers = new Headers(init.headers);
  for (const name of ['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding']) {
    headers.delete(name);
  }
  headers.set('host', url.port && url.port !== '443' ? url.hostname + ':' + url.port : url.hostname);
  headers.set('connection', 'close');
  headers.set('accept-encoding', 'identity');
  const requestTarget = (url.pathname || '/') + url.search;
  const lines = [(init.method || 'GET') + ' ' + requestTarget + ' HTTP/1.1'];
  for (const [name, value] of headers.entries()) lines.push(name + ': ' + value);
  const encoded = encoder.encode(lines.join('\r\n') + '\r\n\r\n');
  if (encoded.byteLength > REQUEST_HEADER_CAP) {
    throw transportError('HTTP request headers exceed their cap', 'headers_too_large');
  }
  return encoded;
}

async function writeAll(connection: NativeConnection, bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = await connection.write(bytes.subarray(offset));
    if (written <= 0) throw transportError('TLS request write failed', 'invalid_response');
    offset += written;
  }
}

async function connectWithAbort(
  promise: Promise<NativeConnection>,
  signal: AbortSignal | null | undefined,
) {
  if (!signal) return promise;
  if (signal.aborted) throw abortError();
  return new Promise<NativeConnection>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((connection) => {
      signal.removeEventListener('abort', onAbort);
      if (settled || signal.aborted) {
        connection.close();
        if (!settled) reject(abortError());
        return;
      }
      settled = true;
      resolve(connection);
    }, (error) => {
      signal.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

export const pinnedHttpsFetch: PinnedHttpsFetch = async (
  url,
  init,
  pinnedAddress,
  maxBodyBytes,
) => {
  const deno = (globalThis as typeof globalThis & { Deno?: NativeDenoRuntime }).Deno;
  if (typeof deno?.connect !== 'function' || typeof deno?.startTls !== 'function') {
    throw transportError('Deno TCP/TLS transport is unavailable', 'transport_unavailable');
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) {
    throw transportError('Invalid response body cap', 'body_too_large');
  }

  let activeConnection: NativeConnection | null = null;
  const signal = init.signal;
  const closeActive = () => {
    try {
      activeConnection?.close();
    } catch {
      // Closing an already-closed connection is harmless during abort races.
    }
  };
  const onAbort = () => closeActive();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const tcp = await connectWithAbort(deno.connect({
      hostname: pinnedAddress,
      port: Number(url.port || 443),
      transport: 'tcp',
    }), signal);
    activeConnection = tcp;
    assertPinnedRemote(tcp, pinnedAddress);

    const tls = await connectWithAbort(deno.startTls(tcp, {
      hostname: url.hostname,
      alpnProtocols: ['http/1.1'],
    }), signal);
    activeConnection = tls;
    assertPinnedRemote(tls, pinnedAddress);
    if (signal?.aborted) throw abortError();

    await writeAll(tls, serializedRequest(url, init));
    const reader = new BoundedConnectionReader(tls);
    const head = parseResponseHead(await reader.readUntil(HEADER_END, RESPONSE_HEADER_CAP));
    const responseInit = { status: head.status, statusText: head.statusText, headers: head.headers };

    // safeFetch handles redirects and HTTP error policy from headers/status;
    // never buffer their bodies inside this transport.
    if (head.status < 200 || head.status >= 300 || head.status === 204 || head.status === 205) {
      return new Response(null, responseInit);
    }

    const chunked = isChunked(head.raw);
    const declaredLength = contentLength(head.raw);
    if (chunked && declaredLength !== null) {
      throw transportError('HTTP response contains both Transfer-Encoding and Content-Length', 'invalid_response');
    }

    let body: Uint8Array;
    if (chunked) {
      body = await readChunkedBody(reader, maxBodyBytes);
      head.headers.delete('transfer-encoding');
    } else if (declaredLength !== null) {
      if (declaredLength > maxBodyBytes) {
        throw transportError('HTTP response body exceeds its cap', 'body_too_large');
      }
      body = await reader.readExact(declaredLength);
    } else {
      body = await reader.readToEof(maxBodyBytes);
    }
    head.headers.delete('connection');
    return new Response(body, { status: head.status, statusText: head.statusText, headers: head.headers });
  } catch (error) {
    if (signal?.aborted && !(error instanceof PinnedHttpsTransportError && error.code === 'body_too_large')) {
      throw abortError();
    }
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    closeActive();
  }
};
