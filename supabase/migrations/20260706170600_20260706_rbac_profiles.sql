/*
# RBAC: Add user profiles table with role and status

1. Purpose
- Implements Role-Based Access Control (RBAC) for the Pura boutique management system.
- Tracks user roles (admin, staff) and account status (active, inactive).
- Admins can manage team members through a dedicated interface.

2. New Tables
- `profiles`
  - `id` (uuid, primary key) — references auth.users
  - `email` (text, unique, not null) — synced from auth.users
  - `name` (text) — display name
  - `role` (text, not null, default 'staff') — 'admin' or 'staff'
  - `status` (text, not null, default 'active') — 'active' or 'inactive'
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

3. Security
- Enable RLS on `profiles`.
- All authenticated users can read profiles (to check roles).
- Only admins can insert/update profiles (for team management).
- Profile is auto-created on user signup via trigger.

4. Triggers
- `handle_new_user` trigger: auto-creates profile after auth.users insert.
- First user becomes admin automatically.

5. Functions
- `is_admin()` helper: checks if current user has admin role.
- `is_active()` helper: checks if current user has active status.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND status = 'active'
  );
$$;

-- Policy: All authenticated users can read profiles (needed for role checks)
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;
CREATE POLICY "Authenticated users can read profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can insert profiles (team management)
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (is_admin());

-- Policy: Only admins can update profiles (team management)
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles"
ON profiles FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Policy: Users can update their own profile name (limited self-service)
DROP POLICY IF EXISTS "Users can update own name" ON profiles;
CREATE POLICY "Users can update own name"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND email = (SELECT email FROM profiles WHERE id = auth.uid()));

-- Trigger: Update timestamp on profile change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Function: Auto-create profile for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_count integer;
  user_role text;
BEGIN
  -- Check if this is the first user (make them admin)
  SELECT COUNT(*) INTO user_count FROM profiles;
  
  IF user_count = 0 THEN
    user_role := 'admin';
  ELSE
    user_role := 'staff';
  END IF;
  
  -- Insert profile
  INSERT INTO profiles (id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    user_role,
    'active'
  );
  
  RETURN NEW;
END;
$$;

-- Trigger: Create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Create index for faster role checks
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
