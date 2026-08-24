(function () {
  "use strict";

  var MAX_GUESTS = 8;
  var DAY_COUNT = 21;
  var TIMES = [
    { label: "6:00 PM", sub: "First seating" },
    { label: "8:30 PM", sub: "Second seating" },
  ];

  var state = {
    guests: 2,
    dateKey: null,
    time: null,
    name: "",
    phone: "",
    notes: "",
    submitted: false,
    reference: null,
    submitting: false,
    errorMessage: "",
  };

  var availabilityByDate = {}; // dateKey -> { closed, slots: { "6:00 PM": {remaining, capacity, taken}, ... } }
  var DAYS = [];

  function todayKey() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function buildDayMeta(startKey, count) {
    var out = [];
    var base = new Date(startKey + "T00:00:00");
    for (var i = 0; i < count; i++) {
      var d = new Date(base.getTime() + i * 86400000);
      out.push({
        key: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"),
        dow: d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
        dom: String(d.getDate()).padStart(2, "0"),
        month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
        long: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
      });
    }
    return out;
  }

  function soldOut(dateKey) {
    var a = availabilityByDate[dateKey];
    if (!a) return false;
    return TIMES.every(function (t) {
      return a.slots[t.label] && a.slots[t.label].remaining <= 0;
    });
  }

  function isClosed(dateKey) {
    var a = availabilityByDate[dateKey];
    return !!(a && a.closed);
  }

  function remainingFor(dateKey, time) {
    var a = availabilityByDate[dateKey];
    if (!a || !a.slots[time]) return null;
    return a.slots[time].remaining;
  }

  var guestsEl = document.getElementById("tn-guests-cells");
  var daysEl = document.getElementById("tn-days-cells");
  var timesEl = document.getElementById("tn-times-cells");
  var nameInput = document.getElementById("tn-name");
  var phoneInput = document.getElementById("tn-phone");
  var notesInput = document.getElementById("tn-notes");
  var formEl = document.getElementById("tn-booking-form");
  var confirmationEl = document.getElementById("tn-confirmation");
  var confirmBtn = document.getElementById("tn-confirm-btn");
  var resetBtn = document.getElementById("tn-reset-btn");
  var errorBox = document.getElementById("tn-booking-error");

  var sumGuests = document.getElementById("tn-sum-guests");
  var sumDate = document.getElementById("tn-sum-date");
  var sumTime = document.getElementById("tn-sum-time");

  var confReference = document.getElementById("tn-conf-reference");
  var confDate = document.getElementById("tn-conf-date");
  var confSeating = document.getElementById("tn-conf-seating");

  function cell() {
    var div = document.createElement("div");
    div.className = "tn-cell";
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");
    return div;
  }

  function renderGuests() {
    guestsEl.innerHTML = "";
    for (var n = 1; n <= MAX_GUESTS; n++) {
      (function (n) {
        var el = cell();
        var big = document.createElement("span");
        big.className = "big";
        big.textContent = String(n);
        var small = document.createElement("span");
        small.className = "small";
        small.textContent = n === 1 ? "guest" : "guests";
        el.appendChild(big);
        el.appendChild(small);
        if (state.guests === n) el.classList.add("selected");
        el.addEventListener("click", function () {
          state.guests = n;
          render();
        });
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.guests = n; render(); }
        });
        guestsEl.appendChild(el);
      })(n);
    }
  }

  function renderDays() {
    daysEl.innerHTML = "";
    DAYS.forEach(function (d) {
      var el = cell();
      var dow = document.createElement("span");
      dow.className = "small";
      dow.textContent = d.dow;
      var dom = document.createElement("span");
      dom.className = "big";
      dom.textContent = d.dom;
      var month = document.createElement("span");
      month.className = "small";

      var closed = isClosed(d.key);
      var full = !closed && soldOut(d.key);
      month.textContent = full ? "FULL" : d.month;

      el.appendChild(dow);
      el.appendChild(dom);
      el.appendChild(month);

      if (d.key === todayKey()) el.classList.add("today");

      if (closed || full) {
        el.classList.add("disabled");
      } else {
        if (state.dateKey === d.key) el.classList.add("selected");
        el.addEventListener("click", function () {
          state.dateKey = d.key;
          state.time = null;
          render();
        });
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.dateKey = d.key; state.time = null; render(); }
        });
      }
      daysEl.appendChild(el);
    });
  }

  function renderTimes() {
    timesEl.innerHTML = "";
    TIMES.forEach(function (t) {
      var el = cell();
      var big = document.createElement("span");
      big.className = "big";
      big.textContent = t.label;
      var small = document.createElement("span");
      small.className = "small";

      var remaining = state.dateKey ? remainingFor(state.dateKey, t.label) : null;
      var disabled = !state.dateKey || remaining === 0;

      if (!state.dateKey) small.textContent = t.sub;
      else if (remaining === 0) small.textContent = "Sold out";
      else if (remaining !== null && remaining <= 3) small.textContent = remaining + " left";
      else small.textContent = t.sub;

      el.appendChild(big);
      el.appendChild(small);

      if (disabled) {
        el.classList.add("disabled");
      } else {
        if (state.time === t.label) el.classList.add("selected");
        el.addEventListener("click", function () {
          state.time = t.label;
          render();
        });
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.time = t.label; render(); }
        });
      }
      timesEl.appendChild(el);
    });
  }

  function chosenDay() {
    return DAYS.filter(function (d) { return d.key === state.dateKey; })[0] || null;
  }

  function guestWord() {
    return state.guests === 1 ? "guest" : "guests";
  }

  function dateLabel() {
    var d = chosenDay();
    return d ? d.long : "Not yet chosen";
  }

  function timeLabel() {
    return state.time || "Not yet chosen";
  }

  function selectionRemaining() {
    if (!state.dateKey || !state.time) return null;
    return remainingFor(state.dateKey, state.time);
  }

  function isReady() {
    if (state.submitted || state.submitting) return false;
    if (!(state.dateKey && state.time && state.name.trim() && state.phone.trim())) return false;
    var remaining = selectionRemaining();
    return remaining === null || remaining >= state.guests;
  }

  function renderSummary() {
    sumGuests.textContent = state.guests + " " + guestWord();
    sumDate.textContent = dateLabel();
    sumTime.textContent = timeLabel();
  }

  function renderConfirmButton() {
    var ready = isReady();
    confirmBtn.classList.toggle("ready", ready);
    confirmBtn.disabled = !ready;

    if (state.submitting) {
      confirmBtn.textContent = "Sending your request…";
    } else if (state.submitted) {
      confirmBtn.textContent = "Awaiting our call";
    } else if (!(state.dateKey && state.time && state.name.trim() && state.phone.trim())) {
      confirmBtn.textContent = "Complete the steps above";
    } else {
      var remaining = selectionRemaining();
      if (remaining !== null && remaining < state.guests) {
        confirmBtn.textContent = "Only " + remaining + " seat" + (remaining === 1 ? "" : "s") + " left for this seating";
      } else {
        confirmBtn.textContent = "Confirm and continue";
      }
    }
  }

  function renderError() {
    if (!errorBox) return;
    if (state.errorMessage) {
      errorBox.textContent = state.errorMessage;
      errorBox.hidden = false;
    } else {
      errorBox.hidden = true;
    }
  }

  function render() {
    renderGuests();
    renderDays();
    renderTimes();
    renderSummary();
    renderConfirmButton();
    renderError();

    if (state.submitted) {
      formEl.hidden = true;
      confirmationEl.hidden = false;
      confReference.textContent = state.reference || "";
      confDate.textContent = dateLabel();
      confSeating.textContent = timeLabel() + " · " + state.guests + " " + guestWord();
    } else {
      formEl.hidden = false;
      confirmationEl.hidden = true;
    }
  }

  nameInput.addEventListener("input", function () {
    state.name = nameInput.value;
    renderConfirmButton();
  });
  phoneInput.addEventListener("input", function () {
    state.phone = phoneInput.value;
    renderConfirmButton();
  });
  notesInput.addEventListener("input", function () {
    state.notes = notesInput.value;
  });

  function refreshAvailability() {
    return fetch("/api/availability?start=" + todayKey() + "&days=" + DAY_COUNT)
      .then(function (res) {
        if (!res.ok) throw new Error("Could not load availability.");
        return res.json();
      })
      .then(function (data) {
        availabilityByDate = {};
        (data.dates || []).forEach(function (d) {
          availabilityByDate[d.dateKey] = d;
        });
        DAYS = buildDayMeta(data.start || todayKey(), data.days || DAY_COUNT);
      });
  }

  confirmBtn.addEventListener("click", function () {
    if (!isReady()) return;
    state.submitting = true;
    state.errorMessage = "";
    render();

    fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateKey: state.dateKey,
        time: state.time,
        guests: state.guests,
        name: state.name,
        phone: state.phone,
        notes: state.notes,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            var err = new Error(data.error || "Could not submit your request.");
            err.isConflict = res.status === 409;
            throw err;
          }
          return data;
        });
      })
      .then(function (data) {
        state.submitting = false;
        state.submitted = true;
        state.reference = data.reference;
        render();
      })
      .catch(function (err) {
        state.submitting = false;
        state.errorMessage = err.message;
        refreshAvailability().finally(render);
      });
  });

  resetBtn.addEventListener("click", function () {
    state.submitted = false;
    state.reference = null;
    state.dateKey = null;
    state.time = null;
    state.name = "";
    state.phone = "";
    state.notes = "";
    state.errorMessage = "";
    nameInput.value = "";
    phoneInput.value = "";
    notesInput.value = "";
    refreshAvailability().finally(render);
  });

  function applyImages(images) {
    images = images || {};
    document.querySelectorAll("[data-image-key]").forEach(function (el) {
      var url = images[el.getAttribute("data-image-key")];
      if (!url) return;
      var placeholder = el.querySelector(".tn-photo");
      if (placeholder) placeholder.remove();
      if (el.querySelector(".tn-fill-img")) return;
      var img = document.createElement("img");
      img.className = "tn-fill-img";
      img.loading = "lazy";
      img.alt = "";
      img.src = url;
      el.appendChild(img);
    });
  }

  function loadSiteContent() {
    fetch("/api/site-content")
      .then(function (res) { return res.ok ? res.json() : { images: {} }; })
      .then(function (data) { applyImages(data.images); })
      .catch(function () {});
  }

  var yearEl = document.getElementById("tn-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  loadSiteContent();
  refreshAvailability()
    .catch(function (err) {
      state.errorMessage = err.message;
    })
    .finally(render);

  // ---- Nav: mobile menu toggle + current-section indicator ----
  (function initNav() {
    var toggle = document.getElementById("tn-nav-toggle");
    var links = document.getElementById("tn-nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", function () {
        var open = links.classList.toggle("open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      links.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          links.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }

    var navLinks = document.querySelectorAll(".tn-nav a[href^='#']");
    if (navLinks.length && "IntersectionObserver" in window) {
      var linkFor = {};
      navLinks.forEach(function (a) {
        linkFor[a.getAttribute("href").slice(1)] = a;
      });
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            var link = linkFor[entry.target.id];
            if (!link) return;
            if (entry.isIntersecting) {
              navLinks.forEach(function (a) { a.classList.remove("active"); });
              link.classList.add("active");
            }
          });
        },
        { rootMargin: "-45% 0px -50% 0px" }
      );
      Object.keys(linkFor).forEach(function (id) {
        var section = document.getElementById(id);
        if (section) observer.observe(section);
      });
    }
  })();
})();
