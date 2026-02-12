-- Use Broadcast instead of Postgres Changes for leaderboard updates (scalable, no list_changes).
-- When user_ebucks_balance changes, broadcast to channel leaderboard:<team_number> so clients
-- subscribed to that team's channel can refresh the leaderboard.

CREATE OR REPLACE FUNCTION public.notify_leaderboard_changes()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'leaderboard:' || COALESCE(NEW.team_number, OLD.team_number),
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER user_ebucks_balance_leaderboard_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.user_ebucks_balance
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_leaderboard_changes();
