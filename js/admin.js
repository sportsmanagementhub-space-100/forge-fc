// Teams & staff editor. Loaded after admin.js; reuses its session, `state`, `msg()` and
// Publish button, so login and publishing are unchanged. All rules live in club-data.js.
(function () {
  "use strict";
  const panel = document.getElementById("teamsPanel");
  const tab = document.querySelector('[data-tab="teams"]');
  // Never interfere with login: do nothing unless the admin page and its globals are present.
  if (!panel || !tab || typeof msg !== "function" || !window.ClubData) return;
  const CD = window.ClubData;

  function el(tag, props, ...kids) {           // safe DOM builder: text never becomes HTML
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => (k in n ? (n[k] = v) : n.setAttribute(k, v)));
    kids.flat().forEach(k => n.append(k));
    return n;
  }
  const btn = (text, fn, cls = "btn") => { const b = el("button", { type: "button", className: cls, textContent: text }); b.addEventListener("click", fn); return b; };
  const wrap = (label, control) => el("label", { className: "field" }, el("span", { textContent: label }), control);
  const field = (label, value, max, apply, tag = "input") => {
    const i = el(tag, { value: value || "", maxLength: max, ariaLabel: label });
    i.addEventListener("change", () => { const r = apply(i.value); if (!r.ok) { i.value = value || ""; msg(r.error, true); } else msg("Saved to draft. Publish to make it live.", false); });
    return wrap(label, i);
  };
  const select = (label, options, current, apply) => {
    const s = el("select", { ariaLabel: label }, options.map(([v, t]) => el("option", { value: v, textContent: t, selected: v === current })));
    s.addEventListener("change", () => { const r = apply(s.value); if (!r.ok) msg(r.error, true); else msg("Saved to draft. Publish to make it live.", false); });
    return wrap(label, s);
  };
  const done = (r, text, rerender = true) => { if (!r.ok) return msg(r.error, true); if (rerender) render(); msg(text, false); };

  // ---- Starting formation editor (saved in the draft; published with the normal Publish button)
  let fTeam = "", fSeason = "";
  function renderFormation() {
    panel.append(el("h3", { textContent: "Starting formation" }));
    if (!state.teams.length) { panel.append(el("p", { className: "muted", textContent: "Add a team first." })); return; }
    if (!state.teams.some(t => t.id === fTeam)) fTeam = state.teams[0].id;
    if (!fSeason) fSeason = String((state.club && state.club.season) || "");
    const team = state.teams.find(t => t.id === fTeam);
    const current = (team.lineups || {})[fSeason] || { formation: "4-3-3", slots: Array(11).fill("") };
    const teamSel = select("Team", state.teams.map(t => [t.id, t.name]), fTeam, v => { fTeam = v; render(); return { ok: true }; });
    const seasonIn = el("input", { value: fSeason, maxLength: 20, ariaLabel: "Season", placeholder: "Season, e.g. 2026/27" });
    seasonIn.addEventListener("change", () => { fSeason = seasonIn.value.trim(); render(); });
    const formSel = select("Formation", Object.keys(CD.FORMATIONS).map(f => [f, f]), current.formation, v => { const r = CD.setFormation(state, fTeam, fSeason, v); if (r.ok) render(); return r; });
    panel.append(el("div", { className: "card" }, teamSel, wrap("Season", seasonIn), formSel));
    const options = [["", "— empty —"], ...state.players.slice().sort((a, b) => (a.number || 99) - (b.number || 99)).map(p => [String(p.id), "#" + p.number + " " + p.name + " (" + p.position + ")"])];
    const slots = el("div", { className: "card" });
    CD.slotsFor(current.formation).forEach((sl, i) => slots.append(select(sl.role + " · position " + (i + 1), options, current.slots[i] || "", v => {
      const r = CD.assignSlot(state, fTeam, fSeason, i, v);
      if (!r.ok) setTimeout(render, 0);            // put the dropdown back to the saved value
      return r;
    })));
    panel.append(slots, el("p", { className: "muted", textContent: "A player can only appear once. The public Team Formation page shows this lineup after you publish." }));
  }

  function render() {
    panel.replaceChildren(el("h2", { textContent: "Teams & staff" }));
    if (typeof state === "undefined" || !state) { panel.append(el("p", { className: "muted", textContent: "Sign in and load the published data first." })); return; }
    CD.migrate(state);
    panel.append(el("p", { className: "muted", textContent: "Edits change the draft. Use Publish & backups to make them live." }));
    const staff = state.staff.map(s => CD.resolveStaff(state, s));

    panel.append(el("h3", { textContent: "Teams (" + state.teams.length + ")" }));
    state.teams.forEach(t => {
      const count = state.players.filter(p => p.teamId === t.id).length;
      panel.append(el("div", { className: "card" },
        field("Team name", t.name, CD.LIMITS.team, v => CD.renameTeam(state, t.id, v)),
        field("Formation", t.formation, CD.LIMITS.formation, v => CD.updateTeam(state, t.id, { formation: v })),
        field("Description", t.description, CD.LIMITS.description, v => CD.updateTeam(state, t.id, { description: v }), "textarea"),
        select("Coach", [["", "— none —"], ...staff.map(s => [s.id, s.name])], t.coachId || "", v => CD.assignCoach(state, t.id, v)),
        el("p", { className: "muted", textContent: count + " player(s) assigned" }),
        btn("Delete team", () => { if (!count && !confirm("Delete team “" + t.name + "”?")) return; done(CD.deleteTeam(state, t.id), "Team deleted in draft."); })));
    });
    const nt = el("input", { maxLength: CD.LIMITS.team, placeholder: "New team name", ariaLabel: "New team name" });
    panel.append(el("div", { className: "card" }, nt, btn("Add team", () => done(CD.addTeam(state, nt.value), "Team added to draft."), "btn primary")));

    panel.append(el("h3", { textContent: "Squad assignment" }));
    const teamOpts = [["", "— unassigned —"], ...state.teams.map(t => [t.id, t.name])];
    state.players.forEach(p => panel.append(select(p.name + " (#" + p.number + ")", teamOpts, p.teamId || "", v => CD.assignPlayer(state, p.id, v))));

    renderFormation();
    panel.append(el("h3", { textContent: "Coaches & staff (" + staff.length + ")" }));
    state.staff.forEach((raw, i) => {
      const s = staff[i];
      if (raw.source === "coach") { panel.append(el("div", { className: "card" }, el("strong", { textContent: s.name }), el("p", { className: "muted", textContent: (s.role || "Head coach") + " · edit in the Head Coach tab" }))); return; }
      panel.append(el("div", { className: "card" },
        field("Name", s.name, CD.LIMITS.name, v => CD.updateStaff(state, s.id, { name: v })),
        field("Role", s.role, CD.LIMITS.role, v => CD.updateStaff(state, s.id, { role: v })),
        field("Qualifications", s.license, CD.LIMITS.role, v => CD.updateStaff(state, s.id, { license: v })),
        field("Biography", s.bio, CD.LIMITS.bio, v => CD.updateStaff(state, s.id, { bio: v }), "textarea"),
        btn("Remove", () => { if (confirm("Remove “" + s.name + "”? They will be unassigned from any team.")) done(CD.removeStaff(state, s.id), "Staff removed from draft."); })));
    });
    const ns = el("input", { maxLength: CD.LIMITS.name, placeholder: "New staff member name", ariaLabel: "New staff name" });
    panel.append(el("div", { className: "card" }, ns, btn("Add staff member", () => done(CD.addStaff(state, ns.value), "Staff added to draft."), "btn primary")));
  }
  tab.addEventListener("click", () => {
    try { render(); } catch (e) { panel.textContent = "Teams editor could not load. Login and publishing are unaffected."; console.error(e); }
  });
})();
