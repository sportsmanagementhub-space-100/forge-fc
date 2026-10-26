// Single-page navigation (Overview, Players, Coach, Seasons, Teams, Formation) and the
// views built from data.json. Text is always inserted with textContent, never as HTML.
(function () {
  "use strict";
  const VIEWS = ["overview", "players", "coach", "seasons", "teams", "formation"];
  const ALIAS = { home: "overview", squad: "players" };
  const CD = window.ClubData;
  let data = null, season = "", teamId = "";
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const profile = id => { if (typeof openProfile === "function") openProfile(id); };

  // ---- navigation
  function show(name) {
    name = ALIAS[name] || name; if (!VIEWS.includes(name)) name = "overview";
    document.querySelectorAll("[data-view]").forEach(s => { s.hidden = s.dataset.view !== name; });
    document.querySelectorAll("[data-nav]").forEach(a => {
      const on = a.dataset.nav === name; a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function route() { show(location.hash.slice(1)); window.scrollTo(0, 0); }
  window.addEventListener("hashchange", route);
  document.addEventListener("click", e => { const b = e.target.closest("[data-profile]"); if (b) profile(b.dataset.profile); });
  show(location.hash.slice(1));

  // ---- helpers
  const playerOf = id => data.players.find(p => String(p.id) === String(id));
  const coachOf = t => { const s = data.staff.find(x => x.id === t.coachId); return s ? CD.resolveStaff(data, s) : null; };
  function seasonSelect() {
    const s = el("select"); s.setAttribute("aria-label", "Season");
    CD.seasonsOf(data).forEach(v => { const o = el("option", "", v); o.value = v; o.selected = v === season; s.append(o); });
    s.addEventListener("change", () => { season = s.value; renderAll(); });
    return s;
  }
  function rosterList(t) {
    const ul = el("ul");
    data.players.filter(p => p.teamId === t.id).sort((a, b) => (a.number || 99) - (b.number || 99)).forEach(p => {
      const li = el("li"), b = el("button", "", "#" + p.number + "  " + p.name + " · " + p.position);
      b.type = "button"; b.dataset.profile = p.id; li.append(b); ul.append(li);
    });
    return ul;
  }

  // ---- views
  function renderHighlights() {
    const box = $("#highlightList"); box.replaceChildren();
    const top = data.players.slice().sort((a, b) => (b.overall || 0) - (a.overall || 0)).slice(0, 3);
    if (!top.length) return box.append(el("p", "empty", "No players published yet."));
    top.forEach(p => {
      const t = el("div", "tile"); t.append(el("h3", "", p.name), el("p", "muted", "#" + p.number + " · " + p.position + " · " + (p.overall || "—") + " OVR"));
      const b = el("button", "details", "FULL PROFILE ↗"); b.type = "button"; b.dataset.profile = p.id; t.append(b); box.append(t);
    });
  }
  function renderStaff() {
    const box = $("#staffList"); box.replaceChildren();
    const others = data.staff.filter(s => s.source !== "coach");
    if (!others.length) return box.append(el("p", "empty", "No additional coaching staff have been published."));
    others.forEach(s => { const t = el("div", "tile"); t.append(el("h3", "", s.name)); if (s.role) t.append(el("p", "muted", s.role)); if (s.license) t.append(el("p", "", "Qualifications: " + s.license)); if (s.bio) t.append(el("p", "", s.bio)); box.append(t); });
  }
  function renderSeasons() {
    $("#seasonPick").replaceChildren(seasonSelect());
    const box = $("#seasonInfo"); box.replaceChildren();
    const c = data.club, tile = el("div", "tile"); tile.append(el("h3", "", "Season " + season));
    if (String(c.season) === season) {
      tile.append(el("p", "", "Registered players: " + data.players.length));
      if (c.matchesPlayed != null) tile.append(el("p", "", "Matches played: " + c.matchesPlayed));
      if (c.marketValueMillions != null) tile.append(el("p", "", "Squad value: " + (c.currency || "") + c.marketValueMillions + "M"));
    } else tile.append(el("p", "muted", "No season statistics have been recorded for this season. Squad details shown elsewhere are the current squad."));
    box.append(tile);
    data.teams.forEach(t => { const lu = t.lineups && t.lineups[season]; const x = el("div", "tile"); x.append(el("h3", "", t.name), el("p", "muted", lu ? "Formation " + lu.formation : "No lineup published for this season.")); box.append(x); });
  }
  function renderTeams() {
    const box = $("#teamList"); box.replaceChildren();
    if (!data.teams.length) return box.append(el("p", "empty", "No teams have been published yet."));
    data.teams.forEach(t => {
      const tile = el("div", "tile"), coach = coachOf(t); tile.append(el("h3", "", t.name));
      if (t.formation) tile.append(el("p", "muted", "Formation " + t.formation));
      if (coach) tile.append(el("p", "", "Coach: " + coach.name));
      if (t.description) tile.append(el("p", "", t.description));
      const roster = rosterList(t); tile.append(roster.children.length ? roster : el("p", "muted", "No players assigned.")); box.append(tile);
    });
  }
  function renderFormation() {
    const pick = $("#formationPick"), box = $("#pitchBox"); pick.replaceChildren(); box.replaceChildren();
    if (!data.teams.length) return box.append(el("p", "empty", "No teams have been published yet."));
    if (!data.teams.some(t => t.id === teamId)) teamId = data.teams[0].id;
    if (data.teams.length > 1) {
      const s = el("select"); s.setAttribute("aria-label", "Team");
      data.teams.forEach(t => { const o = el("option", "", t.name); o.value = t.id; o.selected = t.id === teamId; s.append(o); });
      s.addEventListener("change", () => { teamId = s.value; renderFormation(); }); pick.append(s);
    }
    pick.append(seasonSelect());
    const lu = (data.teams.find(t => t.id === teamId).lineups || {})[season];
    if (!lu || !CD.FORMATIONS[lu.formation]) { $("#formationDesc").textContent = "Season " + season; return box.append(el("p", "empty", "The starting lineup has not been set for this team and season yet.")); }
    $("#formationDesc").textContent = "Season " + season + " · " + lu.formation + " · select a player to open their profile";
    const pitch = el("div", "pitch"); pitch.setAttribute("role", "group"); pitch.setAttribute("aria-label", "Starting lineup, " + lu.formation);
    ["half", "circle", "box-b", "six-b", "box-t", "six-t"].forEach(c => pitch.append(el("div", "pl " + c)));
    CD.slotsFor(lu.formation).forEach((s, i) => {
      const p = lu.slots[i] ? playerOf(lu.slots[i]) : null, b = el("button", "marker" + (p ? "" : " vacant"));
      b.type = "button"; b.style.left = s.x + "%"; b.style.top = s.y + "%";
      b.append(el("span", "mk", p ? p.number : "–"), el("span", "mk-name", p ? p.name : s.role));
      if (p) { b.dataset.profile = p.id; b.setAttribute("aria-label", p.name + ", number " + p.number + ", open profile"); } else { b.disabled = true; b.setAttribute("aria-label", s.role + " position not assigned"); }
      pitch.append(b);
    });
    box.append(pitch);
  }
  function renderAll() { renderHighlights(); renderStaff(); renderSeasons(); renderTeams(); renderFormation(); }

  window.SiteViews = { init(state) { data = state; CD.migrate(data); season = String(data.club.season || CD.seasonsOf(data)[0] || ""); if (season && !CD.seasonsOf(data).includes(season)) season = CD.seasonsOf(data)[0] || ""; renderAll(); show(location.hash.slice(1)); } };
})();
