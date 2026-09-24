-- Idempotent RLS + revoke for Prisma app tables.
-- Missing anon/authenticated roles (local Docker) must not fail.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'Reel',
    'CreatorProfile',
    'ProfileRevision',
    'ReelContextSnapshot',
    'ThoughtCreateKey',
    'Take',
    'TranscriptRevision',
    'Job',
    'AnalysisResult',
    'Criterion',
    'AiCall',
    'Review',
    'Question',
    'Answer',
    'ScriptVersion',
    'ScriptDraft',
    'DialogueThread',
    'DialogueMessage',
    'CompareResult'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

DO $$
DECLARE
  tbl text;
  role_name text;
  tables text[] := ARRAY[
    'Reel',
    'CreatorProfile',
    'ProfileRevision',
    'ReelContextSnapshot',
    'ThoughtCreateKey',
    'Take',
    'TranscriptRevision',
    'Job',
    'AnalysisResult',
    'Criterion',
    'AiCall',
    'Review',
    'Question',
    'Answer',
    'ScriptVersion',
    'ScriptDraft',
    'DialogueThread',
    'DialogueMessage',
    'CompareResult'
  ];
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, role_name);
      END LOOP;
    END IF;
  END LOOP;
END $$;
