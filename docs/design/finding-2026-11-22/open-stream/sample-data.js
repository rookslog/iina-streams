"use strict";
// Static sample data shared by both mock directions. No network calls.
// Ohnepixel is a public Twitch channel used only as the brief's example; his titles, counts and history here are
// invented. Every other name is a placeholder.
window.STREAMS_SAMPLE = (function () {
  const NOW = Date.parse("2026-11-22T22:00:00-05:00");
  const day = 86400000;

  // Local People, in ranking order (spec §3: frecency within a section; viewers are shown, never the sort key).
  // followOnly people exist only when signed in (Helix follows) and have no history, so they rank after everyone
  // with history, and the signed-out list is a strict subset.
  const people = [
    {
      login: "ohnepixel", name: "Ohnepixel", platform: "twitch", state: "live", viewers: 12340,
      title: "Opening cases until we hit a blue gem, then chatting about the major",
      category: "Counter-Strike", reason: "You open Ohnepixel most evenings"
    },
    {
      login: "mira_plays", name: "mira_plays", platform: "twitch", state: "live", viewers: 1180,
      title: "Silksong all bosses, no hits, attempt 14",
      category: "Hollow Knight: Silksong", reason: "Opened 6 times this week"
    },
    {
      login: "kestrel_vt", name: "kestrel_vt", platform: "twitch", state: "live", viewers: 31200,
      title: "late night sketching and chat", category: "Art", reason: "Opened twice this month"
    },
    {
      login: "ohayo_nori", name: "ohayo_nori", platform: "twitch", state: "offline", lastLive: NOW - 2 * day,
      reason: "You watched a VOD on Thursday",
      vods: [
        { title: "Sunday cozy stream: Animal Crossing island tour and catch-up", at: NOW - 2 * day, seconds: 14820 },
        { title: "Speedrun practice, any% glitchless", at: NOW - 4 * day, seconds: 9930 },
        { title: "Viewer games night", at: NOW - 6 * day, seconds: 12610 },
        { title: "Charity marathon hour 1–12 (part 1)", at: NOW - 9 * day, seconds: 43200 }
      ]
    },
    {
      login: "dunewalker", name: "dunewalker", platform: "twitch", state: "unknown",
      reason: "Opened last month"
    },
    {
      login: "lumen_ash", name: "lumen_ash", platform: "twitch", state: "offline", lastLive: NOW - 21 * day,
      reason: "Opened in October",
      vods: []
    },
    {
      login: "sable_rr", name: "sable_rr", platform: "twitch", state: "offline", lastLive: NOW - 1 * day,
      reason: "Followed last week", followOnly: true,
      vods: [{ title: "Rhythm game requests", at: NOW - 1 * day, seconds: 7260 }]
    },
    {
      login: "ohana_vee", name: "ohana_vee", platform: "twitch", state: "offline", lastLive: NOW - 5 * day,
      reason: "Followed in August", followOnly: true,
      vods: [{ title: "Pottery and podcasts", at: NOW - 5 * day, seconds: 8100 }]
    }
  ];

  // Remote matches (Twitch search: Helix signed in, anonymous GQL signed out, per D-034). Never a local person.
  const remote = {
    oh: [
      { login: "ohmyshelby", name: "ohmyshelby", platform: "twitch", state: "live", viewers: 640,
        title: "first playthrough, no spoilers please", category: "Elden Ring", reason: "Twitch search" },
      { login: "ohno_its_rin", name: "ohno_its_rin", platform: "twitch", state: "live", viewers: 92,
        title: "chill lofi coding", category: "Software and Game Development", reason: "Twitch search" },
      { login: "ohdeerlord", name: "ohdeerlord", platform: "twitch", state: "offline", lastLive: NOW - 3 * day,
        reason: "Twitch search", vods: [{ title: "Deer hunter but make it cozy", at: NOW - 3 * day, seconds: 10840 }] }
    ]
  };

  function matches(person, q) {
    if (!q) return true;
    const name = person.name.toLowerCase();
    if (name.startsWith(q)) return true;
    return name.split(/[_\s-]/).some(part => part.startsWith(q));
  }

  function local(q, signedIn) {
    q = (q || "").trim().toLowerCase();
    return people.filter(p => (signedIn || !p.followOnly) && matches(p, q));
  }

  function remoteFor(q) {
    q = (q || "").trim().toLowerCase();
    if (q.length < 2) return [];
    const key = Object.keys(remote).find(k => q.startsWith(k) || k.startsWith(q));
    return key ? remote[key].filter(p => matches(p, q)) : [];
  }

  // A URL or a bare channel name, as src/source.js would read it (simplified for the mock).
  function parse(input) {
    const s = (input || "").trim();
    let m = s.match(/twitch\.tv\/videos\/(\d+)/i);
    if (m) return { platform: "twitch", kind: "VOD", label: "twitch.tv/videos/" + m[1] };
    m = s.match(/twitch\.tv\/([a-z0-9_]{3,25})\/?$/i);
    if (m) return { platform: "twitch", kind: "Channel", label: "twitch.tv/" + m[1].toLowerCase() };
    m = s.match(/(youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);
    if (m) return { platform: "youtube", kind: "Video", label: "youtube.com/watch?v=" + m[2] };
    if (/^[a-z0-9_]{3,25}$/i.test(s)) return { platform: "twitch", kind: "Channel", label: "twitch.tv/" + s.toLowerCase() };
    return null;
  }

  const isURL = s => /^(https?:\/\/|www\.|twitch\.tv|youtube\.com|youtu\.be)/i.test((s || "").trim());

  function compact(n) {
    if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function ago(at) {
    const d = Math.round((NOW - at) / day);
    if (d < 1) return "today";
    if (d < 14) return d + "d";
    return Math.round(d / 7) + "w";
  }

  function agoLong(at) {
    const d = Math.round((NOW - at) / day);
    if (d < 1) return "today";
    if (d === 1) return "yesterday";
    if (d < 14) return d + " days ago";
    return Math.round(d / 7) + " weeks ago";
  }

  function date(at) {
    return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function length(seconds) {
    const two = n => String(n).padStart(2, "0");
    return Math.floor(seconds / 3600) + ":" + two(Math.floor(seconds % 3600 / 60)) + ":" + two(seconds % 60);
  }

  // The VoiceOver name of a row: name, live state, and viewers when live. Position comes from aria-posinset.
  function spoken(p) {
    if (p.state === "live") return p.name + ", live, " + p.viewers.toLocaleString("en-US") + " viewers, " + p.category;
    if (p.state === "offline") return p.name + ", offline, last live " + agoLong(p.lastLive);
    if (p.state === "unknown") return p.name + ", status unavailable";
    return p.name;
  }

  return { people, local, remoteFor, parse, isURL, compact, ago, agoLong, date, length, spoken };
})();
