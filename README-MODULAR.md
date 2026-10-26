# SPARTIANS Modular Website (safe first step)

This version separates the existing inline CSS and JavaScript into independent files while preserving the existing HTML structure, app behavior, and Worker API calls.

## Files
- `index.html`: public site markup.
- `admin.html`: admin page markup.
- `css/public.css`: public website design.
- `css/admin.css`: admin studio design.
- `js/public.js`: public site behavior (reads `data.json`).
- `js/admin.js`: admin behavior, GitHub OAuth flow, draft editing and publishing API calls.
- `data.json`: club, coach and player data.
- `images/`: uploaded images.

## Why this is the safest first stage
The original admin code combines player, club, coach, authentication, and publishing logic in one script. This first modular release separates the public/admin styles and scripts without rewriting the authentication or publishing behavior. That reduces the risk of breaking the existing Cloudflare Worker, GitHub token permissions, OAuth callback, or `SESSIONS` binding.

## Upload instructions
1. Download and extract this ZIP on Windows.
2. In your existing `forge-fc` GitHub repository, upload/replace `index.html`, `admin.html`, `data.json`.
3. Upload the new `css/` and `js/` folders and `images/README.txt`.
4. Commit the changes.
5. Wait for GitHub Pages, then test the public site and admin sign-in.
6. Do not replace `worker.js`, change Cloudflare secrets, or alter the `SESSIONS` binding.

## Important
- This is a first-stage modularization, not yet a separate HTML screen for every feature. The current admin tabs remain together so existing login/publishing behavior stays intact.
- To avoid breaking the working site, later iterations can extract the club, theme, players, and auth/publish modules one at a time after the shared assets are verified live.
- `admin.js` must keep its configured `API_BASE` pointing at your current Cloudflare Worker.
