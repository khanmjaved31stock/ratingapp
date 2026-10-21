# CI/CD Setup

Repo me do workflows hain:

- `.github/workflows/ci.yml` — har **pull request** par lint + test + build chalata hai.
- `.github/workflows/deploy.yml` — `main` par **push** hone par verify karke production server
  par auto-deploy karta hai (git pull → npm ci → build → pm2 restart → health check).

## Ek dafa ka setup

### 1. GitHub Secrets add karein

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Value |
|--------|-------|
| `SSH_HOST` | `2.58.203.217` |
| `SSH_USER` | `root` |
| `SSH_PORT` | `22` |
| `SSH_PRIVATE_KEY` | Server par `/root/.ssh/github_deploy` ki **private key** (poori `-----BEGIN...END-----` samet) |

### 2. Deploy key verify karein (server par, ek dafa)

Server par `/root/.ssh/authorized_keys` me ye public key honi chahiye:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAs0ciW1Hec/uJJCjD2YlxiLqUweS3UpCbMVPJlckZDh github-actions-deploy
```

Agar na ho:

```bash
cat /root/.ssh/github_deploy.pub >> /root/.ssh/authorized_keys
```

### 3. Server par app tayyar (already done)

- App dir: `/var/www/ratewell/Rating-earning`
- `.env.local` (gitignored) wahi rehna chahiye — deploy use touch nahi karta
- pm2 app name: `ratewell`

## Deploy kaise hota hai

`main` par merge/push → GitHub Actions:

1. `npm ci` → `npm run lint` → `npm test` → `npm run build`
2. Pass hone par SSH se server par jaakar: `git reset --hard origin/main` → `npm ci` → `npm run build` → `pm2 restart ratewell` → `pm2 save` → health check `curl /api/terms`

## Manual deploy (backup)

```bash
cd /var/www/ratewell/Rating-earning
git pull origin main
npm ci
npm run build
pm2 restart ratewell --update-env && pm2 save
```

## Rollback

```bash
cd /var/www/ratewell/Rating-earning
git log --oneline -10
git reset --hard <good-commit>
npm ci && npm run build
pm2 restart ratewell
```
