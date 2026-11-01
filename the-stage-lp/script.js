/* =========================================================
   The Stage LP – interactions & form handling
   ---------------------------------------------------------
   CONFIG: fill these in before going live.
   - FORM_ENDPOINT : Google Apps Script Web App URL (see google-apps-script.gs).
                     Leave empty to run in demo mode (no data is sent).
   - WHATSAPP_NUMBER: number (country code, no +) that receives booking chats.
   - WA_COMMUNITY_URL: WhatsApp Community invite link (DUMMY for now; keep in
                     sync with WA_COMMUNITY_URL in apps-script/Code.gs).
   The playbook PDF is delivered by email from Apps Script, not from this page.
   ========================================================= */
const CONFIG = {
  FORM_ENDPOINT: "https://script.google.com/macros/s/AKfycbzMEqDTmGwDfUvR9SQ8_1c7B6wzqbjxiIAhjqFw3_4QtpEHyqiK38sRsDIwTp49ywjR-g/exec",
  WHATSAPP_NUMBER: "60175667315",
  WA_COMMUNITY_URL: "https://chat.whatsapp.com/DUMMY-TheFamilyVillage-Community"
};

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- WhatsApp Community links ---------- */
  $$("[data-community]").forEach(a => a.href = CONFIG.WA_COMMUNITY_URL);

  /* ---------- year ---------- */
  const yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- header shadow + mobile bar ---------- */
  const header = $(".header"), mbar = $(".mbar");
  const onScroll = () => {
    header.classList.toggle("scrolled", window.scrollY > 10);
    if (mbar) {
      const book = $("#book").getBoundingClientRect(), guide = $("#guide").getBoundingClientRect();
      const inForm = (book.top < innerHeight && book.bottom > 0) || (guide.top < innerHeight * .6 && guide.bottom > 0);
      mbar.classList.toggle("show", window.scrollY > 600 && !inForm);
    }
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- mobile nav ---------- */
  const toggle = $("#navToggle"), nav = $("#nav");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
  $$("#nav a").forEach(a => a.addEventListener("click", () => { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }));

  /* ---------- active nav link ---------- */
  // Every section is observed, so sections without a nav link (hero, booking…) clear the highlight.
  const links = $$("#nav a:not(.btn)");
  const spy = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) links.forEach(l => l.classList.toggle("active", !!e.target.id && l.getAttribute("href") === "#" + e.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("main > section").forEach(s => spy.observe(s));

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: .12 });
  $$(".reveal").forEach((el, i) => { el.style.transitionDelay = (i % 3) * 80 + "ms"; io.observe(el); });

  /* ---------- pause offscreen videos ---------- */
  const vio = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target; e.isIntersecting ? v.play().catch(() => {}) : v.pause();
  }), { threshold: .2 });
  $$("video").forEach(v => vio.observe(v));

  /* ---------- tracking params (UTM) ---------- */
  const qs = new URLSearchParams(location.search);
  const tracking = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"].forEach(k => { if (qs.get(k)) tracking[k] = qs.get(k); });

  /* ---------- validation helpers ---------- */
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const phoneOk = v => v.replace(/\D/g, "").length >= 7 && /^[0-9 +\-]+$/.test(v);

  function validate(form) {
    let firstBad = null;
    $$("[required]", form).forEach(input => {
      if (input.type === "checkbox") {
        const wrap = input.closest(".check");
        const bad = !input.checked;
        wrap.classList.toggle("invalid", bad);
        if (bad && !firstBad) firstBad = input;
        return;
      }
      const field = input.closest(".field");
      const v = input.value.trim();
      let bad = !v;
      if (!bad && input.type === "email") bad = !emailOk(v);
      if (!bad && input.type === "tel") bad = !phoneOk(v);
      field.classList.toggle("invalid", bad);
      if (bad && !firstBad) firstBad = input;
    });
    // optional tel fields: validate only if filled
    $$("input[type=tel]:not([required])", form).forEach(input => {
      const bad = input.value.trim() && !phoneOk(input.value.trim());
      input.closest(".field").classList.toggle("invalid", !!bad);
      if (bad && !firstBad) firstBad = input;
    });
    // checkbox groups that need at least one
    const days = $("#dayChips", form);
    if (days) {
      const bad = !$$("input:checked", days).length;
      days.closest(".field").classList.toggle("invalid", bad);
      if (bad && !firstBad) firstBad = $("input", days);
    }
    if (firstBad) { firstBad.focus({ preventScroll: true }); firstBad.scrollIntoView({ behavior: "smooth", block: "center" }); }
    return !firstBad;
  }

  // live clear errors
  document.addEventListener("input", e => {
    const f = e.target.closest(".field.invalid"); if (f) f.classList.remove("invalid");
    const c = e.target.closest(".check.invalid"); if (c && e.target.checked) c.classList.remove("invalid");
  });
  document.addEventListener("change", e => {
    const f = e.target.closest(".field.invalid"); if (f) f.classList.remove("invalid");
  });

  function collect(form) {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
      if (k === "company") continue;
      data[k] = data[k] ? data[k] + ", " + v : v;
    }
    data.consent = data.consent ? "Yes" : "No";
    data.submitted_at = new Date().toISOString();
    data.page = location.href.split("?")[0];
    Object.assign(data, tracking);
    return data;
  }

  // WhatsApp = country code + local number. The lead form's number is optional:
  // with no number, drop the code too so the sheet doesn't show a lone "+60".
  function withFullNumber(data) {
    if (data.whatsapp) data.whatsapp_full = ((data.country_code || "") + " " + data.whatsapp).trim();
    else delete data.country_code;
    return data;
  }

  async function send(data) {
    if (!CONFIG.FORM_ENDPOINT) { console.info("[demo mode] form data:", data); return new Promise(r => setTimeout(r, 600)); }
    // no-cors: Apps Script doesn't return CORS headers; the request is still delivered.
    return fetch(CONFIG.FORM_ENDPOINT, { method: "POST", mode: "no-cors", body: new URLSearchParams(data) });
  }

  function fbq(event, params) { if (typeof window.fbq === "function") window.fbq("track", event, params); if (typeof window.gtag === "function") window.gtag("event", event, params); }

  /* ---------- booking form ---------- */
  const bForm = $("#bookingForm");
  const ageSel = $("#b_age"), ageHint = $("#ageHint");
  ageSel.addEventListener("change", () => {
    const a = parseInt(ageSel.value, 10);
    if (!a) { ageHint.hidden = true; return; }
    ageHint.hidden = false;
    ageHint.textContent = a <= 8 ? "🎈 Younger Group (5–8)" : "🎤 Older Group (9–12)";
  });

  bForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (bForm.company.value) return; // bot
    if (!validate(bForm)) return;
    const btn = $("button[type=submit]", bForm);
    btn.classList.add("is-loading");
    const data = collect(bForm);
    const age = parseInt(data.child_age, 10);
    data.age_group = age <= 8 ? "5-8" : "9-12";
    withFullNumber(data);
    try { await send(data); } catch (err) { console.warn(err); }
    btn.classList.remove("is-loading");
    fbq("Lead", { content_name: "The Stage Trial Booking", value: 55, currency: "MYR" });

    const msg =
