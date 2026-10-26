// Public Teams page. Everything comes from ../data.json; relations use stable ids.
(function () {
  "use strict";
  const THEMES = { "navy-gold": ["#061428", "#0b2140", "#d4af37", "#f8fafc"], "black-red": ["#12090d", "#24121a", "#ff4b5c", "#fff7f8"], "blue-white": ["#f3f6fb", "#ffffff", "#174a8b", "#10213a"], "green-black": ["#07120d", "#11251a", "#74d99f", "#f3fff7"] };
  const root = document.getElementById("teams");
  const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
  async function init() {
    try {
      const res = await fetch("../data.json", { cache: "no-store" });
      if (!res.ok) throw new Error("data.json " + res.status);
      const d = await res.json(), club = d.club || {};
      const t = THEMES[club.theme] || THEMES["navy-gold"], r = document.documentElement.style;
      ["--bg", "--panel", "--accent", "--text"].forEach((k, i) => r.setProperty(k, t[i]));
      const name = String(club.name || "Club").trim();
      document.title = "Teams | " + name;
      document.getElementById("clubName").textContent = name;
      if (window.ClubData) window.ClubData.migrate(d);
      const teams = d.teams, players = d.players, staff = d.staff.map(x => window.ClubData.resolveStaff(d, x));
      if (!teams.length) { root.append(el("p", "empty", "No teams have been published yet.")); return; }
      teams.forEach(tm => {
        const card = el("article", "tcard"), coach = staff.find(s => s.id === tm.coachId);
        card.append(el("h2", "", tm.name));
        if (tm.formation) card.append(el("p", "meta", "Formation " + tm.formation));
        if (coach) card.append(el("p", "meta", "Coach: " + coach.name + (coach.role ? " · " + coach.role : "")));
        if (tm.description) card.append(el("p", "", tm.description));
        const ul = el("ul", "roster");
        players.filter(p => p.teamId === tm.id).sort((a, b) => (a.number || 99) - (b.number || 99))
          .forEach(p => ul.append(el("li", "", "#" + p.number + "  " + p.name + " · " + p.position)));
        card.append(ul.children.length ? ul : el("p", "meta", "No players assigned."));
        root.append(card);
      });
    } catch (e) { root.replaceChildren(el("p", "empty", "Could not load team data. Please try again later.")); }
  }
  init();
})();
