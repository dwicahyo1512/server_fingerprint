const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const ZKLib = require("node-zklib");

const app = express();
const server = http.createServer(app);

// Membuat WebSocket server
const wss = new WebSocket.Server({
  server,
  path: "/realtime",
});

// Instance ZKLib global
const zkInstance = new ZKLib("10.37.44.201", 4370, 10000, 4000); // Ganti dengan IP dan port yang sesuai

// Membuat dan membuka database SQLite
const db = new sqlite3.Database("./attendance.db", (err) => {
  if (err) {
    console.error("Error opening database:", err);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// Membuat tabel untuk menyimpan log kehadiran
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    timestamp TEXT
  )`);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS limit_kantin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kantin INTEGER,
    stok INTEGER
  )`);
});

// Fungsi untuk menyimpan data kehadiran ke SQLite
function saveAttendanceToDB(userId, userName, timestamp) {
  const query = `INSERT INTO attendance_logs (user_id, user_name, timestamp) VALUES (?, ?, ?)`;

  db.run(query, [userId, userName, timestamp], function (err) {
    if (err) {
      console.error("Error saving attendance to DB:", err);
    } else {
      console.log("Attendance saved to DB:", { userId, userName, timestamp });
    }
  });
}

// Fungsi untuk menghubungkan ke perangkat fingerprint dan mendapatkan semua pengguna
async function connectFingerprintDevice() {
  try {
    // Membuat socket untuk perangkat fingerprint hanya sekali
    await zkInstance.createSocket();
    console.log("Connected to fingerprint device.");

    // Mendapatkan informasi umum dari perangkat fingerprint
    const info = await zkInstance.getInfo();
    console.log("Device Info:", info);

    // Enable device (Pastikan perangkat siap untuk mengambil data real-time)
    await zkInstance.enableDevice();
    console.log("Device enabled and ready to send real-time data.");

    // Ambil semua pengguna terdaftar
    const usersResponse = await zkInstance.getUsers();
    // console.log("Users:", usersResponse);

    const users = usersResponse.data;

    const userMap = {};
    users.forEach((user) => {
      userMap[user.uid] = user.name;
    });

    // Mendapatkan log kehadiran secara real-time dan mengirimkannya ke semua klien WebSocket
    zkInstance.getRealTimeLogs((data) => {
      console.log("Real-time data received:", data);
      // io.emit("Real-time data received:", data);

      if (data && data.uid) {
        const userName = userMap[data.uid];
        if (userName) {
          data.userName = userName;
        }

        const timestamp = new Date().toISOString();
        saveAttendanceToDB(data.uid, data.userName, timestamp);
      }

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    });
  } catch (err) {
    console.error("Error connecting to device:", err);
  }
}

// Menangani koneksi WebSocket
wss.on("connection", (ws) => {
  console.log("A client connected.");
  ws.on("close", () => {
    console.log("A client disconnected.");
  });

  ws.on("message", (message) => {
    console.log("Received message from client:", message);
  });
});

// Setup API endpoint untuk mengambil log kehadiran dari database
app.get("/attendance-logs", (req, res) => {
  const query =
    "SELECT * FROM attendance_logs ORDER BY timestamp DESC LIMIT 10";

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching attendance logs:", err);
      res.status(500).send("Error fetching attendance logs");
      return;
    }
    res.json(rows);
  });
});

// Menambahkan log kehadiran secara manual
app.post("/add/count", (req, res) => {
  const { userId, userName } = req.body;
  const timestamp = new Date().toISOString();

  saveAttendanceToDB(userId, userName, timestamp);

  res.status(201).json({
    message: "Attendance added successfully",
    userId,
    userName,
    timestamp,
  });
});

// Mulai koneksi ke perangkat fingerprint
connectFingerprintDevice();
// Mulai server dan WebSocket
server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
