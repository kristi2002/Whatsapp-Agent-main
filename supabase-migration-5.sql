-- Migration 5 — allow 'online' as an appointment source (self-service booking). Idempotent.
alter table appointments drop constraint if exists appointments_source_check;
alter table appointments add constraint appointments_source_check
  check (source in ('whatsapp', 'gestionale', 'phone', 'online'));
