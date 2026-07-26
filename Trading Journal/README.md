# TRADEDESK — Trading Journal

A personal trading journal: weekly/monthly stats, a P&L calendar with daily
review notes, risk:reward tracking, trade screenshots, and pinned monthly
tabs. Data is saved in your browser's `localStorage` — private to you, no
backend, no account.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

## Host it on GitHub Pages

1. **Create a new GitHub repo** (e.g. `trading-journal`), and don't
   initialize it with a README (you already have one here).

2. **Push this project to it:**

   ```bash
   cd trading-journal-site
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

3. **Turn on GitHub Pages with Actions:**
   - In your repo on GitHub, go to **Settings → Pages**.
   - Under "Build and deployment", set **Source** to **GitHub Actions**.
   - That's it — the included workflow (`.github/workflows/deploy.yml`)
     will build the site and deploy it automatically every time you push
     to `main`.

4. Wait a minute or two, then check the **Actions** tab for the run. Once
   it's green, your site is live at:

   ```
   https://<your-username>.github.io/<your-repo>/
   ```

   (You'll also see the exact URL under Settings → Pages once it's deployed.)

## Updating the site later

Any time you edit `src/App.jsx` and push to `main`, GitHub Actions rebuilds
and redeploys automatically — no manual steps needed.

## About your data

Trades, screenshots, and daily notes are stored in your browser's
`localStorage`, scoped to whichever device/browser you use the site from.
That means:

- Nothing is sent to a server — it's private by default.
- Data won't follow you between devices or browsers (e.g. phone vs. laptop)
  unless you add sync yourself.
- Clearing your browser's site data for this URL will erase your journal —
  worth keeping a periodic export in mind if you'd like one added.
