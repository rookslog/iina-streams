"use strict";
// The viewer's own state for the mocks. INVENTED: the people and broadcasts are real (snapshot.js), but this
// history, these positions and what is playing are made up for the mock. Nothing here came from the operator.
window.VIEWER = {
  playing: { login: "ohnepixel", kind: "live", quality: "1080p60" },
  qualities: ["Source (1080p60)", "720p60", "480p", "360p", "Audio only"],
  signedIn: true,
  // Most-watched first (local watch history, spec §3 frecency). Viewers are shown, never the sort key.
  rank: ["ohnepixel", "northernlion", "tarik", "jerma985", "lirik", "cohhcarnage", "squeex", "ludwig",
         "shroud", "hasanabi", "summit1g", "sodapoppin", "moistcr1tikal", "vinesauce"],
  // Started and not finished, newest-watched first. vod = index into that person's snapshot vods.
  // watchedAt is days before the snapshot. One is three weeks old on purpose (no age cutoff).
  unfinished: [
    { login: "northernlion", vod: 1, fraction: 0.42, watchedDaysAgo: 0.6 },
    { login: "tarik", vod: 0, fraction: 0.18, watchedDaysAgo: 1.1 },
    { login: "jerma985", vod: 2, fraction: 0.71, watchedDaysAgo: 9 },
    { login: "cohhcarnage", vod: 1, fraction: 0.83, watchedDaysAgo: 21 }
  ],
  // When the viewer last opened each person (days before the snapshot), for "new since you last looked".
  lastVisitDaysAgo: { ohnepixel: 0, northernlion: 0.6, tarik: 1.1, jerma985: 9, lirik: 2, cohhcarnage: 21,
                      squeex: 4, ludwig: 6, shroud: 12, hasanabi: 30, summit1g: 45 }
};
