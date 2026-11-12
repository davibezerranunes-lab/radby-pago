import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ADMIN_DOMAIN } from "./firebase-config.js";

const configured = Boolean(
  firebaseConfig &&
  firebaseConfig.apiKey &&
  !String(firebaseConfig.apiKey).startsWith("COLE")
);

let app = null;
let auth = null;
let db = null;
let unsubscribe = null;
let codes = [];
let selectedId = null;
let modalResolve = null;

if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  setPersistence(auth, browserSessionPersistence).catch(() => {});
}

const $ = (id) => document.getElementById(id);
const loginView = $("loginView");
const appView = $("appView");
const loginForm = $("loginForm");
const userInput = $("user");
const passInput = $("pass");
const loginError = $("loginError");
const setupBanner = $("setupBanner");
const codeList = $("codeList");
const empty = $("empty");
const fabRoot = $("fabRoot");
const clearUsedBtn = $("clearUsedBtn");
const modal = $("modal");
const modalTitle = $("modalTitle");
const modalText = $("modalText");
const modalInput = $("modalInput");
const toastEl = $("toast");

if (!configured) {
  setupBanner.hidden = false;
  loginError.textContent = "Firebase ainda não configurado.";
  loginError.hidden = false;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("show"));
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toastEl.classList.remove("show");
    setTimeout(() => { toastEl.hidden = true; }, 220);
  }, 2600);
}

function openModal({ title, text, input, value, okLabel }) {
  modalTitle.textContent = title;
  modalText.textContent = text || "";
  modalText.hidden = !text;
  modalInput.hidden = !input;
  modalInput.value = value || "";
  $("modalOk").textContent = okLabel || "Confirmar";
  modal.hidden = false;
  if (input) {
    setTimeout(() => modalInput.focus(), 60);
  }
  return new Promise((resolve) => { modalResolve = resolve; });
}

function closeModal(result) {
  modal.hidden = true;
  if (modalResolve) {
    const resolve = modalResolve;
    modalResolve = null;
    resolve(result);
  }
}

$("modalCancel").addEventListener("click", () => closeModal(null));
$("modalOk").addEventListener("click", () => {
  if (!modalInput.hidden) {
    closeModal(modalInput.value.trim());
  } else {
    closeModal(true);
  }
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal(null);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  if (!configured) {
    toast("Firebase ainda não configurado.");
    return;
  }
  const user = userInput.value.trim();
  if (!user || !passInput.value) {
    loginError.hidden = false;
    return;
  }
  const email = user.includes("@") ? user : `${user}@${ADMIN_DOMAIN}`;
  try {
    await signInWithEmailAndPassword(auth, email, passInput.value);
    passInput.value = "";
  } catch (error) {
    loginError.hidden = false;
    loginError.textContent = "Usuário ou senha inválidos.";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  if (auth) await signOut(auth);
});

clearUsedBtn.addEventListener("click", clearUsed);

if (configured) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginView.hidden = true;
      appView.hidden = false;
      $("fbStatus").textContent = "Conectado — " + user.email;
      startList();
    } else {
      appView.hidden = true;
      loginView.hidden = false;
      stopList();
    }
  });
}

function startList() {
  if (unsubscribe) return;
  const codesQuery = query(collection(db, "codes"), orderBy("createdAt", "desc"));
  unsubscribe = onSnapshot(codesQuery, (snapshot) => {
    codes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    if (selectedId && !codes.some((item) => item.id === selectedId)) {
      selectedId = null;
    }
    render();
  }, (error) => {
    toast("Erro ao ler os códigos: " + error.message);
  });
}

function stopList() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  codes = [];
  selectedId = null;
  render();
}

function formatDate(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR");
}

function render() {
  codeList.innerHTML = "";
  empty.hidden = codes.length > 0;
  $("statTotal").textContent = codes.length;
  $("statActive").textContent = codes.filter((item) => !item.used).length;
  $("statUsed").textContent = codes.filter((item) => item.used).length;
  clearUsedBtn.hidden = codes.filter((item) => item.used).length === 0;

  for (const item of codes) {
    const card = document.createElement("div");
    card.className = "code-card" + (item.used ? " used" : "") +
      (item.id === selectedId ? " selected" : "");
    card.dataset.id = item.id;
    card.innerHTML = `
      <div class="code-left">
        <div class="code-value">${item.id}</div>
        <div class="code-meta">${item.used ? "usado em " + formatDate(item.usedAt) : "criado em " + formatDate(item.createdAt)}</div>
      </div>
      <span class="chip ${item.used ? "used" : "active"}">${item.used ? "usado" : "ativo"}</span>
    `;
    card.addEventListener("click", () => {
      selectedId = selectedId === item.id ? null : item.id;
      render();
    });
    codeList.appendChild(card);
  }
}

