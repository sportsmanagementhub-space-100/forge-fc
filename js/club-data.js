// Shared club data rules: migration, relations (by stable id), edits and validation.
// Pure functions, no DOM, so the browser pages and tests/ use the same code.
(function (root) {
  "use strict";
  const HEAD_ID = "s_head";          // staff record that mirrors the existing `coach` object
  const LIMITS = { team: 60, formation: 20, description: 400, name: 80, role: 80, bio: 600 };
  const clean = v => String(v == null ? "" : v).trim();
  const uid = p => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ok = value => ({ ok: true, error: null, value });
  const fail = error => ({ ok: false, error, value: null });
  const list = (d, k) => (Array.isArray(d[k]) ? d[k] : (d[k] = []));

  // Adds teams/staff/teamId if missing. The `coach` object is never changed or copied:
  // staff `s_head` points at it, so editing the Head Coach tab updates every display.
  function migrate(d) {
    const teams = list(d, "teams"), staff = list(d, "staff"), players = list(d, "players");
    if (d.coach && !staff.some(s => s.id === HEAD_ID)) staff.unshift({ id: HEAD_ID, source: "coach" });
    if (!teams.length) teams.push({ id: "t1", name: "First Team", description: "", formation: clean(d.coach && d.coach.formation), coachId: "" });
    if (!teams[0].coachId && staff.some(s => s.id === HEAD_ID)) teams[0].coachId = HEAD_ID;
    players.forEach(p => {
      if (p.teamId === undefined) p.teamId = teams[0].id;
      else if (p.teamId && !teams.some(t => t.id === p.teamId)) p.teamId = "";
    });
    return d;
  }
  // Staff as displayed: the head-coach record reads live from d.coach.
  function resolveStaff(d, s) {
    if (s.source !== "coach") return s;
    const c = d.coach || {};
    return { id: s.id, source: "coach", name: c.name || "Head Coach", role: c.role || "", bio: c.bio || "", license: c.license || "", experience: c.experience || "", image: c.image || "", quote: c.quote || "" };
  }
  const nameError = (v, max, label) => (!v ? label + " is required." : v.length > max ? label + " must be " + max + " characters or fewer." : null);
  const dup = (d, name, id) => d.teams.some(t => t.id !== id && t.name.toLowerCase() === name.toLowerCase());

  function addTeam(d, name) {
    const n = clean(name), e = nameError(n, LIMITS.team, "Team name");
    if (e) return fail(e);
    if (dup(d, n, null)) return fail("A team with that name already exists.");
    const t = { id: uid("t"), name: n, description: "", formation: "", coachId: "" };
    d.teams.push(t); return ok(t);
  }
  function renameTeam(d, id, name) {
    const t = d.teams.find(x => x.id === id), n = clean(name);
    if (!t) return fail("Team not found.");
    const e = nameError(n, LIMITS.team, "Team name");
    if (e) return fail(e);
    if (dup(d, n, id)) return fail("Another team already uses that name.");
    t.name = n; return ok(t);
  }
  function updateTeam(d, id, f) {
    const t = d.teams.find(x => x.id === id);
    if (!t) return fail("Team not found.");
    const formation = clean(f.formation === undefined ? t.formation : f.formation), description = clean(f.description === undefined ? t.description : f.description);
    if (formation.length > LIMITS.formation || description.length > LIMITS.description) return fail("Text is too long.");
    t.formation = formation; t.description = description; return ok(t);
  }
  function deleteTeam(d, id) {
    const n = d.players.filter(p => p.teamId === id).length;
    if (n) return fail("Move the " + n + " player(s) to another team first.");
    if (!d.teams.some(t => t.id === id)) return fail("Team not found.");
    d.teams = d.teams.filter(t => t.id !== id); return ok(null);
  }
  function assignPlayer(d, playerId, teamId) {
    const p = d.players.find(x => String(x.id) === String(playerId));
    if (!p) return fail("Player not found.");
    if (teamId && !d.teams.some(t => t.id === teamId)) return fail("Team not found.");
    p.teamId = teamId || ""; return ok(p);
  }
  function assignCoach(d, teamId, staffId) {
    const t = d.teams.find(x => x.id === teamId);
    if (!t) return fail("Team not found.");
    if (staffId && !d.staff.some(s => s.id === staffId)) return fail("Staff member not found.");
    t.coachId = staffId || ""; return ok(t);
  }
  function addStaff(d, name) {
    const n = clean(name), e = nameError(n, LIMITS.name, "Name");
    if (e) return fail(e);
    const s = { id: uid("s"), name: n, role: "", license: "", bio: "" };
    d.staff.push(s); return ok(s);
  }
  function updateStaff(d, id, f) {
    const s = d.staff.find(x => x.id === id);
    if (!s) return fail("Staff member not found.");
    if (s.source === "coach") return fail("The head coach is edited in the Head Coach tab.");
    const n = clean(f.name === undefined ? s.name : f.name), e = nameError(n, LIMITS.name, "Name");
    if (e) return fail(e);
    const role = clean(f.role === undefined ? s.role : f.role), license = clean(f.license === undefined ? s.license : f.license), bio = clean(f.bio === undefined ? s.bio : f.bio);
    if (role.length > LIMITS.role || license.length > LIMITS.role || bio.length > LIMITS.bio) return fail("Text is too long.");
    Object.assign(s, { name: n, role, license, bio }); return ok(s);
  }
  function removeStaff(d, id) {
    const s = d.staff.find(x => x.id === id);
    if (!s) return fail("Staff member not found.");
    if (s.source === "coach") return fail("The head coach cannot be removed here; edit the Head Coach tab instead.");
    d.teams.forEach(t => { if (t.coachId === id) t.coachId = ""; });
    d.staff = d.staff.filter(x => x.id !== id); return ok(null);
  }
  // Returns a list of problems (empty = valid).
  function validate(d) {
    const errs = [], teams = d.teams || [], staff = d.staff || [], players = d.players || [];
    const unique = (items, what) => { const k = items.map(i => String(i.id)); if (k.some(x => !x) || new Set(k).size !== k.length) errs.push(what + " ids must be unique and non-empty."); };
    unique(teams, "Team"); unique(staff, "Staff"); unique(players, "Player");
    if (new Set(teams.map(t => String(t.name).toLowerCase())).size !== teams.length) errs.push("Team names must be unique.");
    teams.forEach(t => { if (nameError(clean(t.name), LIMITS.team, "Team name")) errs.push("A team has an invalid name."); if (t.coachId && !staff.some(s => s.id === t.coachId)) errs.push("Team " + t.name + " has a missing coach."); });
    players.forEach(p => { if (p.teamId && !teams.some(t => t.id === p.teamId)) errs.push("Player " + p.name + " is on a missing team."); });
    staff.forEach(s => { if (s.source === "coach" ? !d.coach : nameError(clean(s.name), LIMITS.name, "Name")) errs.push("A staff record is invalid."); });
    return errs;
  }
  const api = { HEAD_ID, LIMITS, migrate, resolveStaff, addTeam, renameTeam, updateTeam, deleteTeam, assignPlayer, assignCoach, addStaff, updateStaff, removeStaff, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ClubData = api;
})(typeof window !== "undefined" ? window : globalThis);
