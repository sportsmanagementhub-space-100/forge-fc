// Teams & staff editor with visual starting pitch.
// Loaded after admin.js and club-data.js. Reuses the existing session, state, msg(), and Publish flow.
// This file does not access or change the Worker, credentials, authentication, or publishing implementation.
(function () {
  "use strict";
  const panel = document.getElementById("teamsPanel");
  const tab = document.querySelector('[data-tab="teams"]');
  if (!panel || !tab || typeof msg !== "function" || !window.ClubData) return;
  const CD = window.ClubData;

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === "textContent") n.textContent = v;
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    });
    kids.flat().forEach(k => { if (k != null) n.append(k); });
    return n;
  }
  const btn = (text, fn, cls = "btn") => {
    const b = el("button", { type: "button", className: cls, textContent: text });
    b.addEventListener("click", fn);
    return b;
  };
  const wrap = (label, control) => el("label", { className: "field" },
    el("span", { textContent: label }), control);
  const field = (label, value, max, apply, tag = "input") => {
    const i = el(tag, { value: value || "", maxLength: max, ariaLabel: label });
    i.addEventListener("change", () => {
      const r = apply(i.value);
      if (!r.ok) { i.value = value || ""; msg(r.error, true); }
      else msg("Saved to draft. Publish to make it live.", false);
    });
    return wrap(label, i);
  };
  const select = (label, options, current, apply) => {
    const s = el("select", { ariaLabel: label });
    options.forEach(([v, t]) => s.append(el("option", {
      value: v, textContent: t, selected: String(v) === String(current)
    })));
    s.value = String(current == null ? "" : current);
    s.addEventListener("change", () => {
      const r = apply(s.value);
      if (!r.ok) msg(r.error, true);
      else msg("Saved to draft. Publish to make it live.", false);
    });
    return wrap(label, s);
  };
  const done = (r, text, rerender = true) => {
    if (!r.ok) return msg(r.error, true);
    if (rerender) render();
    msg(text, false);
  };

  let fTeam = "", fSeason = "";
  let selectedSlot = 0;

  function renderPitch(current, players) {
    const pitch = el("div", {
      className: "formation-pitch",
      role: "group",
      ariaLabel: "Visual starting formation. Choose a player using the position selectors below."
    });
    const positions = CD.slotsFor(current.formation);
    const used = current.slots || [];
    positions.forEach((pos, i) => {
      const id = String(used[i] || "");
      const player = players.find(p => String(p.id) === id);
      const marker = el("button", {
        type: "button",
        className: "pitch-player" + (player ? " is-filled" : " is-empty") + (i === selectedSlot ? " is-selected" : ""),
        title: pos.role + " position " + (i + 1) + (player ? ": " + player.name : ": empty"),
        ariaLabel: "Position " + (i + 1) + ", " + pos.role + (player ? ", " + player.name : ", empty"),
        textContent: player ? ("#" + (player.number || "") + " " + player.name) : ("+" + " " + pos.role)
      });
      marker.style.left = pos.x + "%";
      marker.style.top = pos.y + "%";
      marker.addEventListener("click", () => {
        selectedSlot = i;
        const selector = panel.querySelector('[data-lineup-slot="' + i + '"] select');
        panel.querySelectorAll(".pitch-player").forEach((n, j) => n.classList.toggle("is-selected", j === i));
        if (selector) {
          selector.focus();
          selector.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
      pitch.append(marker);
    });
    return pitch;
  }

  function renderFormation() {
    panel.append(el("h3", { textContent: "Starting formation" }));
    if (!state.teams.length) {
      panel.append(el("p", { className: "muted", textContent: "Add a team first." }));
      return;
    }
    if (!state.teams.some(t => t.id === fTeam)) fTeam = state.teams[0].id;
    if (!fSeason) fSeason = String((state.club && state.club.season) || "");
    const team = state.teams.find(t => t.id === fTeam);
    const current = (team.lineups || {})[fSeason] || { formation: "4-3-3", slots: Array(11).fill("") };
    const currentSlots = Array.isArray(current.slots) ? current.slots : Array(11).fill("");
    const normalized = { formation: current.formation || "4-3-3", slots: currentSlots };
    const teamSel = select("Team", state.teams.map(t => [t.id, t.name]), fTeam, v => {
      fTeam = v; render(); return { ok: true };
    });
    const seasonIn = el("input", {
      value: fSeason, maxLength: 20, ariaLabel: "Season", placeholder: "Season, e.g. 2026/27"
    });
    seasonIn.addEventListener("change", () => {
      const next = seasonIn.value.trim();
      if (!next || next.length > 20) {
        msg("Season is required and must be 20 characters or fewer.", true);
        seasonIn.value = fSeason;
        return;
      }
      fSeason = next;
      render();
    });
    const formSel = select("Formation", Object.keys(CD.FORMATIONS).map(f => [f, f]), normalized.formation, v => {
      const r = CD.setFormation(state, fTeam, fSeason, v);
      if (r.ok) render();
      return r;
    });
    panel.append(el("div", { className: "card formation-controls" },
      teamSel, wrap("Season", seasonIn), formSel));

    panel.append(el("p", { className: "muted formation-help", textContent:
      "Tap a player marker to jump to that position's selector. Empty positions are shown with a +. Changes remain in the draft until you publish."
    }));
    panel.append(renderPitch(normalized, state.players));

    const options = [["", "— Empty position —"], ...state.players.slice()
      .sort((a, b) => (Number(a.number) || 99) - (Number(b.number) || 99))
      .map(p => [String(p.id), "#" + (p.number || "—") + " " + p.name + " (" + (p.position || "Position not set") + ")"])];
    const slots = el("div", { className: "formation-slot-grid" });
    CD.slotsFor(normalized.formation).forEach((sl, i) => {
      const slotWrap = el("div", { className: "formation-slot", "data-lineup-slot": String(i) });
      const slotSelect = select("Position " + (i + 1) + " · " + sl.role, options, normalized.slots[i] || "", v => {
        const r = CD.assignSlot(state, fTeam, fSeason, i, v);
        if (r.ok) {
          selectedSlot = i;
          // Re-render so the pitch immediately reflects the new player assignment.
          render();
        } else {
          msg(r.error, true);
          setTimeout(render, 0);
        }
        return r;
      });
      slotWrap.append(slotSelect);
      slots.append(slotWrap);
    });
    panel.append(slots, el("p", { className: "muted", textContent:
      "A player can only appear once in this starting eleven. The public Team Formation page will show the lineup only if its existing renderer reads this saved lineup data."
    }));
  }

  function render() {
    panel.replaceChildren(el("h2", { textContent: "Teams & staff" }));
    if (typeof state === "undefined" || !state) {
      panel.append(el("p", { className: "muted", textContent: "Sign in and load the published data first." }));
      return;
    }
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
        btn("Delete team", () => {
          if (count) return msg("Move the assigned players to another team first.", true);
          if (!confirm("Delete team “" + t.name + "”?")) return;
          done(CD.deleteTeam(state, t.id), "Team deleted in draft.");
        })));
    });
    const nt = el("input", { maxLength: CD.LIMITS.team, placeholder: "New team name", ariaLabel: "New team name" });
    panel.append(el("div", { className: "card" }, nt,
      btn("Add team", () => done(CD.addTeam(state, nt.value), "Team added to draft."), "btn primary")));

    panel.append(el("h3", { textContent: "Squad assignment" }));
    const teamOpts = [["", "— unassigned —"], ...state.teams.map(t => [t.id, t.name])];
    state.players.forEach(p => panel.append(select(
      p.name + " (#" + p.number + ")", teamOpts, p.teamId || "",
      v => CD.assignPlayer(state, p.id, v)
    )));

    renderFormation();
    panel.append(el("h3", { textContent: "Coaches & staff (" + staff.length + ")" }));
    state.staff.forEach((raw, i) => {
      const s = staff[i];
      if (raw.source === "coach") {
        panel.append(el("div", { className: "card" },
          el("strong", { textContent: s.name }),
          el("p", { className: "muted", textContent: (s.role || "Head coach") + " · edit in the Head Coach tab" })));
        return;
      }
      panel.append(el("div", { className: "card" },
        field("Name", s.name, CD.LIMITS.name, v => CD.updateStaff(state, s.id, { name: v })),
        field("Role", s.role, CD.LIMITS.role, v => CD.updateStaff(state, s.id, { role: v })),
        field("Qualifications", s.license, CD.LIMITS.role, v => CD.updateStaff(state, s.id, { license: v })),
        field("Biography", s.bio, CD.LIMITS.bio, v => CD.updateStaff(state, s.id, { bio: v }), "textarea"),
        btn("Remove", () => {
          if (confirm("Remove “" + s.name + "”? They will be unassigned from any team."))
            done(CD.removeStaff(state, s.id), "Staff removed from draft.");
        })));
    });
    const ns = el("input", { maxLength: CD.LIMITS.name, placeholder: "New staff member name", ariaLabel: "New staff name" });
    panel.append(el("div", { className: "card" }, ns,
      btn("Add staff member", () => done(CD.addStaff(state, ns.value), "Staff added to draft."), "btn primary")));
  }

  tab.addEventListener("click", () => {
    try { render(); }
    catch (e) {
      panel.textContent = "Teams editor could not load. Login and publishing are unaffected.";
      console.error(e);
    }
  });
})();
