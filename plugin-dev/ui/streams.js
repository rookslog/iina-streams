"use strict";
(function () {
  const el = (id) => document.getElementById(id);
  const quality = el("quality"), refresh = el("refresh");
  const status = el("status"), error = el("error"), channel = el("channel");
  let lastFormats = "";
  const label = (id) => id === "auto720" ? "Auto · prefer 720p" :
    id === "audio_only" ? "Audio only" : id;
  function render(payload) {
    if (!payload || typeof payload !== "object") return;
    const available = Array.isArray(payload.formats) ? payload.formats.filter((x) => /^[a-zA-Z0-9_]+$/.test(x)) : ["auto720"];
    const signature = available.join(",");
    if (signature !== lastFormats) {
      quality.replaceChildren();
      available.forEach(function (id) {
        const opt = document.createElement("option");
        opt.value = id; opt.textContent = label(id);
        quality.appendChild(opt);
      });
      lastFormats = signature;
    }
    channel.textContent = typeof payload.channel === "string" ? payload.channel : "Twitch";
    status.textContent = typeof payload.status === "string" ? payload.status : "Ready";
    quality.value = payload.quality || "auto720";
    quality.disabled = Boolean(payload.busy) || available.length < 2;
    refresh.disabled = Boolean(payload.busy);
    const err = typeof payload.error === "string" ? payload.error : "";
    error.textContent = err;
    error.hidden = !err;
  }
  quality.addEventListener("change", function () { iina.postMessage("change-quality", quality.value); });
  refresh.addEventListener("click", function () { iina.postMessage("refresh-qualities", {}); });
  el("hide").addEventListener("click", function () { iina.postMessage("hide", {}); });
  iina.onMessage("state", render);
  iina.postMessage("ready", { ready: true });
}());
