const STORAGE_KEY = "todo.items.v1";
const COOKIE_KEY = "todo_items";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const form = document.getElementById("form");
const input = document.getElementById("input");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const counter = document.getElementById("counter");
const clearDone = document.getElementById("clearDone");
const clearAll = document.getElementById("clearAll");
const dateEl = document.getElementById("date");
const filterButtons = document.querySelectorAll(".filter");
const soundToggle = document.getElementById("soundToggle");
const modal = document.getElementById("confirmModal");
const cancelConfirm = modal.querySelector('[data-action="cancel"]');

const SOUND_KEY = "todo.sound.v1";

let tasks = loadTasks();
let filter = "all";
let soundEnabled = loadSoundPref();
let audioCtx = null;

function loadSoundPref() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSoundPref() {
  try {
    localStorage.setItem(SOUND_KEY, soundEnabled ? "on" : "off");
  } catch {}
}

function getAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioCtx) audioCtx = new AudioCtor();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, start, duration, type, volume, endFreq) {
  const ctx = getAudio();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const at = ctx.currentTime + start;

  osc.type = type || "square";
  osc.frequency.setValueAtTime(freq, at);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + duration);

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume || 0.05, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

function playAdd() {
  if (!soundEnabled) return;
  tone(523.25, 0, 0.05, "sine", 0.04);
  tone(783.99, 0.05, 0.09, "sine", 0.035);
}

function playDone() {
  if (!soundEnabled) return;
  tone(659.25, 0, 0.12, "sine", 0.05);
  tone(987.77, 0.1, 0.2, "sine", 0.045);
}

function playUndone() {
  if (!soundEnabled) return;
  tone(392, 0, 0.1, "sine", 0.04);
  tone(293.66, 0.08, 0.14, "sine", 0.035);
}

function playWarning() {
  if (!soundEnabled) return;
  tone(329.63, 0, 0.14, "triangle", 0.045);
  tone(246.94, 0.13, 0.24, "triangle", 0.04);
}

function playDelete() {
  if (!soundEnabled) return;
  tone(196, 0, 0.16, "sine", 0.045);
  tone(146.83, 0.13, 0.24, "sine", 0.035);
}

function updateSoundButton() {
  soundToggle.textContent = soundEnabled ? "Звук вкл." : "Звук выкл.";
  soundToggle.classList.toggle("is-off", !soundEnabled);
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
}

let confirmReturnFocus = null;

function openConfirm() {
  confirmReturnFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  playWarning();
  cancelConfirm.focus();
}

function closeConfirm() {
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  if (confirmReturnFocus && typeof confirmReturnFocus.focus === "function") {
    confirmReturnFocus.focus();
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function readCookie() {
  const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_KEY + "=([^;]*)"));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function writeCookie(items) {
  const value = encodeURIComponent(JSON.stringify(items));
  if (value.length > 4000) return;
  document.cookie =
    COOKIE_KEY + "=" + value + "; max-age=" + COOKIE_MAX_AGE + "; path=/; SameSite=Lax";
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  const fromCookie = readCookie();
  if (Array.isArray(fromCookie)) return fromCookie;
  return [];
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {}
  writeCookie(tasks);
}

function filteredTasks() {
  if (filter === "active") return tasks.filter((task) => !task.done);
  if (filter === "done") return tasks.filter((task) => task.done);
  return tasks;
}

function pluralize(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "задачи";
  return "задач";
}

function startEdit(item, task, textEl) {
  const editor = document.createElement("input");
  editor.className = "edit-input";
  editor.value = task.text;
  editor.maxLength = 200;
  textEl.replaceWith(editor);
  editor.focus();
  editor.select();

  let finished = false;

  function finish(save) {
    if (finished) return;
    finished = true;
    const value = editor.value.trim();
    if (save && value) {
      task.text = value;
      saveTasks();
    }
    render();
  }

  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  });

  editor.addEventListener("blur", () => finish(true));

  item.dataset.editing = "true";
}

