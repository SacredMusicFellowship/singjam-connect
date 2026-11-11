-- Migration 195: the song editor's "Suggest improvements" runs the multi-source
-- enrichment in a background function and stores the result here for the
-- editor to review. Read and written only through the API's admin client.
alter table public.songs
  add column if not exists enrichment_proposal jsonb;