$("fabMain").addEventListener("click", () => {
  fabRoot.classList.toggle("open");
});

document.querySelectorAll(".fab-action").forEach((button) => {
  button.addEventListener("click", () => {
    fabRoot.classList.remove("open");
    const action = button.dataset.action;
    if (action === "add") addCode();
    if (action === "kill") killCode();
    if (action === "edit") editCode();
    if (action === "delete") deleteCode();
  });
});

function isValidCode(value) {
  return /^\d{6}$/.test(value);
}

async function addCode() {
  const value = await openModal({
    title: "Adicionar código",
    text: "Digite os 6 dígitos do novo código.",
    input: true,
    okLabel: "Adicionar"
  });
  if (value === null) return;
  if (!isValidCode(value)) {
    toast("Use exatamente 6 dígitos.");
    return;
  }
  if (codes.some((item) => item.id === value)) {
    toast("Esse código já existe.");
    return;
  }
  try {
    await setDoc(doc(db, "codes", value), {
      used: false,
      createdAt: serverTimestamp(),
      usedAt: null,
      usedBy: null
    });
    selectedId = value;
    toast("Código adicionado.");
    render();
  } catch (error) {
    toast("Erro ao adicionar: " + error.message);
  }
}

async function killCode() {
  if (!selectedId) {
    toast("Selecione um código na lista primeiro.");
    return;
  }
  const item = codes.find((entry) => entry.id === selectedId);
  if (item && item.used) {
    toast("Esse código já está usado.");
    return;
  }
  const confirmed = await openModal({
    title: "Matar código",
    text: `Marcar o código ${selectedId} como usado? Ele deixa de funcionar.`,
    okLabel: "Matar"
  });
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "codes", selectedId), {
      used: true,
      usedAt: serverTimestamp()
    });
    toast("Código morto.");
  } catch (error) {
    toast("Erro ao matar: " + error.message);
  }
}

async function deleteCode() {
  if (!selectedId) {
    toast("Selecione um código na lista primeiro.");
    return;
  }
  const confirmed = await openModal({
    title: "Excluir código",
    text: `Apagar o código ${selectedId} da lista? Isso não pode ser desfeito.`,
    okLabel: "Excluir"
  });
  if (!confirmed) return;
  try {
    await deleteDoc(doc(db, "codes", selectedId));
    selectedId = null;
    toast("Código excluído.");
  } catch (error) {
    toast("Erro ao excluir: " + error.message);
  }
}

async function clearUsed() {
  const used = codes.filter((item) => item.used);
  if (!used.length) {
    toast("Nenhum código usado.");
    return;
  }
  const confirmed = await openModal({
    title: "Limpar usados",
    text: `Apagar ${used.length} código(s) já usado(s)? Isso não pode ser desfeito.`,
    okLabel: "Apagar"
  });
  if (!confirmed) return;
  try {
    for (let i = 0; i < used.length; i += 500) {
      const batch = writeBatch(db);
      used.slice(i, i + 500).forEach((item) =>
        batch.delete(doc(db, "codes", item.id)));
      await batch.commit();
    }
    selectedId = null;
    toast("Códigos usados apagados.");
  } catch (error) {
    toast("Erro ao limpar: " + error.message);
  }
}

async function editCode() {
  if (!selectedId) {
    toast("Selecione um código na lista primeiro.");
    return;
  }
  const oldId = selectedId;
  const value = await openModal({
    title: "Editar código",
    text: `Trocar ${oldId} por qual número?`,
    input: true,
    value: oldId,
    okLabel: "Salvar"
  });
  if (value === null || value === oldId) return;
  if (!isValidCode(value)) {
    toast("Use exatamente 6 dígitos.");
    return;
  }
  if (codes.some((item) => item.id === value)) {
    toast("Esse código já existe.");
    return;
  }
  const item = codes.find((entry) => entry.id === oldId) || {};
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "codes", value), {
      used: Boolean(item.used),
      createdAt: item.createdAt || serverTimestamp(),
      usedAt: item.usedAt || null,
      usedBy: item.usedBy || null
    });
    batch.delete(doc(db, "codes", oldId));
    await batch.commit();
    selectedId = value;
    toast("Código editado.");
  } catch (error) {
    toast("Erro ao editar: " + error.message);
  }
}
