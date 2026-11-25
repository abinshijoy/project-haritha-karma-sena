# GitHub Setup, Push, and PR Management

This environment currently does **not** have `git` or GitHub CLI (`gh`) installed, so the repo cannot be pushed from here automatically. Use this guide on a machine with Git/GitHub access.

## 1. Create the GitHub repository

1. Create a new repo on GitHub named `project-haritha-karma-sena` (or your preferred name).
2. Do **not** initialize with files if you plan to push this existing scaffold.
3. Copy the repo URL (HTTPS or SSH).

## 2. Initialize and push locally

From the project root (`Default Project` or wherever you place this code):

```bash
git init
git add .
git commit -m "chore: initial backend scaffold for haritha karma sena"
git branch -M main
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```

If using GitHub CLI:

```bash
gh repo create project-haritha-karma-sena --private --source=. --remote=origin --push
```

## 3. Branch and PR workflow

- Protect `main`: require PR, at least 1 review, passing CI.
- Use feature branches:
  - `feat/auth-otp`
  - `feat/billing-api`
  - `fix/points-ledger`
- PR checklist:
  - clear description and linked issue
  - schema/migration notes included
  - tests/lint run
  - no secrets committed

## 4. Managing pull requests

### With GitHub web UI
- Open PRs from feature branches into `main`.
- Use the included PR template (`.github/pull_request_template.md`).
- Request reviewers, address comments, squash/merge when green.

### With GitHub CLI
```bash
# create PR
gh pr create --base main --head feat/auth-otp --title "feat: add OTP auth endpoints" --body "..."

# list PRs
gh pr list

# review
gh pr checkout <number>
gh pr review <number> --approve
# or request changes
gh pr review <number> --request-changes --body "..."

# merge
gh pr merge <number> --squash --delete-branch
```

## 5. Recommended repo settings

- **Branch protection** on `main`: required status checks (`CI`), no force push.
- **Secrets** (Actions/deploy): `DATABASE_URL`, `JWT_SECRET`, provider keys.
- **Environments**: `staging`, `production` with approval gates.
- **Issue labels**: `bug`, `feature`, `backend`, `schema`, `auth`, `urgent`.

## 6. CI

A starter workflow is included at `.github/workflows/ci.yml`. It installs dependencies and runs basic checks for the backend. Extend it with tests, migrations, and linting as the project grows.
