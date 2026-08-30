const urlInput = document.getElementById("url");
const nameInput = document.getElementById("name");
const connectBtn = document.getElementById("connect");
const errorEl = document.getElementById("error");
const existingEl = document.getElementById("existing");

async function refreshExisting() {
  const servers = await window.picker.listServers();
  existingEl.innerHTML = "";
  for (const s of servers) {
    const li = document.createElement("li");

    const label = document.createElement("span");
    label.className = "label";
    label.title = "Switch to this backend";
    label.onclick = () => window.picker.connectExisting(s.id);

    const name = document.createElement("span");
    name.className = "label-text";
    name.textContent = s.name;

    const url = document.createElement("span");
    url.className = "label-url";
    url.textContent = s.url;

    label.append(name, url);

    const rename = document.createElement("button");
    rename.className = "rename";
    rename.textContent = "Rename";
    rename.title = `Rename ${s.name}`;
    rename.onclick = async (event) => {
      event.stopPropagation();
      const next = window.prompt("Rename backend", s.name);
      if (next === null) return;
      await window.picker.renameServer(s.id, next);
      refreshExisting();
    };

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.title = `Remove ${s.name}`;
    remove.onclick = async (event) => {
      event.stopPropagation();
      await window.picker.removeServer(s.id);
      refreshExisting();
    };

    li.append(label, rename, remove);
    existingEl.appendChild(li);
  }
}

connectBtn.onclick = async () => {
  errorEl.textContent = "";
  connectBtn.disabled = true;
  try {
    await window.picker.addServer(urlInput.value.trim(), nameInput.value.trim());
    urlInput.value = "";
    nameInput.value = "";
    refreshExisting();
  } catch (err) {
    errorEl.textContent = err?.message ?? "Couldn't reach that server.";
  } finally {
    connectBtn.disabled = false;
  }
};

refreshExisting();
