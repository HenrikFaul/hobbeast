-- pg_net verification stub.
-- Mirrors the real net.http_post/net.http_get signatures so migrations that
-- schedule Edge Function callbacks can be replayed locally without performing
-- any outbound request. Calls are recorded so a test can assert on them.

create schema if not exists net;

create table net.stub_calls (
  id bigserial primary key,
  method text not null,
  url text not null,
  body jsonb,
  params jsonb,
  headers jsonb,
  timeout_milliseconds integer,
  called_at timestamptz not null default now()
);

create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language plpgsql
as $$
declare
  new_id bigint;
begin
  insert into net.stub_calls (method, url, body, params, headers, timeout_milliseconds)
  values ('POST', url, body, params, headers, timeout_milliseconds)
  returning id into new_id;
  return new_id;
end;
$$;

create function net.http_get(
  url text,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language plpgsql
as $$
declare
  new_id bigint;
begin
  insert into net.stub_calls (method, url, params, headers, timeout_milliseconds)
  values ('GET', url, params, headers, timeout_milliseconds)
  returning id into new_id;
  return new_id;
end;
$$;