`Hi The Family Village! 👋 I'd like to book a *The Stage trial class (RM55)*.

👤 Parent: ${data.parent_name}
🧒 Child: ${data.child_name}, ${data.child_age} y/o (Group ${data.age_group})
📅 Preferred: ${data.preferred_days || "-"}
📍 Based in: ${data.location}
${data.goals ? "🎯 Hoping to build: " + data.goals + "\n" : ""}${data.notes ? "📝 Notes: " + data.notes + "\n" : ""}
Thank you!`;
    $("#waConfirm").href = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    $$("#bookModal [data-name]").forEach(n => n.textContent = data.parent_name.split(" ")[0]);
    $$("#bookModal [data-child]").forEach(n => n.textContent = data.child_name);
    $$("#bookModal [data-email]").forEach(n => n.textContent = data.email);
    openModal();
    bForm.reset(); ageHint.hidden = true;
  });

  /* ---------- modal ---------- */
  const modal = $("#bookModal");
  let lastFocus = null;
  function openModal() { lastFocus = document.activeElement; modal.hidden = false; $("#waConfirm").focus(); document.body.style.overflow = "hidden"; }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }
  $$("[data-close]", modal).forEach(b => b.addEventListener("click", closeModal));
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  /* ---------- lead magnet form ---------- */
  const lForm = $("#leadForm"), lSuccess = $("#leadSuccess");
  lForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (lForm.company.value) return;
    if (!validate(lForm)) return;
    const btn = $("button[type=submit]", lForm);
    btn.classList.add("is-loading");
    const data = collect(lForm);
    withFullNumber(data);
    try { await send(data); } catch (err) { console.warn(err); }
    btn.classList.remove("is-loading");
    fbq("Lead", { content_name: "7 Days to Speak Up" });
    $$("[data-name]", lSuccess).forEach(n => n.textContent = data.parent_name.split(" ")[0]);
    $$("[data-email]", lSuccess).forEach(n => n.textContent = data.email);
    lForm.hidden = true; lSuccess.hidden = false;
    lSuccess.scrollIntoView({ behavior: "smooth", block: "center" });
  });
})();