function buildItem(task) {
  const item = document.createElement("li");
  item.className = "item" + (task.done ? " is-done" : "");
  item.dataset.id = task.id;

  const checkLabel = document.createElement("label");
  checkLabel.className = "check";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.done;
  checkbox.dataset.action = "toggle";
  checkbox.setAttribute("aria-label", "Отметить задачу");

  const box = document.createElement("span");
  box.className = "box";

  checkLabel.append(checkbox, box);

  const textEl = document.createElement("span");
  textEl.className = "text";
  textEl.textContent = task.text;
  textEl.title = "Двойной клик — редактировать";

  const actions = document.createElement("div");
  actions.className = "actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon";
  editBtn.dataset.action = "edit";
  editBtn.title = "Редактировать";
  editBtn.textContent = "✎";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "icon danger";
  deleteBtn.dataset.action = "delete";
  deleteBtn.title = "Удалить";
  deleteBtn.textContent = "×";

  actions.append(editBtn, deleteBtn);
  item.append(checkLabel, textEl, actions);
  return item;
}

function render() {
  const visible = filteredTasks();
  list.replaceChildren(...visible.map(buildItem));

  empty.hidden = visible.length > 0;
  if (tasks.length > 0 && visible.length === 0) {
    empty.hidden = false;
    empty.textContent =
      filter === "active" ? "Нет активных задач" : "Нет выполненных задач";
  } else {
    empty.textContent = "Пока пусто — добавьте первую задачу";
  }

  const activeCount = tasks.filter((task) => !task.done).length;
  counter.textContent =
    activeCount + " " + pluralize(activeCount) + " · всего " + tasks.length;

  clearDone.disabled = !tasks.some((task) => task.done);
  clearDone.style.opacity = clearDone.disabled ? 0.45 : 1;
  clearDone.style.cursor = clearDone.disabled ? "default" : "pointer";
}

function addTask(text) {
  tasks.unshift({
    id: createId(),
    text,
    done: false,
    createdAt: Date.now(),
  });
  saveTasks();
  render();
  playAdd();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) {
    input.focus();
    return;
  }
  addTask(value);
  input.value = "";
  input.focus();
});

list.addEventListener("change", (event) => {
  const checkbox = event.target.closest('input[data-action="toggle"]');
  if (!checkbox) return;
  const item = checkbox.closest(".item");
  const task = tasks.find((entry) => entry.id === item.dataset.id);
  if (!task) return;
  task.done = checkbox.checked;
  saveTasks();
  render();
  if (task.done) playDone();
  else playUndone();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = button.closest(".item");
  const task = tasks.find((entry) => entry.id === item.dataset.id);
  if (!task) return;

  if (button.dataset.action === "delete") {
    tasks = tasks.filter((entry) => entry.id !== task.id);
    saveTasks();
    render();
    playDelete();
  }

  if (button.dataset.action === "edit") {
    startEdit(item, task, item.querySelector(".text"));
  }
});

list.addEventListener("dblclick", (event) => {
  const textEl = event.target.closest(".text");
  if (!textEl) return;
  const item = textEl.closest(".item");
  const task = tasks.find((entry) => entry.id === item.dataset.id);
  if (!task) return;
  startEdit(item, task, textEl);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    filterButtons.forEach((other) => {
      other.classList.toggle("is-active", other === button);
    });
    render();
  });
});

clearDone.addEventListener("click", () => {
  if (!tasks.some((task) => task.done)) return;
  tasks = tasks.filter((task) => !task.done);
  saveTasks();
  render();
  playDelete();
});

clearAll.addEventListener("click", () => {
  if (!tasks.length) return;
  openConfirm();
});

modal.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  if (actionEl.dataset.action === "cancel") {
    closeConfirm();
  }

  if (actionEl.dataset.action === "confirm") {
    tasks = [];
    saveTasks();
    render();
    playDelete();
    closeConfirm();
  }
});

modal.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const buttons = modal.querySelectorAll("button");
  const first = buttons[0];
  const last = buttons[buttons.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeConfirm();
});

dateEl.textContent = new Date().toLocaleDateString("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  saveSoundPref();
  updateSoundButton();
  if (soundEnabled) playAdd();
});

updateSoundButton();
render();
