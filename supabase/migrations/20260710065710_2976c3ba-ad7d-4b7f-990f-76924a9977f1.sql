REVOKE ALL ON FUNCTION public.default_branch_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.default_branch_user_id() FROM anon;
REVOKE ALL ON FUNCTION public.default_branch_user_id() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.default_branch_user_id() TO service_role;