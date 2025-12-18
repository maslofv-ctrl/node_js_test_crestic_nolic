import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const restartBtn = document.getElementById("restart");
const lobbyEl = document.getElementById("lobby");
const roomsEl = document.getElementById("rooms");
const createBtn = document.getElementById("create");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 6.5, 7.5);
camera.lookAt(0, 0, 0);

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(2, 5, 3);
scene.add(dir);

const boardGroup = new THREE.Group();
scene.add(boardGroup);

const tiles = [];
const pieces = [];
const tileGeo = new THREE.PlaneGeometry(1.8, 1.8);
const tileMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 1 });
const tileMatHover = new THREE.MeshStandardMaterial({ color: 0x2b3443, roughness: 1 });

for (let i = 0; i < 9; i++) {
  const mesh = new THREE.Mesh(tileGeo, tileMat.clone());
  mesh.rotation.x = -Math.PI / 2;
  const r = Math.floor(i / 3);
  const c = i % 3;
  mesh.position.set((c - 1) * 2, 0, (r - 1) * 2);
  mesh.userData.index = i;
  boardGroup.add(mesh);
  tiles.push(mesh);
}

const grid = new THREE.GridHelper(6, 3, 0x4b5563, 0x374151);
grid.position.y = 0.001;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;

let myRole = null;
let board = Array(9).fill(null);
let turn = null;
let winner = null;
let inRoom = false;
let currentRoomId = null;

function setStatus() {
  const roleText = myRole ? "Вы: " + myRole : "Лобби";
  let stateText = "";
  if (winner === "draw") stateText = "Ничья";
  else if (winner) stateText = "Победил " + winner;
  else if (!turn) stateText = "Ожидание второго игрока";
  else stateText = "Ход: " + turn + (myRole === turn ? " (ваш)" : "");
  statusEl.textContent = roleText + " • " + stateText;
}

function clearPieces() {
  for (const p of pieces) scene.remove(p);
  pieces.length = 0;
}

function renderBoard() {
  clearPieces();
  for (let i = 0; i < 9; i++) {
    const v = board[i];
    if (!v) continue;
    const col = v === "X" ? 0xef4444 : 0x3b82f6;
    const geo = new THREE.BoxGeometry(1.2, 0.3, 1.2);
    const mat = new THREE.MeshStandardMaterial({ color: col });
    const mesh = new THREE.Mesh(geo, mat);
    const r = Math.floor(i / 3);
    const c = i % 3;
    mesh.position.set((c - 1) * 2, 0.17, (r - 1) * 2);
    scene.add(mesh);
    pieces.push(mesh);
  }
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

function updateHover(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(tiles, false);
  const hit = intersects.find(i => {
    const idx = i.object.userData.index;
    return board[idx] === null;
  });
  if (hovered && hovered.material) hovered.material.color.copy(new THREE.Color(0x1f2937));
  hovered = hit ? hit.object : null;
  if (hovered && hovered.material) hovered.material.color.copy(new THREE.Color(0x2b3443));
}

renderer.domElement.addEventListener("mousemove", updateHover);

function onClick() {
  if (!inRoom || !myRole || winner || myRole !== turn) return;
  if (!hovered) return;
  const idx = hovered.userData.index;
  if (board[idx]) return;
  ws.send(JSON.stringify({ type: "move", index: idx }));
}
renderer.domElement.addEventListener("click", onClick);

restartBtn.addEventListener("click", () => {
  ws.send(JSON.stringify({ type: "restart" }));
});

function showLobby() {
  inRoom = false;
  currentRoomId = null;
  myRole = null;
  lobbyEl.style.display = "block";
  canvas.style.display = "none";
  document.getElementById("ui").style.display = "none";
}

function showGame() {
  inRoom = true;
  lobbyEl.style.display = "none";
  canvas.style.display = "block";
  document.getElementById("ui").style.display = "flex";
}

function renderRooms(list) {
  roomsEl.innerHTML = "";
  list.forEach(r => {
    const div = document.createElement("div");
    div.className = "room";
    const label = document.createElement("div");
    label.textContent = "Комната " + r.id + " • " + r.players + "/2";
    const btn = document.createElement("button");
    btn.textContent = "Подключиться";
    btn.disabled = r.players >= 2;
    btn.addEventListener("click", () => {
      ws.send(JSON.stringify({ type: "join_room", id: r.id }));
    });
    div.appendChild(label);
    div.appendChild(btn);
    roomsEl.appendChild(div);
  });
}

createBtn.addEventListener("click", () => {
  ws.send(JSON.stringify({ type: "create_room" }));
});

const ws = new WebSocket(`ws://${location.host}/ws`);

ws.addEventListener("message", ev => {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (msg.type === "rooms") {
    showLobby();
    renderRooms(Array.isArray(msg.rooms) ? msg.rooms : []);
  }
  if (msg.type === "role") {
    myRole = msg.role;
    showGame();
    setStatus();
  }
  if (msg.type === "state") {
    if (Array.isArray(msg.board)) board = msg.board.slice();
    turn = msg.turn || null;
    winner = msg.winner || null;
    renderBoard();
    setStatus();
  }
  if (msg.type === "reset") {
    board = Array(9).fill(null);
    turn = null;
    winner = null;
    renderBoard();
    setStatus();
  }
  if (msg.type === "room_full") {
    setStatus();
  }
});
