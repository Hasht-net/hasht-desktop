const HOSTED_URL = "chat.hasht.net";
const HOSTED_NAME = "Hasht";

const serversEl = document.getElementById("servers");
const serversHeading = document.getElementById("servers-heading");
const headline = document.getElementById("headline");
const tagline = document.getElementById("tagline");
const addHeading = document.getElementById("add-heading");
const errorEl = document.getElementById("error");

const urlInput = document.getElementById("url");
const nameInput = document.getElementById("name");
const hostedBtn = document.getElementById("hosted-connect");
const selfhostedBtn = document.getElementById("selfhosted-connect");

// Only one choice card is expanded at a time.
for (const card of document.querySelectorAll(".card")) {
  card.addEventListener("click", (event) => {
    if (event.target.closest(".card-body")) return; // don't collapse while typing
    for (const c of document.querySelectorAll(".card")) {
      c.classList.toggle("selected", c === card);
    }
    if (card.dataset.choice === "selfhosted") urlInput.focus();
  });
}

async function withBusy(btn, fn) {
  errorEl.textContent = "";
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    errorEl.textContent = err?.message ?? "Couldn't reach that server.";
  } finally {
    btn.disabled = false;
  }
}

hostedBtn.onclick = () =>
  withBusy(hostedBtn, () => window.picker.addServer(HOSTED_URL, HOSTED_NAME));

selfhostedBtn.onclick = () =>
  withBusy(selfhostedBtn, async () => {
    const url = urlInput.value.trim();
    if (!url) throw new Error("Enter your server's address.");
    await window.picker.addServer(url, nameInput.value.trim());
    urlInput.value = "";
    nameInput.value = "";
  });

async function refresh() {
  const servers = await window.picker.listServers();
  serversEl.innerHTML = "";

  const hasServers = servers.length > 0;
  serversHeading.hidden = !hasServers;
  headline.textContent = hasServers ? "Hasht" : "Welcome to Hasht";
  tagline.textContent = hasServers
    ? "Pick a server or add another."
    : "Choose how you want to connect.";
  addHeading.textContent = hasServers ? "Add a server" : "Connect";

  // No cards pre-expanded once the user has servers; on first run, nudge them
  // toward the hosted option.
  if (!hasServers && !document.querySelector(".card.selected")) {
    document.getElementById("card-hosted").classList.add("selected");
  }

  for (const s of servers) {
    const row = document.createElement("div");
    row.className = "server";
    row.title = "Switch to this server";
    row.onclick = () => window.picker.connectExisting(s.id);

    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = s.name;
    const url = document.createElement("div");
    url.className = "url";
    url.textContent = s.url;
    meta.append(name, url);

    const rename = document.createElement("button");
    rename.className = "icon-btn";
    rename.textContent = "Rename";
    rename.onclick = async (event) => {
      event.stopPropagation();
      const next = window.prompt("Rename server", s.name);
      if (next === null) return;
      await window.picker.renameServer(s.id, next);
      refresh();
    };

    const remove = document.createElement("button");
    remove.className = "icon-btn danger";
    remove.textContent = "Remove";
    remove.onclick = async (event) => {
      event.stopPropagation();
      await window.picker.removeServer(s.id);
      refresh();
    };

    row.append(meta, rename, remove);
    serversEl.appendChild(row);
  }
}

refresh();
