(function () {
  "use strict";

  var IMAGE_LABELS = {
    hero: "Hero — full-screen counter shot",
    craftMain: "Gallery — featured wide photo",
    craftGallery1: "Gallery — small tile 1",
    craftGallery2: "Gallery — small tile 2",
    craftGallery3: "Gallery — small tile 3",
    craftGallery4: "Gallery — wide tile 1",
    craftGallery5: "Gallery — wide tile 2",
  };

  var loginWrap = document.getElementById("tn-admin-login");
  var loginForm = document.getElementById("tn-a-login-form");
  var loginError = document.getElementById("tn-a-login-error");
  var app = document.getElementById("tn-admin-app");
  var logoutBtn = document.getElementById("tn-a-logout");
  var tabs = document.querySelectorAll(".tn-a-tab");
  var panels = {
    reservations: document.getElementById("tn-a-panel-reservations"),
    photos: document.getElementById("tn-a-panel-photos"),
    content: document.getElementById("tn-a-panel-content"),
    sections: document.getElementById("tn-a-panel-sections"),
    capacity: document.getElementById("tn-a-panel-capacity"),
  };

  var bookingsBody = document.getElementById("tn-a-bookings-body");
  var bookingsEmpty = document.getElementById("tn-a-bookings-empty");
  var summaryEl = document.getElementById("tn-a-summary");
  var photoGrid = document.getElementById("tn-a-photo-grid");

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({}, options.headers);
    options.credentials = "same-origin";
    if (options.body && !(options.body instanceof FormData)) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    return fetch(path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ").");
        return data;
      });
    });
  }

  function showApp() {
    loginWrap.hidden = true;
    app.hidden = false;
    loadBookings();
    loadPhotos();
    loadContent();
    loadSections();
    loadCapacity();
  }

  function showLogin() {
    app.hidden = true;
    loginWrap.hidden = false;
  }

  function init() {
    api("/api/admin/me")
      .then(function (data) {
        if (data.authenticated) showApp();
        else showLogin();
      })
      .catch(showLogin);
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.hidden = true;
    var username = document.getElementById("tn-a-username").value;
    var password = document.getElementById("tn-a-password").value;
    api("/api/admin/login", { method: "POST", body: { username: username, password: password } })
      .then(showApp)
      .catch(function (err) {
        loginError.textContent = err.message;
        loginError.hidden = false;
      });
  });

  logoutBtn.addEventListener("click", function () {
    api("/api/admin/logout", { method: "POST" }).finally(showLogin);
  });

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      Object.keys(panels).forEach(function (key) {
        panels[key].hidden = key !== tab.dataset.tab;
      });
    });
  });

  function todayKey() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fmtDate(dateKey) {
    var d = new Date(dateKey + "T00:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  function loadBookings() {
    api("/api/admin/bookings")
      .then(function (data) {
        renderBookings(data.bookings || []);
      })
      .catch(function (err) {
        bookingsBody.innerHTML = "";
        bookingsEmpty.hidden = false;
        bookingsEmpty.textContent = err.message;
      });
  }

  function renderBookings(bookings) {
    bookingsBody.innerHTML = "";
    bookingsEmpty.hidden = bookings.length > 0;

    var today = todayKey();
    var upcomingActive = bookings.filter(function (b) {
      return b.dateKey >= today && b.status !== "cancelled";
    });
    var totalGuests = upcomingActive.reduce(function (sum, b) { return sum + b.guests; }, 0);
    summaryEl.textContent = upcomingActive.length + " upcoming request(s) · " + totalGuests + " guest(s) total";

    bookings.forEach(function (b) {
      var tr = document.createElement("tr");
      if (b.dateKey < today) tr.className = "past";

      tr.innerHTML =
        "<td>" + fmtDate(b.dateKey) + "</td>" +
        "<td>" + b.time + "</td>" +
        "<td>" + b.guests + "</td>" +
        "<td>" + escapeHtml(b.name) + "</td>" +
        "<td>" + escapeHtml(b.phone) + "</td>" +
        "<td class=\"notes\">" + escapeHtml(b.notes || "—") + "</td>" +
        "<td>" + escapeHtml(b.reference) + "</td>" +
        "<td><span class=\"tn-a-badge " + b.status + "\">" + b.status + "</span></td>";

      var actionsTd = document.createElement("td");
      var actions = document.createElement("div");
      actions.className = "tn-a-row-actions";

      if (b.status !== "confirmed") {
        actions.appendChild(makeActionBtn("Confirm", function () { setStatus(b.id, "confirmed"); }));
      }
      if (b.status !== "cancelled") {
        actions.appendChild(makeActionBtn("Cancel", function () { setStatus(b.id, "cancelled"); }));
      }
      if (b.status !== "pending") {
        actions.appendChild(makeActionBtn("Reset", function () { setStatus(b.id, "pending"); }));
      }
      actionsTd.appendChild(actions);
      tr.appendChild(actionsTd);

      bookingsBody.appendChild(tr);
    });
  }

  function makeActionBtn(label, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tn-a-btn tn-a-btn-sm";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function setStatus(id, status) {
    api("/api/admin/bookings/" + id, { method: "PATCH", body: { status: status } })
      .then(loadBookings)
      .catch(function (err) { alert(err.message); });
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function loadPhotos() {
    api("/api/admin/photos")
      .then(function (data) {
        renderPhotos(data.keys || [], data.images || {});
      })
      .catch(function (err) {
        photoGrid.innerHTML = "<p class=\"tn-a-empty\">" + escapeHtml(err.message) + "</p>";
      });
  }

  function renderPhotos(keys, images) {
    photoGrid.innerHTML = "";
    keys.forEach(function (key) {
      var url = images[key];
      var card = document.createElement("div");
      card.className = "tn-a-photo-card";

      var preview = document.createElement("div");
      preview.className = "tn-a-photo-preview";
      if (url) {
        var img = document.createElement("img");
        img.src = url;
        img.alt = "";
        preview.appendChild(img);
      } else {
        preview.textContent = "No photo yet — placeholder shown on site";
      }
      card.appendChild(preview);

      var name = document.createElement("div");
      name.className = "tn-a-photo-name";
      name.textContent = IMAGE_LABELS[key] || key;
      card.appendChild(name);

      var actions = document.createElement("div");
      actions.className = "tn-a-photo-actions";

      var fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/jpeg,image/png,image/webp,image/avif";
      fileInput.id = "file-" + key;

      var uploadLabel = document.createElement("label");
      uploadLabel.setAttribute("for", "file-" + key);
      uploadLabel.className = "tn-a-btn tn-a-btn-sm";
      uploadLabel.textContent = url ? "Replace" : "Upload";
      uploadLabel.style.cursor = "pointer";

      fileInput.addEventListener("change", function () {
        if (!fileInput.files || !fileInput.files[0]) return;
        uploadPhoto(key, fileInput.files[0]);
      });

      actions.appendChild(fileInput);
      actions.appendChild(uploadLabel);

      if (url) {
        actions.appendChild(makeActionBtn("Remove", function () { removePhoto(key); }));
      }

      card.appendChild(actions);
      photoGrid.appendChild(card);
    });
  }

  function uploadPhoto(key, file) {
    var formData = new FormData();
    formData.append("key", key);
    formData.append("image", file);
    api("/api/admin/photos", { method: "POST", body: formData })
      .then(loadPhotos)
      .catch(function (err) { alert(err.message); });
  }

  function removePhoto(key) {
    api("/api/admin/photos/" + key, { method: "DELETE" })
      .then(loadPhotos)
      .catch(function (err) { alert(err.message); });
  }

  // ---- Content ----

  var CONTENT_GROUPS = [
    { title: "Hero", prefix: "hero." },
    { title: "Concept", prefix: "concept." },
    { title: "Craft", prefix: "craft." },
    { title: "Visit", prefix: "visit." },
    { title: "Reserve", prefix: "reserve." },
    { title: "Footer", prefix: "footer." },
  ];

  var CONTENT_LABELS = {
    "hero.kicker": "Kicker",
    "hero.cityLabel": "City label",
    "hero.ctaLabel": "Reserve button text",
    "concept.eyebrow": "Eyebrow",
    "concept.headline": "Headline (one line per row)",
    "concept.body1": "Body paragraph 1",
    "concept.body2": "Body paragraph 2 — soft-opening note",
    "concept.note": "Callout note",
    "craft.eyebrow": "Eyebrow",
    "craft.headline": "Headline (one line per row)",
    "craft.intro": "Intro paragraph",
    "craft.captionMain": "Featured photo caption",
    "craft.caption1": "Tile 1 caption",
    "craft.caption2": "Tile 2 caption",
    "craft.caption3": "Tile 3 caption",
    "craft.caption4": "Tile 4 caption",
    "craft.caption5": "Tile 5 caption",
    "visit.eyebrow": "Eyebrow",
    "visit.headline": "Headline",
    "visit.card1Label": "Card 1 label",
    "visit.card1Title": "Card 1 title",
    "visit.card1Body": "Card 1 body",
    "visit.card1Fineprint": "Card 1 fine print",
    "visit.card2Label": "Card 2 label",
    "visit.card2Title": "Card 2 title",
    "visit.hoursNote": "Hours note",
    "reserve.eyebrow": "Eyebrow",
    "reserve.headline": "Headline (one line per row)",
    "reserve.intro": "Intro paragraph",
    "reserve.fineprint": "Fine print under the confirm button",
    "footer.tagline": "Tagline",
    "footer.note": "Policy note",
  };

  function loadContent() {
    api("/api/admin/content")
      .then(function (data) { renderContent(data.text || {}, data.defaults || {}, data.multiline || []); })
      .catch(function (err) {
        document.getElementById("tn-a-content-list").innerHTML =
          "<p class=\"tn-a-empty\">" + escapeHtml(err.message) + "</p>";
      });
  }

  function flashStatus(el) {
    el.classList.add("show");
    clearTimeout(el._flashTimer);
    el._flashTimer = setTimeout(function () { el.classList.remove("show"); }, 1500);
  }

  function renderContent(text, defaults, multilineKeys) {
    var container = document.getElementById("tn-a-content-list");
    container.innerHTML = "";

    CONTENT_GROUPS.forEach(function (group) {
      var keys = Object.keys(defaults).filter(function (k) { return k.indexOf(group.prefix) === 0; });
      if (!keys.length) return;

      var groupEl = document.createElement("div");
      groupEl.className = "tn-a-content-group";
      var title = document.createElement("div");
      title.className = "tn-a-content-group-title";
      title.textContent = group.title;
      groupEl.appendChild(title);

      keys.forEach(function (key) {
        var isMultiline = multilineKeys.indexOf(key) !== -1;
        var value = text[key] || "";
        var useTextarea = isMultiline || value.length > 90;

        var item = document.createElement("div");
        item.className = "tn-a-content-item";

        var label = document.createElement("div");
        label.className = "tn-a-content-item-label";
        label.textContent = CONTENT_LABELS[key] || key;
        item.appendChild(label);

        var field = document.createElement(useTextarea ? "textarea" : "input");
        if (!useTextarea) field.type = "text";
        field.value = value;
        item.appendChild(field);

        var actions = document.createElement("div");
        actions.className = "tn-a-content-item-actions";

        var saveBtn = makeActionBtn("Save", function () {
          api("/api/admin/content/" + encodeURIComponent(key), { method: "PUT", body: { value: field.value } })
            .then(function () { flashStatus(status); })
            .catch(function (err) { alert(err.message); });
        });
        var resetBtn = makeActionBtn("Reset to default", function () {
          api("/api/admin/content/" + encodeURIComponent(key) + "/reset", { method: "POST" })
            .then(function (data) {
              field.value = data.value;
              flashStatus(status);
            })
            .catch(function (err) { alert(err.message); });
        });
        var status = document.createElement("span");
        status.className = "tn-a-content-item-status";
        status.textContent = "Saved";

        actions.appendChild(saveBtn);
        actions.appendChild(resetBtn);
        actions.appendChild(status);
        item.appendChild(actions);

        groupEl.appendChild(item);
      });

      container.appendChild(groupEl);
    });
  }

  // ---- Sections ----

  var SECTION_LABELS = {
    concept: { name: "Concept", hint: "The “Eight seats, one fire” intro section." },
    craft: { name: "Craft", hint: "The photo gallery and “White charcoal” section." },
    visit: { name: "Visit", hint: "Dietary policy and location/contact cards." },
    reserve: { name: "Reserve", hint: "The booking form — turning this off also hides every Reserve button and nav link." },
  };

  function loadSections() {
    api("/api/admin/sections")
      .then(function (data) { renderSections(data.sections || {}, data.keys || []); })
      .catch(function (err) {
        document.getElementById("tn-a-sections-list").innerHTML =
          "<p class=\"tn-a-empty\">" + escapeHtml(err.message) + "</p>";
      });
  }

  function renderSections(sections, keys) {
    var container = document.getElementById("tn-a-sections-list");
    container.innerHTML = "";

    keys.forEach(function (key) {
      var meta = SECTION_LABELS[key] || { name: key, hint: "" };
      var row = document.createElement("div");
      row.className = "tn-a-section-row";

      var text = document.createElement("div");
      var nameEl = document.createElement("div");
      nameEl.className = "tn-a-section-row-name";
      nameEl.textContent = meta.name;
      var hintEl = document.createElement("div");
      hintEl.className = "tn-a-section-row-hint";
      hintEl.textContent = meta.hint;
      text.appendChild(nameEl);
      text.appendChild(hintEl);
      row.appendChild(text);

      var switchLabel = document.createElement("label");
      switchLabel.className = "tn-a-switch";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = sections[key] !== false;
      input.addEventListener("change", function () {
        var next = input.checked;
        api("/api/admin/sections/" + key, { method: "PUT", body: { visible: next } })
          .catch(function (err) {
            alert(err.message);
            input.checked = !next;
          });
      });
      var track = document.createElement("span");
      track.className = "tn-a-switch-track";
      switchLabel.appendChild(input);
      switchLabel.appendChild(track);
      row.appendChild(switchLabel);

      container.appendChild(row);
    });
  }

  // ---- Capacity ----

  function loadCapacity() {
    var errorEl = document.getElementById("tn-a-capacity-error");
    api("/api/admin/capacity")
      .then(function (data) {
        errorEl.hidden = true;
        document.getElementById("tn-a-default-guests").value = data.defaultMaxGuests;
        renderOverrides(data.overrides || []);
      })
      .catch(function (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      });
  }

  function renderOverrides(overrides) {
    var body = document.getElementById("tn-a-overrides-body");
    var empty = document.getElementById("tn-a-overrides-empty");
    body.innerHTML = "";
    empty.hidden = overrides.length > 0;

    overrides.forEach(function (o) {
      var tr = document.createElement("tr");
      var dateTd = document.createElement("td");
      dateTd.textContent = o.dateKey;
      var guestsTd = document.createElement("td");
      guestsTd.textContent = o.maxGuests === 0 ? "0 (closed)" : String(o.maxGuests);
      var actionsTd = document.createElement("td");
      actionsTd.appendChild(makeActionBtn("Remove", function () {
        api("/api/admin/capacity/overrides/" + o.dateKey, { method: "DELETE" })
          .then(loadCapacity)
          .catch(function (err) { alert(err.message); });
      }));
      tr.appendChild(dateTd);
      tr.appendChild(guestsTd);
      tr.appendChild(actionsTd);
      body.appendChild(tr);
    });
  }

  document.getElementById("tn-a-save-default-guests").addEventListener("click", function () {
    var val = Number(document.getElementById("tn-a-default-guests").value);
    api("/api/admin/capacity/default", { method: "PUT", body: { maxGuests: val } })
      .then(loadCapacity)
      .catch(function (err) { alert(err.message); });
  });

  document.getElementById("tn-a-add-override").addEventListener("click", function () {
    var dateKey = document.getElementById("tn-a-override-date").value;
    var maxGuests = Number(document.getElementById("tn-a-override-guests").value);
    if (!dateKey) { alert("Choose a date first."); return; }
    api("/api/admin/capacity/overrides/" + dateKey, { method: "PUT", body: { maxGuests: maxGuests } })
      .then(function () {
        document.getElementById("tn-a-override-date").value = "";
        document.getElementById("tn-a-override-guests").value = "";
        loadCapacity();
      })
      .catch(function (err) { alert(err.message); });
  });

  init();
})();
