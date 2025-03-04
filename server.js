const express = require("express");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const ZKLib = require("node-zklib");

const app = express();
const server = app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
// Membuat WebSocket server
const wss = new WebSocket.Server({ server });

// Instance ZKLib global
const zkInstance = new ZKLib("10.37.44.201", 4370, 10000, 4000);

const db = new sqlite3.Database("./attendance.db", (err) => {
  if (err) {
    console.error("Error opening database:", err);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// Membuat tabel untuk menyimpan log kehadiran dan status pengambilan data user
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    timestamp TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS user_fetch_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    is_fetched BOOLEAN DEFAULT 0
  )`);
});

// Fungsi untuk mengupdate status apakah data user sudah diambil
function updateUserFetchStatus(status) {
  const query = `INSERT OR REPLACE INTO user_fetch_status (id, is_fetched) VALUES (1, ?)`;
  db.run(query, [status], function (err) {
    if (err) {
      console.error("Error updating fetch status:", err);
    } else {
      console.log(`User fetch status updated to: ${status}`);
    }
  });
}

// Fungsi untuk memeriksa apakah data user sudah diambil
function checkUserFetchStatus(callback) {
  const query = `SELECT is_fetched FROM user_fetch_status WHERE id = 1`;
  db.get(query, [], (err, row) => {
    if (err) {
      console.error("Error checking fetch status:", err);
      callback(false); // Default return false if error occurs
    } else {
      callback(row ? row.is_fetched === 1 : false);
    }
  });
}

// Fungsi untuk menyimpan data kehadiran ke database
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
// Mengubah getuser agar mengembalikan Promise dan data yang dibutuhkan
function getuser(userId) {
  const query = `SELECT id,user_name FROM attendance_logs WHERE user_id = ?`;

  return new Promise((resolve, reject) => {
    db.get(query, [userId], function (err, row) {
      if (err) {
        console.error("Error fetching user data: ", err);
        reject(err); // Jika ada error, reject Promise
      } else {
        resolve(row); // Mengembalikan data nama pengguna
      }
    });
  });
}

// Fungsi untuk menghubungkan ke perangkat fingerprint
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

    // Memeriksa status pengambilan data user
    checkUserFetchStatus(async (isFetched) => {
      if (!isFetched) {
        await getuserdata(); // Hanya dipanggil sekali
        updateUserFetchStatus(true); // Tandai data user sudah diambil
      }
    });

    // Mendapatkan log kehadiran secara real-time dan mengirimkannya ke semua klien WebSocket
    zkInstance.getRealTimeLogs(async (data) => {
      console.log("Real-time data received:", data);

      // Kirim data real-time ke WebSocket
      wss.clients.forEach(async (client) => {
        // Pastikan ada userId di data
        if (data && data.userId) {
          try {
            // Mendapatkan data nama user berdasarkan userId
            const userData = await getuser(data.userId);

            // Injeksi nama pengguna ke dalam data real-time
            const injectedData = {
              ...data, // Copy semua properti data
              no: userData ? userData.id : 0,
              userName: userData ? userData.user_name : "Unknown", // Menambahkan user_name
            };

            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(injectedData)); // Kirim data yang sudah diinjeksi
            }
          } catch (error) {
            console.error("Error fetching user data:", error);
          }
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

// Fungsi untuk mengambil data user dan mengirimkannya
async function getuserdata() {
  try {
    const usersResponse = await zkInstance.getUsers();
    const users = usersResponse.data;
    // console.log(users);
    users.forEach((user) => {
      saveAttendanceToDB(user.userId, user.name, new Date().toISOString());
    });
  } catch (err) {
    console.error("Error fetching user data:", err);
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
    const logs = await zkInstance.getAttendances();
    res.json(logs);
  } catch (err) {
    res.status(500).send("Error fetching logs");
  }
});

// Mulai koneksi ke perangkat fingerprint
connectFingerprintDevice();
