-- Script per aggiungere la colonna note_verifica e forzare il reload dello schema
-- Da eseguire nell'SQL Editor di Supabase

-- 1. Aggiungi la colonna se non esiste
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clienti' 
        AND column_name = 'note_verifica'
    ) THEN
        ALTER TABLE clienti ADD COLUMN note_verifica text DEFAULT '';
        RAISE NOTICE 'Colonna note_verifica aggiunta con successo';
    ELSE
        RAISE NOTICE 'Colonna note_verifica già esistente';
    END IF;
END $$;

-- 2. Aggiungi commento per documentazione
COMMENT ON COLUMN clienti.note_verifica IS 
'Note di verifica del cliente. Campo utilizzato per annotazioni durante il processo di adeguata verifica.';

-- 3. Forza il reload dello schema di PostgREST
NOTIFY pgrst, 'reload schema';

-- 4. Verifica che la colonna sia presente
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'clienti' 
AND column_name = 'note_verifica';
