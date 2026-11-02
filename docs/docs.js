(function () {
  var pages = [
    { id: "quick-start", title: "Quick Start", icon: "player-play" },
    { id: "install", title: "Install from source", icon: "download", group: "Build" },
    { id: "designer", title: "Designer", icon: "pencil", group: "App" },
    { id: "effects", title: "Effects", icon: "sparkles", group: "App" },
    { id: "obs", title: "OBS", icon: "broadcast", group: "App" },
    { id: "credits", title: "Credits", icon: "info-circle", group: "About" },
  ];

  var nav = document.getElementById("nav");
  var article = document.getElementById("doc");
  var lastGroup = "";

  pages.forEach(function (page) {
    if (page.group && page.group !== lastGroup) {
      lastGroup = page.group;
      var heading = document.createElement("p");
      heading.className = "nav-group";
      heading.textContent = page.group;
      nav.appendChild(heading);
    }
    var link = document.createElement("a");
    link.href = "#" + page.id;
    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "icon");
    icon.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "icons.svg#" + page.icon);
    icon.appendChild(use);
    var label = document.createElement("span");
    label.textContent = page.title;
    link.appendChild(icon);
    link.appendChild(label);
    link.dataset.id = page.id;
    nav.appendChild(link);
  });
  if (window.docsIconsReady) window.docsIconsReady();

  function known(id) {
    return pages.some(function (page) { return page.id === id; });
  }

  function currentId() {
    var id = (location.hash || "#quick-start").replace(/^#/, "");
    return known(id) ? id : "quick-start";
  }

  // Markdown links stay as sibling .md files so GitHub renders them.
  // On this page they become hash routes.
  function rewrite(root) {
    root.querySelectorAll("a[href]").forEach(function (link) {
      var href = link.getAttribute("href") || "";
      var match = href.match(/^(?:\.\/)?([a-z0-9-]+)\.md(#[a-z0-9-]*)?$/);
      if (match && known(match[1])) link.setAttribute("href", "#" + match[1]);
    });
    root.querySelectorAll("img[src]").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (src.indexOf("../assets/") === 0) img.setAttribute("src", src.slice(3));
    });
  }

  function show() {
    var id = currentId();
    if ((location.hash || "#quick-start").replace(/^#/, "") !== id) {
      history.replaceState(null, "", "#" + id);
    }
    nav.querySelectorAll("a").forEach(function (link) {
      var on = link.dataset.id === id;
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    var page = pages.filter(function (item) { return item.id === id; })[0];
    document.title = page.title + " — Border Studio";
    article.innerHTML = "<p class=\"muted\">Loading…</p>";
    fetch("md/" + id + ".md")
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then(function (md) {
        article.innerHTML = marked.parse(md);
        rewrite(article);
      })
      .catch(function () {
        article.innerHTML = "<p>Could not load this page.</p>";
      });
  }

  window.addEventListener("hashchange", show);
  show();
})();
