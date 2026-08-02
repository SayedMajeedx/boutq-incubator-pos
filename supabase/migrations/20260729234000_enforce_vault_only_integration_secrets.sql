-- Prevent future code paths from accidentally reintroducing plaintext
-- integration credentials after the Vault migration.
ALTER TABLE public.integration_credentials
  DROP CONSTRAINT IF EXISTS integration_credentials_vault_only;

ALTER TABLE public.integration_credentials
  ADD CONSTRAINT integration_credentials_vault_only
  CHECK (api_key IS NULL AND webhook_secret IS NULL);

-- Retire the legacy tenant-callable Gemini secret function if it exists.
DROP FUNCTION IF EXISTS public.get_gemini_credential(uuid);
