import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";

const app = express();
app.use(express.static("public"));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const rooms = new Map();
let nextRoomId = 1;

function checkWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(v => v)) return "draw";
  return null;
}

function roomList() {
  const list = [];
  for (const [id, r] of rooms.entries()) {
    list.push({ id, players: r.players.length, winner: r.winner ? r.winner : null });
  }
  return list;
}

function broadcastLobby() {
  const payload = JSON.stringify({ type: "rooms", rooms: roomList() });
  for (const client of wss.clients) {
    if (!client.clientState || client.clientState.roomId == null) {
      try {
        client.send(payload);
      } catch {}
    }
  }
}

function broadcastRoom(roomId, payload) {
  const r = rooms.get(roomId);
  if (!r) return;
  r.players.forEach(p => {
    try {
      p.ws.send(JSON.stringify(payload));
    } catch {}
  });
}

function resetRoom(roomId) {
  const r = rooms.get(roomId);
  if (!r) return;
  r.board = Array(9).fill(null);
  r.turn = null;
  r.winner = null;
  broadcastRoom(roomId, { type: "reset" });
}

wss.on("connection", ws => {
  ws.clientState = { roomId: null, role: null };
  ws.send(JSON.stringify({ type: "rooms", rooms: roomList() }));

  ws.on("message", data => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === "create_room") {
      const id = String(nextRoomId++);
      rooms.set(id, { players: [], board: Array(9).fill(null), turn: null, winner: null });
      const r = rooms.get(id);
      r.players.push({ ws, role: "X" });
      ws.clientState.roomId = id;
      ws.clientState.role = "X";
      ws.send(JSON.stringify({ type: "role", role: "X" }));
      ws.send(JSON.stringify({ type: "state", board: r.board, turn: r.turn, winner: r.winner }));
      broadcastLobby();
      return;
    }
    if (msg.type === "join_room") {
      const id = String(msg.id);
      const r = rooms.get(id);
      if (!r) return;
      if (r.players.length >= 2) {
        ws.send(JSON.stringify({ type: "room_full", id }));
        return;
      }
      const role = r.players.find(p => p.role === "X") ? "O" : "X";
      r.players.push({ ws, role });
      ws.clientState.roomId = id;
      ws.clientState.role = role;
      ws.send(JSON.stringify({ type: "role", role }));
      if (r.players.length === 2 && !r.turn) r.turn = "X";
      broadcastRoom(id, { type: "state", board: r.board, turn: r.turn, winner: r.winner });
      broadcastLobby();
      return;
    }
    if (msg.type === "leave_room") {
      const id = ws.clientState.roomId;
      if (!id) return;
      const r = rooms.get(id);
      if (r) {
        r.players = r.players.filter(p => p.ws !== ws);
        resetRoom(id);
        if (r.players.length === 0) rooms.delete(id);
        else broadcastRoom(id, { type: "state", board: r.board, turn: r.turn, winner: r.winner });
      }
      ws.clientState.roomId = null;
      ws.clientState.role = null;
      ws.send(JSON.stringify({ type: "rooms", rooms: roomList() }));
      broadcastLobby();
      return;
    }
    if (msg.type === "move") {
      const id = ws.clientState.roomId;
      const r = id ? rooms.get(id) : null;
      if (!r || r.winner) return;
      const idx = msg.index;
      if (typeof idx !== "number" || idx < 0 || idx > 8) return;
      if (r.board[idx]) return;
      const role = ws.clientState.role;
      if (role !== r.turn) return;
      r.board[idx] = role;
      const win = checkWinner(r.board);
      r.winner = win;
      if (!win) r.turn = r.turn === "X" ? "O" : "X";
      broadcastRoom(id, { type: "state", board: r.board, turn: r.turn, winner: r.winner });
      return;
    }
    if (msg.type === "restart") {
      const id = ws.clientState.roomId;
      const r = id ? rooms.get(id) : null;
      if (!r) return;
      if (r.players.length === 2) {
        resetRoom(id);
        r.turn = "X";
        broadcastRoom(id, { type: "state", board: r.board, turn: r.turn, winner: r.winner });
      }
      return;
    }
  });

  ws.on("close", () => {
    const id = ws.clientState.roomId;
    if (id) {
      const r = rooms.get(id);
      if (r) {
        r.players = r.players.filter(p => p.ws !== ws);
        resetRoom(id);
        if (r.players.length === 0) rooms.delete(id);
        else broadcastRoom(id, { type: "state", board: r.board, turn: r.turn, winner: r.winner });
      }
    }
    broadcastLobby();
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
