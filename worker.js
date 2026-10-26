/*
Forge FC publishing API — Cloudflare Worker.
Required Worker secrets:
  GITHUB_OAUTH_CLIENT_ID
  GITHUB_OAUTH_CLIENT_SECRET
  GITHUB_TOKEN (fine-grained PAT with Contents: Read and write for ONE repository)
Required Worker variables:
  GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, ADMIN_ORIGIN, PUBLIC_ORIGIN, STAFF_LOGINS
Required KV binding:
  SESSIONS -> a Cloudflare KV namespace

Create a GitHub OAuth App:
  Homepage URL: https://YOUR-WORKER-DOMAIN
  Callback URL: https://YOUR-WORKER-DOMAIN/auth/callback

Security model:
- GitHub OAuth authenticates each editor's GitHub account.
- Only usernames listed in STAFF_LOGINS can get an app session.
- GitHub write token stays in Worker secrets, never in browser code.
- Short-lived opaque session IDs are stored in KV and returned in URL fragment.
- Publish checks the base SHA to prevent silently overwriting a newer edit.
*/
const GH_API = "https://api.github.com";
const SESSION_TTL = 8 * 60 * 60;
const STATE_TTL = 10 * 60;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.PUBLIC_ORIGIN || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }
    try {
      if (url.pathname === "/health") return json({ ok: true, service: "Forge FC publisher" }, 200, allowedOrigin);
      if (url.pathname === "/auth/login" && request.method === "GET") return await login(url, env);
      if (url.pathname === "/auth/callback" && request.method === "GET") return await callback(url, env);
      if (url.pathname === "/auth/logout" && request.method === "POST") return await logout(request, env, allowedOrigin);
      if (url.pathname === "/api/state" && request.method === "GET") {
        await requireSession(request, env);
        const result = await getRepoFile(env, "data.json");
        return json({ data: JSON.parse(result.content), sha: result.sha }, 200, allowedOrigin);
      }
      if (url.pathname === "/api/publish" && request.method === "POST") {
        await requireSession(request, env);
        return await publish(request, env, allowedOrigin);
      }
      return json({ error: "Not found" }, 404, allowedOrigin);
    } catch (err) {
      const status = err.status || 500;
      return json({ error: status === 500 ? "Server error. Check Worker logs." : err.message }, status, allowedOrigin);
    }
  }
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
  });
}
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes); crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}
function required(env, key) { if (!env[key]) fail(`Missing server configuration: ${key}`, 500); return env[key]; }
function repoPath(path) {
  const clean = String(path || "");
  if (!/^[a-zA-Z0-9._/-]+$/.test(clean) || clean.startsWith("/") || clean.includes("..")) fail("Invalid repository path");
  return clean;
}
function staffAllowed(login, env) {
  return (env.STAFF_LOGINS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean).includes(String(login).toLowerCase());
}
async function githubFetch(path, env, options = {}) {
  const token = required(env, "GITHUB_TOKEN");
  const response = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Forge-FC-Club-Manager",
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch {}
  if (!response.ok) {
    if (response.status === 409 || response.status === 422) fail("GitHub rejected this update, possibly because the repository changed. Reload the published version and retry.", 409);
    fail(data.message || `GitHub API request failed (${response.status})`, response.status >= 500 ? 502 : 400);
  }
  return data;
}
function repoBase(env) {
  return `/repos/${encodeURIComponent(required(env,"GITHUB_OWNER"))}/${encodeURIComponent(required(env,"GITHUB_REPO"))}`;
}
async function getRepoFile(env, path) {
  const owner = required(env,"GITHUB_OWNER"), repo = required(env,"GITHUB_REPO");
  const branch = encodeURIComponent(env.GITHUB_BRANCH || "main");
  const p = repoPath(path).split("/").map(encodeURIComponent).join("/");
  const data = await githubFetch(`${repoBase(env)}/contents/${p}?ref=${branch}`, env);
  const bytes = Uint8Array.from(atob(data.content.replace(/\n/g,"")), c => c.charCodeAt(0));
  return { sha: data.sha, content: new TextDecoder().decode(bytes) };
}
async function putRepoFile(env, path, contentBase64, message, sha = null) {
  const owner = required(env,"GITHUB_OWNER"), repo = required(env,"GITHUB_REPO");
  const p = repoPath(path).split("/").map(encodeURIComponent).join("/");
  const body = { message, content: contentBase64, branch: env.GITHUB_BRANCH || "main" };
  if (sha) body.sha = sha;
  return githubFetch(`${repoBase(env)}/contents/${p}`, env, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
}
async function login(url, env) {
  const clientId = required(env,"GITHUB_OAUTH_CLIENT_ID");
  const state = randomToken(24);
  await env.SESSIONS.put(`oauth:${state}`, JSON.stringify({ created: Date.now() }), { expirationTtl: STATE_TTL });
  const callback = `${url.origin}/auth/callback`;
  const github = new URL("https://github.com/login/oauth/authorize");
  github.searchParams.set("client_id", clientId);
  github.searchParams.set("redirect_uri", callback);
  github.searchParams.set("scope", "read:user user:email");
  github.searchParams.set("state", state);
  return Response.redirect(github.toString(), 302);
}
async function callback(url, env) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) fail("Missing OAuth code or state.");
  const stateRecord = await env.SESSIONS.get(`oauth:${state}`);
  if (!stateRecord) fail("Login expired or invalid. Start sign-in again.", 401);
  await env.SESSIONS.delete(`oauth:${state}`);

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method:"POST", headers:{"Accept":"application/json","Content-Type":"application/json"},
    body:JSON.stringify({
      client_id:required(env,"GITHUB_OAUTH_CLIENT_ID"),
      client_secret:required(env,"GITHUB_OAUTH_CLIENT_SECRET"),
      code
    })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) fail("GitHub sign-in failed.", 401);

  const userResponse = await fetch("https://api.github.com/user", {
    headers:{"Authorization":`Bearer ${tokenData.access_token}`,"Accept":"application/vnd.github+json","User-Agent":"Forge-FC-Club-Manager"}
  });
  const user = await userResponse.json();
  if (!userResponse.ok || !user.login) fail("Could not verify GitHub identity.", 401);
  if (!staffAllowed(user.login, env)) fail("This GitHub account is not on the club staff allowlist.", 403);

  const session = randomToken(32);
  await env.SESSIONS.put(`session:${session}`, JSON.stringify({ login:user.login, name:user.name || user.login, created:Date.now() }), { expirationTtl: SESSION_TTL });
  const target = new URL(required(env,"ADMIN_ORIGIN"));
  target.hash = `session=${session}`;
  return Response.redirect(target.toString(), 302);
}
async function requireSession(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer ([a-f0-9]{64})$/);
  if (!match) fail("Sign in with an authorized GitHub account.", 401);
  const raw = await env.SESSIONS.get(`session:${match[1]}`);
  if (!raw) fail("Session expired. Sign in again.", 401);
  return JSON.parse(raw);
}
async function logout(request, env, origin) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer ([a-f0-9]{64})$/);
  if (match) await env.SESSIONS.delete(`session:${match[1]}`);
  return json({ ok:true }, 200, origin);
}
async function publish(request, env, origin) {
  const body = await request.json();
  if (!body || !body.data || !body.data.club || !body.data.coach || !Array.isArray(body.data.players)) fail("Invalid club data.");
  if (JSON.stringify(body.data).length > 1_500_000) fail("Club data is too large.");
  if (!body.baseSha) fail("Missing base version. Reload published data before publishing.", 409);

  const current = await getRepoFile(env, "data.json");
  if (current.sha !== body.baseSha) fail("A newer version was published by another staff member. Reload the published version, re-apply your changes, and publish again.", 409);

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > 20) fail("Upload no more than 20 images per publish.");
  let finalSha = current.sha;
  const commitMessages = [];
  for (const item of images) {
    const path = repoPath(item.path);
    if (!path.startsWith("images/")) fail("Uploads must be inside images/.");
    if (!ALLOWED_MIME.has(item.mime)) fail("Only JPEG, PNG and WebP images are accepted.");
    if (typeof item.base64 !== "string" || item.base64.length > 5_600_000) fail("Image payload is invalid or too large.");
    const ext = path.split(".").pop().toLowerCase();
    const expected = {jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"}[ext];
    if (expected !== item.mime) fail("Image extension and file type do not match.");
    const result = await putRepoFile(env, path, item.base64, `Add/update club image ${path}`);
    commitMessages.push(result.commit?.sha);
  }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(body.data, null, 2) + "\n")));
  const saved = await putRepoFile(env, "data.json", content, "Update Forge FC club data", current.sha);
  finalSha = saved.content?.sha || saved.commit?.sha || finalSha;
  return json({ ok:true, sha:finalSha, commit:saved.commit?.sha || null, images:images.length }, 200, origin);
}
