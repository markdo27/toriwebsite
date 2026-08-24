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

  init();
})();
