# Boutq CI/CD and Release Safety Guide

This document outlines the Continuous Integration (CI) architecture, branch protection settings, job diagnostic procedures, and release rollback protocols for the Boutq platform.

---

## 1. CI Pipeline Overview

The CI pipeline is implemented via GitHub Actions in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It automatically triggers on:
- Every Pull Request targeting the `main` branch.
- Every direct push to the `main` branch.

### Jobs & Responsibilities

1. **`validate` (Codebase Validation & Unit Tests)**
   - **Steps**:
     - `npm ci` (reproducible dependency installation)
     - `npm run format:check` (Prettier code formatting validation)
     - `npm run typecheck` (TypeScript type checking)
     - `npm run lint` (ESLint validation with suppression checks)
     - `npm run test` (Vitest unit tests)
   - **Local Command**: `npm run check`

2. **`build` (Production Build Validation)**
   - **Steps**:
     - `npm ci`
     - `npm run build` (Vite / TanStack Start server and client bundling)
   - **Local Command**: `npm run build`

3. **`playwright-smoke` (Browser Smoke Tests)**
   - **Steps**:
     - Installs Chromium browser binaries.
     - Executes end-to-end smoke test suite via Playwright.
     - On failure, automatically uploads test trace and HTML report artifacts.
   - **Local Command**: `npx playwright test`

4. **`supabase-migrations` (SQL Migration Integrity)**
   - **Steps**:
     - Spawns an ephemeral PostgreSQL 15 container in GitHub Actions.
     - Sequentially executes all SQL migration scripts in `supabase/migrations/`.
     - Validates that SQL syntax, DDL statements, and schema changes apply without errors.

5. **`security-scan` (Vulnerability & Secret Scanning)**
   - **Steps**:
     - `npm audit --audit-level=high`
     - `gitleaks` automated scan to prevent committing secret keys, API tokens, or credentials.

---

## 2. Local Validation & Diagnostics

Developers must verify all checks locally before pushing or opening a pull request.

```bash
# Run all core checks (typecheck, lint, format:check, test)
npm run check

# Verify production build compilation
npm run build

# Run Playwright browser tests
npx playwright test
```

### Diagnosing CI Failures

- **Format Failures (`format:check`)**:
  - Run `npm run format` locally to format all modified files with Prettier, then commit the result.
- **Type Errors (`typecheck`)**:
  - Run `npm run typecheck` to see exact file lines with missing types or signature mismatches.
- **Lint Failures (`lint`)**:
  - Run `npm run lint` to review ESLint warnings/errors.
- **Playwright Test Failures (`playwright-smoke`)**:
  - Download the `playwright-report` artifact from the failed GitHub Actions run.
  - Inspect trace files with `npx playwright show-trace trace.zip`.
- **Migration Errors (`supabase-migrations`)**:
  - Check the output log for the specific file name in `supabase/migrations/*.sql` that threw a SQL syntax or execution error.

---

## 3. Required GitHub Branch Protection Rules

To prevent broken code or unvalidated migrations from entering `main`, configure the following GitHub branch protection settings for the `main` branch under **Repository Settings -> Branches -> Branch Protection Rules**:

1. **Require a pull request before merging**:
   - Require at least 1 approval.
   - Dismiss stale pull request approvals when new commits are pushed.
2. **Require status checks to pass before merging**:
   - Search and select the required CI status checks:
     - `Codebase Validation & Unit Tests`
     - `Production Build Validation`
     - `Playwright Browser Smoke Tests`
     - `Validate Supabase SQL Migrations`
     - `Security Vulnerability & Secret Scan`
   - Require branches to be up to date before merging.
3. **Do not allow bypassing the above settings**:
   - Enable for administrators.
4. **Restrict force pushes & deletions**:
   - Check **Block force pushes**.
   - Check **Prevent branch deletion**.

---

## 4. Release & Rollback Procedures

Deployment is strictly separated from validation. Validating a PR does not automatically deploy code. Production deployments require deliberate deployment commands.

### Production Deployment Checklist

1. Verify that all CI checks on `main` have passed cleanly.
2. Ensure environment secrets (Supabase keys, R2 keys, Tap payments secrets) are configured in Cloudflare Workers / Wrangler dashboard environment variables.
3. Apply pending Supabase production migrations (if applicable) before deploying frontend server code that depends on new database schema objects.
4. Trigger production deploy:
   ```bash
   npm run deploy
   ```

### Rollback Checklist

#### A. Cloudflare Workers / Frontend Rollback
Cloudflare Workers maintains a versioned deployment history. If a deployment causes runtime issues:

1. List recent worker deployments:
   ```bash
   npx wrangler deployments list
   ```
2. Rollback worker to the last known stable deployment ID:
   ```bash
   npx wrangler rollback <DEPLOYMENT_ID>
   ```
3. Verify worker health and status logs:
   ```bash
   npx wrangler tail
   ```

#### B. Database Migration Rollback Strategy
SQL migrations in `supabase/migrations/` should be designed to be backwards-compatible whenever possible (e.g. additive column additions before removing deprecated columns).

1. If a migration failure occurs:
   - Identify the specific migration file that caused the regression.
   - Apply a new forward migration script in `supabase/migrations/` that safely reverts or fixes the schema change (e.g., dropping modified constraints or reverting RPC definitions).
2. Never modify or delete previously committed migration files that have already been applied to production environments.

#### C. Secret & Asset Safeguards
- Never place secrets in source code, committed `.env` files, browser bundles, or test fixtures.
- Private receipts and documents are stored in Cloudflare R2 private bucket with presigned URLs only; public media assets are served via R2 public bucket.
