const express = require("express");
const socketIo = require("socket.io");
const http = require("http");
const ZKLib = require("node-zklib"); // Pastikan path ke zklib sudah benar

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const zkInstance = new ZKLib("10.37.44.201", 4370, 10000, 4000); // Ganti dengan IP dan port yang sesuai

async function connectFingerprintDevice() {
  try {
    await zkInstance.createSocket();
    console.log("Connected to fingerprint device.");

    // Mendapatkan informasi umum perangkat
    const info = await zkInstance.getInfo();
    console.log(info);

    // Mendapatkan daftar user
    const users = await zkInstance.getUsers();
    console.log(users);

    // Mendapatkan log absensi
    const logs = await zkInstance.getAttendances();
    console.log(logs);

    // Mengambil log secara real-time dan mengirimkan ke frontend menggunakan socket.io
    zkInstance.getRealTimeLogs((data) => {
      io.emit("attendanceLog", data); // Emit log ke frontend
    });
  } catch (err) {
    console.error("Error connecting to device:", err);
  }
}

// Jalankan koneksi ke perangkat fingerprint
connectFingerprintDevice();

// Setup API endpoint untuk mengambil log secara manual (optional)
app.get("/logs", async (req, res) => {
  try {
    const logs = await zkInstance.getAttendances();
    res.json(logs);
  } catch (err) {
    res.status(500).send("Error fetching logs");
  }
});

// Mulai server dan WebSocket
server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
