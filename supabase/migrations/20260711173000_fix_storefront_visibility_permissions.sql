-- Repair deployments where the visibility migration ran before its required
-- base-column grants were added. The public view is security-invoker.
GRANT SELECT (show_header_name, show_hero_title, show_hero_about, show_footer_name)
  ON public.business_settings TO anon;
