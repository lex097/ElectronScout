-- Fix log_audit: user_id FK references profiles.id, but custom JWT has sub=team_id.
-- Only set user_id when it exists in profiles; otherwise use NULL.
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- auth.uid() with custom JWT returns team_id (sub), not a user - not in profiles
  SELECT id INTO v_user_id FROM profiles WHERE id = auth.uid() LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (team_id, user_id, action, table_name, record_id, old_data)
    VALUES (OLD.team_id, v_user_id, 'delete', TG_TABLE_NAME, OLD.id::TEXT, to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (team_id, user_id, action, table_name, record_id, old_data, new_data)
    VALUES (NEW.team_id, v_user_id, 'update', TG_TABLE_NAME, NEW.id::TEXT, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (team_id, user_id, action, table_name, record_id, new_data)
    VALUES (NEW.team_id, v_user_id, 'insert', TG_TABLE_NAME, NEW.id::TEXT, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;
