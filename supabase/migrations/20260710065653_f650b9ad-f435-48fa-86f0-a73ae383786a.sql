CREATE OR REPLACE FUNCTION public.default_branch_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT created_by INTO v_owner FROM public.brands WHERE id = NEW.brand_id;
    NEW.user_id := COALESCE(v_owner, auth.uid());
  END IF;
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required on branches';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branches_default_user ON public.branches;
CREATE TRIGGER trg_branches_default_user
BEFORE INSERT ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.default_branch_user_id();