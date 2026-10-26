# Forge FC — GitHub Pages + visual admin studio

This project contains:
- `index.html`: public, responsive squad dashboard.
- `data.json`: published club, coach, and player data.
- `admin.html`: visual admin GUI for authorized staff.
- `worker.js`: secure publishing API; GitHub write token stays server-side.
- `wrangler.toml`: Cloudflare Worker configuration template.
- `images/`: put club photos here or upload them through Admin Studio.

## Architecture (important)

GitHub Pages is static and cannot securely write back to its repository. The admin UI therefore calls a Cloudflare Worker. Staff sign in with GitHub OAuth; the Worker checks their GitHub username against `STAFF_LOGINS`. The Worker stores a fine-grained GitHub token as a server-side secret and commits `data.json` and uploaded images through GitHub's Contents API.

Never put a GitHub PAT, OAuth client secret, or other secret in `admin.html`, `index.html`, `data.json`, or a public GitHub repository.

## 1. Publish the public website to GitHub Pages

1. Create a GitHub repository, e.g. `my-club-website`.
2. Upload `index.html`, `data.json`, and the `images/` folder.
3. In the repository, open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Verify the public URL works, including `data.json`.

## 2. Create a GitHub OAuth App for staff identity

1. Open GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set Homepage URL to your deployed Worker origin, e.g. `https://forge-fc-publisher.YOUR-SUBDOMAIN.workers.dev`.
3. Set Authorization callback URL to `https://forge-fc-publisher.YOUR-SUBDOMAIN.workers.dev/auth/callback`.
4. Save the Client ID and generate a Client Secret. These are Worker secrets, not frontend values.

Staff need GitHub accounts. Add their exact GitHub usernames to `STAFF_LOGINS` in `wrangler.toml`. Also grant each staff member appropriate repository access if they should be able to edit the repository directly; for GUI publishing, the Worker token performs the commit.

## 3. Create a fine-grained GitHub publishing token

Create a **fine-grained personal access token** restricted to this one repository:
- Repository access: only `my-club-website`
- Repository permissions: **Contents: Read and write**; **Metadata: Read-only** (normally selected automatically)
- Do not grant administration, workflow, issues, or organization permissions unless you separately need them.

Treat this token like a password. It belongs only in the Worker secret `GITHUB_TOKEN`.

## 4. Deploy the Cloudflare Worker

You need a Cloudflare account and Node.js/npm on your computer.

1. Install Wrangler:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
2. Create a KV namespace:
   ```bash
   wrangler kv namespace create SESSIONS
   ```
3. Copy the returned namespace ID into `wrangler.toml`.
4. Edit the non-secret variables in `wrangler.toml`:
   - `GITHUB_OWNER`
   - `GITHUB_REPO`
   - `GITHUB_BRANCH`
   - `ADMIN_ORIGIN` — exact URL to `admin.html`, e.g. `https://YOUR_USERNAME.github.io/my-club-website/admin.html`
   - `PUBLIC_ORIGIN` — site origin only, e.g. `https://YOUR_USERNAME.github.io`
   - `STAFF_LOGINS` — comma-separated GitHub usernames allowed to use the admin UI
5. Set secrets from your terminal:
   ```bash
   wrangler secret put GITHUB_TOKEN
   wrangler secret put GITHUB_OAUTH_CLIENT_ID
   wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
   ```
   Paste the relevant values when prompted. Do not write secret values in `wrangler.toml`.
6. Deploy:
   ```bash
   wrangler deploy
   ```
7. Copy the deployed Worker URL. In `admin.html`, replace:
   ```js
   const API_BASE = "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev";
   ```
   with the actual HTTPS Worker URL. Commit that `admin.html` change to GitHub.

The OAuth App callback URL must exactly match the Worker URL and `/auth/callback`.

## 5. First admin session

1. Open `admin.html` from your GitHub Pages URL.
2. Click **Sign in with GitHub**.
3. Authorize the OAuth app. The Worker checks the account username against `STAFF_LOGINS`.
4. On successful login, the admin page loads the published `data.json`.
5. Edit players, coach, or club settings. Changes remain a draft in the current page until you click **Publish to GitHub**.
6. Upload photos using the image input. They are queued and committed under `images/` when you publish.
7. Confirm the public website reflects the changes after GitHub Pages updates.

## Features

- Add/edit/delete player profiles with name, jersey, position, overall rating, nationality, age, strengths, weaknesses, and six attributes.
- Upload player and coach portraits; uploaded images are staged and published with the data.
- Edit club branding, season, match count, market value, coach details and formation.
- Position filters and search on the public site.
- Player profile modals.
- JSON export/import for backups.
- Version SHA check helps prevent overwriting changes another staff member published first.
- Local SVG silhouettes are used when a portrait is missing or broken.

## Security and operational notes

- The Worker allowlist is the primary app-level staff gate. Only usernames in `STAFF_LOGINS` can obtain a session.
- The session token returned in the URL fragment is an opaque, expiring app session ID, not a GitHub credential. The admin UI moves it into `sessionStorage` and removes it from the address bar.
- Use HTTPS only. Keep Worker secrets private and rotate them if exposed.
- Restrict the GitHub token to the single website repository.
- Staff should use individual GitHub accounts; do not share one login.
- The version check detects an update to `data.json` made before publish. For best results, ask staff to reload after a publish conflict. Uploading several images uses separate GitHub commits, followed by the data commit.
- Upload limit is 4 MB per image and 20 images per publish. Keep photos compressed for fast page loads.
- JSON import replaces the current draft. Validate imported backups before publishing.
- The admin UI is not an image editor and does not remove old images from Git history when a photo is replaced.
- If you use a custom domain, set `PUBLIC_ORIGIN` and `ADMIN_ORIGIN` to those exact origins.
- OAuth Apps can request broader scopes than ideal; this app uses `read:user user:email` only to identify the staff account. Repository writes use the separate fine-grained Worker token.

## Troubleshooting

- **CORS / failed fetch:** check `PUBLIC_ORIGIN` matches the public site origin exactly (no path, no trailing slash).
- **Sign-in redirects but returns an error:** check the OAuth callback URL, Client ID/Secret, and `STAFF_LOGINS`.
- **403 from GitHub:** verify the fine-grained token has Contents read/write access to the right repository and has not expired.
- **409 conflict:** another staff member published first. Click Reload published version, reapply your changes, and publish again.
- **Missing photo:** check exact case-sensitive filename and that the uploaded image path begins with `images/`.
- **Site data not loading:** confirm `data.json` is deployed beside `index.html`.
