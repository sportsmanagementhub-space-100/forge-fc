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
    return errs.concat(validateLineups(d));
  }

  // ---- Formations: rows from goalkeeper to attack, [role, players in row]
  const FORMATIONS = {
    "4-3-3": [["GK", 1], ["DEF", 4], ["MID", 3], ["FWD", 3]],
    "4-4-2": [["GK", 1], ["DEF", 4], ["MID", 4], ["FWD", 2]],
    "4-2-3-1": [["GK", 1], ["DEF", 4], ["MID", 2], ["MID", 3], ["FWD", 1]],
    "3-5-2": [["GK", 1], ["DEF", 3], ["MID", 5], ["FWD", 2]]
  };
  // Pitch coordinates in % (x left->right, y top->bottom; goalkeeper at the bottom).
  function slotsFor(name) {
    const rows = FORMATIONS[name], out = [];
    if (!rows) return out;
    rows.forEach(([role, n], r) => {
      const y = 88 - r * (74 / (rows.length - 1));
      for (let i = 0; i < n; i++) out.push({ role, x: Math.round((i + 1) / (n + 1) * 1000) / 10, y: Math.round(y * 10) / 10 });
    });
    return out;
  }
  // d.teams[].lineups = { "<season>": { formation: "4-3-3", slots: [playerId|"" x 11] } }
  function lineupOf(d, teamId, season, create) {
    const t = d.teams.find(x => x.id === teamId);
    if (!t) return null;
    if (create) { t.lineups = t.lineups || {}; if (!t.lineups[season]) t.lineups[season] = { formation: "4-3-3", slots: Array(11).fill("") }; }
    return (t.lineups && t.lineups[season]) || null;
  }
  function setFormation(d, teamId, season, formation) {
    const sn = clean(season);
    if (!FORMATIONS[formation]) return fail("Unknown formation.");
    if (!sn || sn.length > 20) return fail("Season is required (20 characters max).");
    const lu = lineupOf(d, teamId, sn, true);
    if (!lu) return fail("Team not found.");
    const old = slotsFor(lu.formation), byRole = {};     // keep each player in the same line (GK/DEF/MID/FWD)
    old.forEach((s, i) => { if (lu.slots[i]) (byRole[s.role] = byRole[s.role] || []).push(lu.slots[i]); });
    lu.formation = formation;
    lu.slots = slotsFor(formation).map(s => (byRole[s.role] || []).shift() || "");
    return ok(lu);
  }
  function assignSlot(d, teamId, season, index, playerId) {
    const sn = clean(season), pid = playerId === "" || playerId == null ? "" : String(playerId);
    if (!sn) return fail("Season is required.");
    if (!Number.isInteger(index) || index < 0 || index > 10) return fail("Invalid position.");
    if (pid && !d.players.some(p => String(p.id) === pid)) return fail("Player not found.");
    const lu = lineupOf(d, teamId, sn, true);
    if (!lu) return fail("Team not found.");
    if (pid && lu.slots.some((x, i) => i !== index && x === pid)) return fail("That player is already in the starting eleven.");
    lu.slots[index] = pid; return ok(lu);
  }
  function validateLineups(d) {
    const errs = [];
    (d.teams || []).forEach(t => Object.entries(t.lineups || {}).forEach(([season, lu]) => {
      const tag = t.name + " " + season;
      if (!FORMATIONS[lu.formation]) return errs.push(tag + ": unknown formation.");
      if (!Array.isArray(lu.slots) || lu.slots.length !== 11) return errs.push(tag + ": lineup must have 11 positions.");
      const used = lu.slots.filter(Boolean);
      if (new Set(used).size !== used.length) errs.push(tag + ": a player is used twice.");
      if (used.some(id => !d.players.some(p => String(p.id) === String(id)))) errs.push(tag + ": lineup uses an unknown player.");
    }));
    return errs;
  }
  function seasonsOf(d) {
    const set = new Set(); if (d.club && d.club.season) set.add(String(d.club.season));
    (d.teams || []).forEach(t => Object.keys(t.lineups || {}).forEach(k => set.add(k)));
    return [...set].sort().reverse();
  }
  const api = { HEAD_ID, LIMITS, FORMATIONS, slotsFor, setFormation, assignSlot, validateLineups, seasonsOf, migrate, resolveStaff, addTeam, renameTeam, updateTeam, deleteTeam, assignPlayer, assignCoach, addStaff, updateStaff, removeStaff, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ClubData = api;
})(typeof window !== "undefined" ? window : globalThis);
