-- Add an optional recipient to handoffs.
-- Existing records remain valid with NULL recipients.
-- This alters an existing table; preserve its current grants and RLS policies.
ALTER TABLE public.handoffs
ADD COLUMN IF NOT EXISTS recipient text;

COMMENT ON COLUMN public.handoffs.recipient IS
'Optional person the handoff is intended for; plain text to match the app''s current task-assignee model.';
