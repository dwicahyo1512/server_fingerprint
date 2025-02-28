const express = require("express");
const http = require("http");
const WebSocket = require("ws");
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

// Fungsi untuk menghubungkan ke perangkat fingerprint
async function connectFingerprintDevice() {
  try {
    // Membuat socket untuk perangkat fingerprint hanya sekali
    await zkInstance.createSocket();
    console.log("Connected to fingerprint device.");

    // Mendapatkan informasi umum dari perangkat fingerprint
    const info = await zkInstance.getInfo();
    console.log("Device Info:", info);

    // const users = await zkInstance.getUsers();
    // console.log(users);

    // Enable device (Pastikan perangkat siap untuk mengambil data real-time)
    await zkInstance.enableDevice();
    console.log("Device enabled and ready to send real-time data.");

    // Mendapatkan log kehadiran secara real-time dan mengirimkannya ke semua klien WebSocket
    zkInstance.getRealTimeLogs((data) => {
      // const users = zkInstance.getUsers();
      // const attendanceLogs = Array.isArray(users) ? users : users.data || [];
      // const last10Logs = attendanceLogs.slice(-1); // Ambil 10 log terakhir
      // console.log("checkuser", users);
      console.log("Real-time data received:", data);
      // Kirim data ke semua klien WebSocket
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data)); // Kirim data sebagai JSON ke klien
        }
      });
    });
  } catch (err) {
    console.error("Error connecting to device:", err);
    if (err.code === "EADDRINUSE") {
      console.error("Address already in use.");
    }
  }
}

// Menangani koneksi WebSocket
wss.on("connection", (ws) => {
  console.log("A client connected.");

  // Menangani pemutusan koneksi klien
  ws.on("close", () => {
    console.log("A client disconnected.");
  });

  // Menangani pesan yang diterima dari klien
  ws.on("message", (message) => {
    console.log("Received message from client:", message);
  });
});

// Setup API endpoint untuk mengambil log secara manual
app.get("/logs", async (req, res) => {
  try {
    // Mengambil log absensi secara manual
    // const logs = await zkInstance.getAttendances();
    // console.log("Raw Logs:", logs);

    // // Periksa format logs dan ambil 10 log terakhir
    // const attendanceLogs = Array.isArray(logs) ? logs : logs.data || [];
    // const last10Logs = attendanceLogs.slice(-10); // Ambil 10 log terakhir

    // console.log("Last 10 Logs:", last10Logs);

    // const users = zkInstance.getUsers();
    // const attendanceLogs = Array.isArray(users) ? users : users || [];
    // const last10Logs = attendanceLogs.slice(-1); // Ambil 10 log terakhir
    // console.log("checkuser", users);
    // Kirimkan hasilnya ke client
    res.json(last10Logs);
  } catch (err) {
    res.status(500).send("Error fetching logs");
  }
});

// Mulai koneksi ke perangkat fingerprint
connectFingerprintDevice();

// Mulai server dan WebSocket
server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
