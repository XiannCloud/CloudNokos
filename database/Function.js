// ========== Function Utility NDY OFFC ========== //
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const moment = require("moment-timezone");

// Lokasi saldo.json
const saldoPath = path.join(__dirname, "../database/saldoOtp.json");

function getRuntime() {
  const uptime = process.uptime(); // waktu hidup dalam detik
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  return `${days} Hari, ${hours} Jam, ${minutes} Menit, ${seconds} Detik`;
}

// ================= TOTAL USERS =================
function getTotalUsers() {
  try {
    const usersData = fs.readFileSync("./users.json", "utf-8");
    const users = JSON.parse(usersData);
    return users.length;
  } catch (err) {
    console.error("❌ Error membaca users.json:", err.message);
    return 0;
  }
}

// ================= SALDO HANDLER =================
function getUserSaldo(userId) {
  try {
    if (!fs.existsSync(saldoPath)) {
      fs.writeFileSync(saldoPath, JSON.stringify({}, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(saldoPath));
    return data[userId] || 0;
  } catch (e) {
    console.error("❌ Gagal baca saldo:", e.message);
    return 0;
  }
}

function setUserSaldo(userId, saldo) {
  try {
    let data = {};
    if (fs.existsSync(saldoPath)) {
      data = JSON.parse(fs.readFileSync(saldoPath));
    }
    data[userId] = saldo;
    fs.writeFileSync(saldoPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("❌ Gagal simpan saldo:", e.message);
  }
}

// Fungsi waktu Indonesia
function getWaktuIndonesia() {
  return moment().tz("Asia/Jakarta").format("DD MMMM YYYY • HH:mm:ss [WIB]");
}

// ================= FORMAT =================
function toIDR(number) {
  return Number(number).toLocaleString("id-ID");
}

function toRupiah(number) {
  return Number(number).toLocaleString("id-ID");
}

function toIDRSimple(num) {
  return Number(num).toLocaleString("id-ID");
}

function toRupiah(nominal) {
  return nominal.toLocaleString("id-ID");
}
function toRupiah(angka) {
  if (!angka || isNaN(angka)) return "0";
  return angka.toLocaleString("id-ID");
}

function formatRupiah(angka) {
  return `Rp${Number(angka).toLocaleString("id-ID")}`;
}

// ================= RANDOM GENERATOR =================
function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHex(len = 8) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function generateRandomPassword(length = 12) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567890!@#$%^&*()";
  let pass = "";
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// ================= WAKTU =================
function dateTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

// ========== EXPORT SEMUA FUNCTION ==========
module.exports = {
  getRuntime,
  getTotalUsers,
  getUserSaldo,
  setUserSaldo,
  toIDR,
  toRupiah,
  toIDRSimple,
  formatRupiah,
  generateRandomNumber,
  randomHex,
  generateRandomPassword,
  getWaktuIndonesia,
  dateTime,
};