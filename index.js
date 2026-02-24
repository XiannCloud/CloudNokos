process.on("unhandledRejection", (reason) => console.log("[ANTI CRASH] Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => console.log("[ANTI CRASH] Uncaught Exception:", err));
process.on("uncaughtExceptionMonitor", (err) => console.log("[ANTI CRASH MONITOR]:", err));

const config = require("./config.js");
const TelegramBot = require("node-telegram-bot-api");
const moment = require('moment-timezone');
const { Client } = require('ssh2');
const { exec } = require('child_process');
const FormData = require('form-data');
const fetch = require('node-fetch');
const axios = require('axios');
const figlet = require("figlet");
const crypto = require("crypto");
const fs = require("fs");
const chalk = require("chalk");
const P = require("pino");
const path = require("path");
const { execSync } = require('child_process'); 
const { InlineKeyboardButton } = require('telegraf');
let subdomainSelectionContext = {}; // { userId: { host, ip, created, msgId } }
const { cloudflareDomains } = require("./config.js");
const qs = require('qs');
const QRCode = require('qrcode');
const bot = new TelegramBot(config.TOKEN, { polling: true });
const owner = config.OWNER_ID.toString();
const urladmin = config.urladmin;
const urlchannel = config.urlchannel;
const channellog = config.idchannel;
console.log("✅ Bot RALZZ OFFC berjalan tanpa error!");

// ====================================================
// 🧱 FILE DATABASE
// ====================================================
// ================== IMPORT MODULE ==================
const BackupManager = require("./database/backupManager.js");

// ================== KONFIGURASI INTERVAL BACKUP ==================
const INTERVAL_HOURS = 1; // Backup tiap 1 jam
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000; // dikonversi ke ms

// Pastikan folder ./library ada
const libraryPath = path.join(__dirname, "database");
if (!fs.existsSync(libraryPath)) fs.mkdirSync(libraryPath, { recursive: true });

// Simpan file lastBackup.json di dalam folder ./library/
const BACKUP_FILE = path.join(libraryPath, "lastBackup.json");

// ================== INISIASI BACKUP MANAGER ==================
const backupManager = new BackupManager(bot, owner, INTERVAL_MS, BACKUP_FILE);

// Jalankan auto-backup ketika bot dihidupkan
backupManager.startAutoBackup();

//##################################//

const blacklistFile = path.join(__dirname, "./database/blacklist.json");
if (!fs.existsSync(blacklistFile)) fs.writeFileSync(blacklistFile, JSON.stringify([], null, 2));

const maintenanceFile = path.join(__dirname, "./database/maintenance.json");
if (!fs.existsSync(maintenanceFile)) fs.writeFileSync(maintenanceFile, JSON.stringify({ status: false }));

const groupOnlyFile = path.join(__dirname, "./database/grouponly.json");
if (!fs.existsSync(groupOnlyFile)) fs.writeFileSync(groupOnlyFile, JSON.stringify({ status: false }));

const modeFile = path.join(__dirname, "./database/mode.json");
if (!fs.existsSync(modeFile)) fs.writeFileSync(modeFile, JSON.stringify({ self: false }));

const joinChFile = path.join(__dirname, "./database/joinchannel.json");
if (!fs.existsSync(joinChFile)) {
  fs.writeFileSync(joinChFile, JSON.stringify({ status: false }, null, 2));
}

const saldoPath = path.join(__dirname, "./database/saldoOtp.json");
const trxPath = path.join(__dirname, "./database/transaksi.json");

const { 
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
  dateTime
} = require("./database/Function");

// ====================================================
// 🔧 UTIL
// ====================================================

function logError(err, where = "Unknown") {
  const time = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const text = `[${time}] [${where}]\n${err.stack || err}\n\n`;
  console.error(text);
  fs.appendFileSync("error.log", text);
}

function updateConfig(key, value) {
  let fileData = fs.readFileSync(configPath, "utf8");

  // boolean harus tanpa kutip
  const val = typeof value === "boolean" ? value : value;

  const regex = new RegExp(`${key}:\\s*(.*?),`);
  fileData = fileData.replace(regex, `${key}: ${val},`);

  fs.writeFileSync(configPath, fileData);

  // CLEAR CACHE DAN RELOAD
  delete require.cache[require.resolve("./config.js")];
  config = require("./config.js");
}

function addSaldo(userId, amount) {
  const fs = require("fs");
  const saldoFile = "./database/saldoOtp.json";
  let saldoDB = {};

  if (fs.existsSync(saldoFile)) {
    saldoDB = JSON.parse(fs.readFileSync(saldoFile));
  }

  if (!saldoDB[userId]) saldoDB[userId] = 0;
  saldoDB[userId] += amount;

  console.log("[SALDO UPDATE]", userId, "=>", saldoDB[userId]); // <— DEBUG

  fs.writeFileSync(saldoFile, JSON.stringify(saldoDB, null, 2));
}

function saveUser(userId) {
  const fs = require("fs");
  const file = "./users.json";
  let db = [];

  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file));
  }

  if (!db.includes(userId)) {
    db.push(userId);
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
    return true; // menandakan user baru
  }
  return false; // user sudah ada
}

function userHasStarted(userId) {
  const fs = require("fs");
  const file = "./users.json";

  if (!fs.existsSync(file)) return false;

  const db = JSON.parse(fs.readFileSync(file));
  return db.includes(userId);
}

function checkJoinChannel() {
  try {
    return JSON.parse(fs.readFileSync(joinChFile)).status;
  } catch {
    return false;
  }
}

function checkMaintenance() {  
  try {  
    return JSON.parse(fs.readFileSync(maintenanceFile)).status;  
  } catch {  
    return false;  
  }  
}  

function checkGroupOnly() {  
  try {  
    return JSON.parse(fs.readFileSync(groupOnlyFile)).status;  
  } catch {  
    return false;  
  }  
}  

function checkSelfMode() {  
  try {  
    return JSON.parse(fs.readFileSync(modeFile)).self;  
  } catch {  
    return false;  
  }  
}  

// ====================== 🧱 GUARD UTAMA (BLOKIR GLOBAL + COOLDOWN) ======================
const cooldownMap = new Map(); // simpan waktu cooldown user

async function guardAll(x) {
  const isCallback = x.data !== undefined;
  const userId = isCallback ? x.from.id.toString() : x.from.id.toString();
  const chatId = isCallback ? x.message.chat.id : x.chat.id;
  const isPrivate = isCallback ? x.message.chat.type === "private" : x.chat.type === "private";
  const answer = (text, alert = true) => {
    if (isCallback) {
      return bot.answerCallbackQuery(x.id, { text, show_alert: alert });
    } else {
      return bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    }
  };

  const channelUsername = config.urlchannel.replace("https://t.me/", "").replace("@", "");
  const isOwner = userId === config.OWNER_ID.toString();

  // === ⚙️ CEK WAJIB JOIN CHANNEL ===
  if (checkJoinChannel() && isPrivate && !isOwner) {
    try {
      const member = await bot.getChatMember(`@${channelUsername}`, userId);
      const isJoined = ["member", "administrator", "creator"].includes(member.status);

      if (!isJoined) {
        if (!isCallback) {
          await bot.sendMessage(chatId, `
🚫 *Akses Ditolak!*
Kamu harus bergabung ke channel resmi terlebih dahulu untuk menggunakan bot ini.

🔗 [Join Channel](${config.urlchannel})

Setelah bergabung, tekan tombol di bawah ini.`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "✅ Sudah Join", callback_data: "cek_join_guard" }],
                  [{ text: "🔗 Join Channel", url: config.urlchannel }]
                ]
              }
            }
          );
        } else {
          await answer("❌ Kamu belum join channel.", true);
        }
        return true;
      }
    } catch (e) {
      console.log("⚠️ Gagal cek channel:", e.message);
    }
  }

  // === 🔒 Blacklist ===
  try {
    const blacklist = JSON.parse(fs.readFileSync(blacklistFile, "utf8"));
    const isBlacklisted = blacklist.find((u) => u.id === userId);
    if (isBlacklisted && !isOwner) {
      await answer(
        `🚫 *Akses Ditolak!*\nKamu telah diblacklist dari penggunaan bot.\n\n📋 *Alasan:* ${isBlacklisted.alasan}\n🕐 *Waktu:* ${isBlacklisted.waktu}\n\nHubungi admin jika ini kesalahan.`,
        true
      );
      return true;
    }
  } catch (err) {
    console.error("❌ Error membaca blacklist:", err);
  }

  // === ⚙️ Maintenance ===
  if (checkMaintenance() && !isOwner) {
    await answer("⚙️ Bot sedang *maintenance*. Silakan coba lagi nanti.", true);
    return true;
  }

  // === 🚫 Group-only ===
  if (checkGroupOnly() && isPrivate && !isOwner) {
    await answer("🚫 Bot hanya bisa digunakan di *grup* untuk sementara.", true);
    return true;
  }

  // === 🤫 Self Mode ===
  if (checkSelfMode() && !isOwner) return true;

  return false;
}

global.guardAll = guardAll;

// =====================================================
// 🔁 CALLBACK UNTUK TOMBOL "✅ SUDAH JOIN"
// =====================================================
bot.on("callback_query", async (query) => {
  const data = query.data;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;

  if (userId === config.OWNER_ID.toString()) {
    if (data === "cek_join_guard") {
      await bot.answerCallbackQuery(query.id, { text: "OWNER detected ✓", show_alert: false });
      return bot.sendMessage(chatId, "🚀 Owner tidak perlu join channel.");
    }
    return;
  }

  if (data !== "cek_join_guard") return;
  
  const channelUsername = config.urlchannel.replace("https://t.me/", "").replace("@", "");

  try {
    const member = await bot.getChatMember(`@${channelUsername}`, userId);
    const isJoined = ["member", "administrator", "creator"].includes(member.status);

    if (isJoined) {
      await bot.deleteMessage(chatId, messageId).catch(() => {});
      await bot.answerCallbackQuery(query.id, { text: "✅ Kamu sudah join channel!", show_alert: false });
      await bot.sendMessage(chatId, "✅ Terima kasih sudah join! Sekarang kamu bisa menggunakan bot.");
    } else {
      await bot.answerCallbackQuery(query.id, { text: "🚫 Kamu belum join channel!", show_alert: true });
    }
  } catch (e) {
    console.log("⚠️ Error cek ulang channel:", e.message);
    await bot.answerCallbackQuery(query.id, { text: "⚠️ Gagal cek channel!", show_alert: true });
  }
});

//##################################//
// Logs Message In Console
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (!msg.text.startsWith("/")) return;

  const command = msg.text.split(" ")[0].toLowerCase();
  const userId = msg.from.id;
  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  const chatType = msg.chat.type === "private"
    ? "Private"
    : `Public (${msg.chat.title || "Group Tanpa Nama"})`;

  // Format tanggal Indonesia
  const waktu = moment().tz("Asia/Jakarta");
  const tanggal = waktu.format("DD/MMMM/YYYY"); // contoh: 23/September/2025
  const hari = waktu.format("dddd"); // contoh: Senin

  console.log(
    chalk.blue.bold("Messages Detected 🟢") +
    chalk.white.bold("\n▢ Command : ") + chalk.green.bold(command) +
    chalk.white.bold("\n▢ Pengirim : ") + chalk.magenta.bold(userId) +
    chalk.white.bold("\n▢ Name : ") + chalk.red.bold(username) +
    chalk.white.bold("\n▢ Chat Type : ") + chalk.yellow.bold(chatType) +
    chalk.white.bold("\n▢ Tanggal : ") + chalk.cyan.bold(`${hari}, ${tanggal}\n`)
  );
});

// ==================== ⚡ SYSTEM LOG : AUTO SAVE ID ====================
bot.on("message", (msg) => {
  if (!msg.from) return;

  // ⛔ ABAIKAN PESAN REFERRAL (tidak disimpan)
  if (msg.text && msg.text.startsWith("/start ref_")) return;

  const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
  const userId = msg.from.id.toString();
  const waktu = moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss");

  const usersFile = path.join(__dirname, "users.json");
  let users = [];

  if (fs.existsSync(usersFile)) {
    try {
      users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch {
      users = [];
    }
  }

  if (!users.includes(userId)) {
    users.push(userId);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    const totalID = users.length;

    bot.sendMessage(
      config.OWNER_ID,
      `
🕶️ *[ CYBER DATABASE UPDATE ]*
━━━━━━━━━━━━━━━━━━━━━━━
🧠 *New User Signature Detected*

👤 *Agent:* ${username}
🆔 *ID Code:* \`${userId}\`
🕒 *Timestamp:* ${waktu}
📊 *Registry Count:* ${totalID}

📡 *Status:* _Identity archived into mainframe._
━━━━━━━━━━━━━━━━━━━━━━━
💀 *System Node Sync Completed*
#AutoSaveID #CyberCore
`,
      { parse_mode: "HTML" }
    );
  }
});

const sendMessage = (chatId, text) => bot.sendMessage(chatId, text);
bot.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "ownermenu", description: "Fitur Only Owner" }
]);

// =====================
const sessionPath = path.join(__dirname, 'sessioncs.json');

let contactSession = {};
let terminatedSession = {};
let forwardedMap = {};

// Load session dari file jika ada
if (fs.existsSync(sessionPath)) {
  const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  contactSession = data.contactSession || {};
  terminatedSession = data.terminatedSession || {};
  forwardedMap = data.forwardedMap || {};
}

// Simpan session ke file
function saveSession() {
  fs.writeFileSync(sessionPath, JSON.stringify({ contactSession, terminatedSession, forwardedMap }, null, 2));
}

async function handleReferralStart(msg) {
  const fs = require("fs");
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const config = require("./config.js");

  try {
    const text = msg.text || "";
    if (!text.startsWith("/start ref_")) return;

    // === PASTIKAN refCode DIDEKLARASIKAN SEBELUM DIPAKAI ===
    const refCode = text.replace("/start ", "").trim();

    // === Load SystemReferral (safe) ===
    const sysPath = "./database/SystemReferral.json";
    let sysRef = { Referral_Enabled: true, Referral_PerUser: 0, Referral_PerDaftar: 0 };
    if (fs.existsSync(sysPath)) {
      try {
        const raw = fs.readFileSync(sysPath, "utf8");
        sysRef = JSON.parse(raw);
      } catch (e) {
        // jika rusak → anggap disabled supaya aman
        console.error("SystemReferral.json parse error:", e.message);
        sysRef = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };
      }
    }

    // Jika referral OFF → beritahu user dan (opsional) owner pemilik kode
    if (!sysRef.Referral_Enabled) {
      // Notifikasi user yang klik link
      await bot.sendMessage(chatId,
        "🔴 <b>Sistem referral sedang NONAKTIF oleh owner.</b>\nReferral tidak dapat digunakan saat ini.",
        { parse_mode: "HTML" }
      ).catch(()=>{});

      // Opsional notif owner kode (jika file kode ada dan owner ditemukan)
      try {
        const codeFile = "./database/referralCode.json";
        if (fs.existsSync(codeFile)) {
          const referralCodes = JSON.parse(fs.readFileSync(codeFile, "utf8"));
          const ownerEntry = Object.entries(referralCodes).find(e => `ref_${e[1]}` === refCode);
          if (ownerEntry) {
            const ownerId = ownerEntry[0];
            await bot.sendMessage(ownerId,
              `⚠️ Referral tidak diproses: user <code>${userId}</code> mengklik link ref kamu,\nnamun sistem referral sedang OFF.`,
              { parse_mode: "HTML" }
            ).catch(()=>{});
          }
        }
      } catch (e) {
        console.error("Notif owner failed:", e.message);
      }

      return; // STOP TOTAL
    }

    // === File kode referral (safe parse) ===
    const codeFile = "./database/referralCode.json";
    if (!fs.existsSync(codeFile)) return; // no codes

    let referralCodes = {};
    try {
      referralCodes = JSON.parse(fs.readFileSync(codeFile, "utf8"));
    } catch (e) {
      console.error("referralCode.json parse error:", e.message);
      return;
    }

    const ownerCode = Object.entries(referralCodes).find(e => `ref_${e[1]}` === refCode);
    if (!ownerCode) return; // kode tidak valid

    const ownerId = ownerCode[0];

    // 🚫 Anti refer diri sendiri
    if (ownerId === userId) {
      return bot.sendMessage(chatId, "❌ Kamu tidak bisa memakai kode referral milik sendiri.");
    }

    // 🚫 Cek jika user sudah pernah pakai bot → referral gagal
    if (typeof userHasStarted === "function" && userHasStarted(userId)) {
      // Notifikasi ke owner referral
      bot.sendMessage(
        ownerId,
        `⚠️ <b>Referral Gagal</b>\n\n` +
        `👤 User: <code>${userId}</code>\n` +
        `📌 Alasan: User sudah pernah menggunakan bot sebelumnya.\n` +
        `❌ Bonus tidak diberikan.`,
        { parse_mode: "HTML" }
      ).catch(()=>{});

      return bot.sendMessage(chatId,
        "ℹ️ Kamu sudah pernah menggunakan bot sebelumnya, jadi referral tidak bisa dipakai.",
        { parse_mode: "HTML" }
      ).catch(()=>{});
    }

    // ===============================
    // 📌 Load referral database (safe)
    // ===============================
    const referralDB = "./database/referral.json";
    let referralData = {};
    if (fs.existsSync(referralDB)) {
      try {
        const raw = fs.readFileSync(referralDB, "utf8");
        referralData = JSON.parse(raw);
      } catch (e) {
        console.error("referral.json parse error:", e.message);
        referralData = {};
      }
    }

    // Ambil bonus dari SystemReferral (sudah aman di atas)
    const BONUS_REFERRAL = Number(sysRef.Referral_PerUser) || 0;  // Bonus untuk owner kode
    const BONUS_REFERRED = Number(sysRef.Referral_PerDaftar) || 0; // Bonus untuk user baru

    // Simpan data referral baru
    referralData[userId] = {
      referrerId: refCode,
      newUser: userId,
      bonus: BONUS_REFERRAL,
      date: new Date().toISOString(),
    };

    fs.writeFileSync(referralDB, JSON.stringify(referralData, null, 2));

    // ==========================================================
    // 🔥 UPDATE SALDO OTOMATIS (safe)
    // ==========================================================
    const saldoFile = "./database/saldoOtp.json";
    if (!fs.existsSync(saldoFile)) {
      fs.writeFileSync(saldoFile, JSON.stringify({}, null, 2));
    }

    let saldo = {};
    try {
      saldo = JSON.parse(fs.readFileSync(saldoFile, "utf8"));
    } catch (e) {
      saldo = {};
    }

    // Pastikan user & owner punya saldo
    if (!saldo[userId]) saldo[userId] = 0;
    if (!saldo[ownerId]) saldo[ownerId] = 0;

    // Tambah saldo
    saldo[userId] = Number(saldo[userId]) + Number(BONUS_REFERRED);
    saldo[ownerId] = Number(saldo[ownerId]) + Number(BONUS_REFERRAL);

    // Simpan saldo
    fs.writeFileSync(saldoFile, JSON.stringify(saldo, null, 2));

    // ==========================================================
    // 🔔 NOTIFIKASI
    // ==========================================================
    // Notifikasi ke owner kode referral
    bot.sendMessage(
      ownerId,
      `🎉 <b>Referral Baru!</b>\n\n` +
      `👤 User: <code>${userId}</code>\n` +
      `💰 Bonus Diterima: <b>Rp ${BONUS_REFERRAL.toLocaleString("id-ID")}</b>\n` +
      `💼 Saldo Baru: Rp ${saldo[ownerId].toLocaleString("id-ID")}`,
      { parse_mode: "HTML" }
    ).catch(()=>{});

    // Notifikasi ke user baru
    bot.sendMessage(
      chatId,
      `🎁 Kamu mendapatkan bonus <b>Rp ${BONUS_REFERRED.toLocaleString("id-ID")}</b> dari referral!\n` +
      `💼 Saldo Baru: Rp ${saldo[userId].toLocaleString("id-ID")}`,
      { parse_mode: "HTML" }
    ).catch(()=>{});

  } catch (err) {
    console.error("handleReferralStart error:", err);
  }
}
// ==============================================
// 💠 FITUR /nokos — VirtuSIM RALZZ EDITION (UI Premium)
// ==============================================
bot.onText(/^\/start(?:\s+.+)?$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username ? `@${msg.from.username}` : "❌ Tidak ada username";
  const name = msg.from.first_name || "Tanpa Nama";
  const config = require("./config.js");
      if (await guardAll(msg)) return;
await handleReferralStart(msg);
saveUser(msg.from.id.toString()); // <— universal save

    // =====================================================
    // 🔹 LOAD SYSTEM REFERRAL FROM JSON (BUKAN DARI CONFIG)
    // =====================================================
    const sysPath = "./database/SystemReferral.json";
    let sys = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };

    if (fs.existsSync(sysPath)) {
      sys = JSON.parse(fs.readFileSync(sysPath));
    }

    const BONUS_REFERRAL = sys.Referral_PerUser || 0;
    const BONUS_REFERRED = sys.Referral_PerDaftar || 0;    
  
    // 🔹 Ambil total pengguna dari users.json
    const usersFile = "./users.json";
    let totalUsers = 0;

    if (fs.existsSync(usersFile)) {
      const dataUsers = JSON.parse(fs.readFileSync(usersFile));
      if (Array.isArray(dataUsers)) {
        totalUsers = dataUsers.length;
      }
    }


  const photoUrl = config.ppthumb; // 📸 Banner VirtuSIM

const caption = `
<blockquote>🛒 𝗔𝗨𝗧𝗢𝗠𝗔𝗧𝗜𝗖 𝗢𝗥𝗗𝗘𝗥 
𝗛𝗮𝗹𝗹𝗼 ${name} ( 👋 )
𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗱𝗮𝘁𝗮𝗻𝗴 𝗱𝗶 𝗯𝗼𝘁 𝗮𝘂𝘁𝗼 𝗼𝗿𝗱𝗲𝗿 𝗻𝗼𝗺𝗼𝗿 𝗸𝗼𝘀𝗼𝗻𝗴 𝗸𝗮𝗺𝗶.
──────── ୨୧ ──────── 

📊 𝗦𝗧𝗔𝗧𝗨𝗦 𝗔𝗞𝗨𝗡 𝗔𝗡𝗗𝗔 :
• 👤 𝗡𝗮𝗺𝗮 : ${name}  
• 🆔 𝗜𝗗 𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮 : \`${userId}\`  
• 🔗 𝗨𝘀𝗲𝗿𝗻𝗮𝗺𝗲 : ${username}  
• 👥 𝗧𝗼𝘁𝗮𝗹 𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮 : ${totalUsers.toLocaleString("id-ID")} 𝗢𝗿𝗮𝗻𝗴

──────── ୨୧ ──────── 
</blockquote>
`;

    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
    [
      { text: "📱 𝗢𝗥𝗗𝗘𝗥", callback_data: "choose_service" }
    ],
    [
      { text: "💰 𝗗𝗘𝗣𝗢𝗦𝗜𝗧", callback_data: "topup_nokos" },
      { text: "💳 𝗖𝗘𝗞 𝗦𝗔𝗟𝗗𝗢", callback_data: "profile" }
    ],
    [    
      { text: "🛒 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗢𝗥𝗗𝗘𝗥", callback_data: "history_orderbot" },
      { text: "📊 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗣𝗢𝗦𝗜𝗧", callback_data: "riwayat_deposit" }
    ],
    [
      { text: "📞 𝗕𝗔𝗡𝗧𝗨𝗔𝗡 𝗖𝗦", callback_data: "contact_admin" }
    ],
      ],
    },
  };
  
  
  await bot.sendPhoto(chatId, photoUrl, { caption, ...options });
});
// ==============================================
// 💠 CALLBACK HANDLER — VirtuSIM Marketplace (FIXED)
// ==============================================
bot.on("callback_query", async (callbackQuery) => {
  const { message, data, from } = callbackQuery;
  const chatId = message?.chat?.id;
  const userId = from?.id;
  const messageId = message?.message_id;
  const axios = require("axios");
  const API_KEY = config.RUMAHOTP;
  const perPage = 20;

  // 🧩 Inisialisasi cache global jika belum ada
  if (!global.cachedServices) global.cachedServices = [];
  if (!global.cachedCountries) global.cachedCountries = {};
  if (!global.lastServicePhoto) global.lastServicePhoto = {};
  if (!global.lastCountryPhoto) global.lastCountryPhoto = {};

  try {

// ===============================
// 📦 PILIH SERVICE (DAFTAR APLIKASI OTP)
// ===============================
if (data === "choose_service") {
    const page = 1;
    const perPage = 20;

    // 💬 LANGSUNG UBAH CAPTION MENJADI LOADING
    await bot.editMessageCaption("<blockquote>⏳ 𝗠𝗲𝗺𝘂𝗮𝘁 𝗗𝗮𝗳𝘁𝗮𝗿 𝗟𝗮𝘆𝗮𝗻𝗮𝗻......</blockquote>", {
        chat_id: chatId,
        message_id: message.message_id,
        parse_mode: "HTML"
    }).catch(() => {});

    try {
        const response = await axios.get("https://www.rumahotp.com/api/v2/services", {
            headers: { "x-apikey": API_KEY }
        });

        if (!response.data.success || !Array.isArray(response.data.data)) {
            throw new Error("API tidak valid");
        }

        const services = response.data.data;
        global.cachedServices = services;

        const totalPages = Math.ceil(services.length / perPage);

        const makeKeyboard = (page) => {
            const start = (page - 1) * perPage;
            const end = start + perPage;
            const list = services.slice(start, end);

            const keyboard = list.map((srv) => [
                {
                    text: `${srv.service_name} | ID ${srv.service_code}`,
                    callback_data: `service_${srv.service_code}`
                }
            ]);

            const nav = [];
            if (page > 1) nav.push({ text: "⬅️ Prev", callback_data: `choose_service_page_${page - 1}` });
            if (page < totalPages) nav.push({ text: "➡️ Next", callback_data: `choose_service_page_${page + 1}` });

            if (nav.length) keyboard.push(nav);

            keyboard.push([{ text: `📖 Hal ${page}/${totalPages}`, callback_data: "noop" }]);
            keyboard.push([{ text: "🏠 Kembali Ke Menu Utama", callback_data: "back_home" }]);

            return keyboard;
        };

        const caption = `
<blockquote>📲 𝗗𝗮𝗳𝘁𝗮𝗿 𝗔𝗽𝗽 𝗢𝘁𝗽

𝗦𝗶𝗹𝗮𝗸𝗮𝗻 𝗽𝗶𝗹𝗶𝗵 𝘀𝗮𝗹𝗮𝗵 𝘀𝗮𝘁𝘂 𝗮𝗽𝗹𝗶𝗸𝗮𝘀𝗶 𝘂𝗻𝘁𝘂𝗸 𝗺𝗲𝗹𝗮𝗻𝗷𝘂𝘁𝗸𝗮𝗻.
📄 𝗛𝗮𝗹𝗮𝗺𝗮𝗻 ${page} 𝗗𝗮𝗿𝗶 ${totalPages}
💡 𝗧𝗼𝘁𝗮𝗹 𝗟𝗮𝘆𝗮𝗻𝗮𝗻 ${services.length}</blockquote>
`;

        // 🖼️ EDIT FOTO + CAPTION SEKALIGUS JADI LIST SERVICE
        await bot.editMessageMedia(
            {
                type: "photo",
                media: config.ppthumb,
                caption,
                parse_mode: "HTML"
            },
            {
                chat_id: chatId,
                message_id: message.message_id,
                reply_markup: { inline_keyboard: makeKeyboard(page) }
            }
        );

        global.lastServicePhoto[userId] = {
            chatId,
            messageId: message.message_id
        };

    } catch (err) {
        await bot.editMessageCaption("❌ *Gagal memuat daftar layanan.*", {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: "HTML"
        });
    }
}
if (data.startsWith("choose_service_page_")) {
    const perPage = 20;
    const page = Number(data.split("_").pop());
    const services = global.cachedServices;

    if (!services || services.length === 0) {
        return bot.sendMessage(chatId, "⚠️ Data layanan tidak ditemukan. Silakan jalankan /start.");
    }

    const lastPhoto = global.lastServicePhoto[userId];
    if (!lastPhoto)
        return bot.sendMessage(chatId, "⚠️ Tidak dapat menemukan daftar sebelumnya. Silakan klik Layanan Nokos lagi.");

    const { chatId: pChat, messageId } = lastPhoto;
    const totalPages = Math.ceil(services.length / perPage);

    const makeKeyboard = (page) => {
        const start = (page - 1) * perPage;
        const end = start + perPage;
        const currentPage = services.slice(start, end);

        const keyboard = currentPage.map((srv) => [
            {
                text: `${srv.service_name} | ID ${srv.service_code}`,
                callback_data: `service_${srv.service_code}`
            }
        ]);

        const nav = [];
        if (page > 1)
            nav.push({ text: "⬅️ Prev", callback_data: `choose_service_page_${page - 1}` });
        if (page < totalPages)
            nav.push({ text: "➡️ Next", callback_data: `choose_service_page_${page + 1}` });

        if (nav.length) keyboard.push(nav);

        keyboard.push([{ text: `📖 Hal ${page}/${totalPages}`, callback_data: "noop" }]);
        keyboard.push([{ text: "🏠 Kembali Ke Menu Utama", callback_data: "back_home" }]);

        return keyboard;
    };

    const caption = `
<blockquote>📲 𝗗𝗮𝗳𝘁𝗮𝗿 𝗔𝗽𝗽 𝗢𝘁𝗽

𝗦𝗶𝗹𝗮𝗸𝗮𝗻 𝗽𝗶𝗹𝗶𝗵 𝘀𝗮𝗹𝗮𝗵 𝘀𝗮𝘁𝘂 𝗮𝗽𝗹𝗶𝗸𝗮𝘀𝗶 𝘂𝗻𝘁𝘂𝗸 𝗺𝗲𝗹𝗮𝗻𝗷𝘂𝘁𝗸𝗮𝗻.
📄 𝗛𝗮𝗹𝗮𝗺𝗮𝗻 ${page} 𝗗𝗮𝗿𝗶 ${totalPages}
💡 𝗧𝗼𝘁𝗮𝗹 𝗟𝗮𝘆𝗮𝗻𝗮𝗻 ${services.length}</blockquote>
`;

    await bot.editMessageCaption(caption, {
        chat_id: pChat,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: makeKeyboard(page) },
    });
}
// ======================================================
// 🌍 PILIH NEGARA — V8 (Caption Loading FIX)
// ======================================================
if (data.startsWith("service_") || data.startsWith("countrylist_")) {
    const axios = require("axios");
    const apiKey = config.RUMAHOTP;

    let serviceId, page = 1;
    let isPagination = false;

    if (data.startsWith("service_")) {
        serviceId = data.split("_")[1];
    }

    if (data.startsWith("countrylist_")) {
        const parts = data.split("_");
        serviceId = parts[1];
        page = Number(parts[2]);
        isPagination = true;
    }

    bot.answerCallbackQuery(callbackQuery.id).catch(() => {});

    // =====================================
    // ✔ FIX: Saat user klik service → caption jadi loading
    // =====================================
    if (!isPagination) {
        let serviceName = "Layanan Tidak Dikenal";
        if (global.cachedServices) {
            const s = global.cachedServices.find(a => a.service_code == serviceId);
            if (s) serviceName = s.service_name;
        }

        await bot.editMessageCaption(
            `⏳ Memuat negara untuk layanan ${serviceName} (ID ${serviceId})...`,
            {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: "HTML"
            }
        ).catch(() => {});
    }

    try {
        // Cache country per service
        if (!global.cachedCountries) global.cachedCountries = {};
        if (!global.cachedCountries[serviceId]) {
            const res = await axios.get(
                `https://www.rumahotp.com/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey, Accept: "application/json" } }
            );

            if (!res.data.success) throw new Error("API Error");

            global.cachedCountries[serviceId] = res.data.data.filter(
                x => x.pricelist && x.pricelist.length > 0
            );
        }

        const countries = global.cachedCountries[serviceId];
        const totalCountries = countries.length;

        if (totalCountries === 0) {
            return bot.editMessageCaption(
                "⚠️ *Tidak ada negara untuk layanan ini.*",
                {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: "HTML"
                }
            );
        }

        const perPage = 20;
        const totalPages = Math.ceil(totalCountries / perPage);

        const start = (page - 1) * perPage;
        const slice = countries.slice(start, start + perPage);

        let serviceName = "Layanan Tidak Dikenal";
        if (global.cachedServices) {
            const s = global.cachedServices.find(a => a.service_code == serviceId);
            if (s) serviceName = s.service_name;
        }

        const keyboard = slice.map(c => [
            {
                text: `${c.name} (${c.prefix}) | stok ${c.stock_total}`,
                callback_data: `country_${serviceId}_${c.iso_code}_${c.number_id}`
            }
        ]);

        const nav = [];
        if (page > 1)
            nav.push({
                text: "⬅️ Prev",
                callback_data: `countrylist_${serviceId}_${page - 1}`
            });

        if (page < totalPages)
            nav.push({
                text: "➡️ Next",
                callback_data: `countrylist_${serviceId}_${page + 1}`
            });

        if (nav.length) keyboard.push(nav);

        keyboard.push([{ text: `📖 Hal ${page}/${totalPages}`, callback_data: "noop" }]);
        keyboard.push([{ text: "⬅️ Kembali", callback_data: "choose_service" }]);

        const caption = `
<blockquote>🌍 𝗣𝗶𝗹𝗶𝗵 𝗡𝗲𝗴𝗮𝗿𝗮 
𝗟𝗮𝘆𝗮𝗻𝗮𝗻 ${serviceName} (ID ${serviceId})
Halaman: ${page}/${totalPages}
🌏 𝗧𝗼𝘁𝗮𝗹 𝗡𝗲𝗴𝗮𝗿𝗮 : ${totalCountries}</blockquote>
`;

        // ===================================
        // ✔ Jika pagination → hanya edit caption
        // ===================================
        if (isPagination && global.lastCountryPhoto) {
            return bot.editMessageCaption(caption, {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: keyboard }
            }).catch(() => {});
        }

        // ===================================
        // ✔ Jika klik pertama → replace foto /start
        // ===================================
        const sent = await bot.editMessageMedia(
            {
                type: "photo",
                media: config.ppthumb,
                caption,
                parse_mode: "HTML"
            },
            {
                chat_id: chatId,
                message_id: message.message_id,
                reply_markup: { inline_keyboard: keyboard }
            }
        );

        global.lastCountryPhoto = {
            chatId,
            messageId: message.message_id
        };

    } catch (err) {
        console.log("⚠ ERROR:", err);
        await bot.editMessageCaption("❌ *Gagal memuat negara.*", {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: "HTML"
        });
    }
}
// ===============================
// 💰 PILIH HARGA DARI NEGARA — V8 (Caption langsung loading)
// ===============================
if (data.startsWith("country_")) {
    const [, serviceId, isoCode, numberId] = data.split("_");
    const axios = require("axios");
    const apiKey = config.RUMAHOTP;
    const UNTUNG_NOKOS = config.UNTUNG_NOKOS || 0;

    let serviceName = "Layanan Tidak Dikenal";
    if (global.cachedServices) {
        const s = global.cachedServices.find(a => a.service_code == serviceId);
        if (s) serviceName = s.service_name;
    }

    // ========================================
    // ✔ LANGSUNG UBAH CAPTION JADI "LOADING"
    // ========================================
    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ Memuat harga untuk negara ${isoCode.toUpperCase()} di layanan ${serviceName}...`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        ).catch(() => {});
    }

    try {
        // =====================================================
        // Ambil negara dari cache
        // =====================================================
        let negara = null;

        if (global.cachedCountries && global.cachedCountries[serviceId]) {
            negara = global.cachedCountries[serviceId].find(
                c => String(c.number_id) === String(numberId)
            );
        }

        // Kalau tidak ada di cache, ambil dari API
        if (!negara) {
            const res = await axios.get(
                `https://www.rumahotp.com/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey } }
            );
            negara = (res.data?.data || []).find(
                c => String(c.number_id) === String(numberId)
            );
        }

        if (!negara) {
            return bot.editMessageCaption(
                `❌ Negara *${isoCode.toUpperCase()}* tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        // =====================================================
        // Filter provider aktif
        // =====================================================
        const providers = (negara.pricelist || [])
            .filter(p => p.available && p.stock > 0)
            .map(p => {
                const base = Number(p.price) || 0;
                const hargaFinal = base + UNTUNG_NOKOS;
                return {
                    ...p,
                    price: hargaFinal,
                    price_format: `Rp${hargaFinal.toLocaleString("id-ID")}`
                };
            })
            .sort((a, b) => a.price - b.price);

        if (providers.length === 0) {
            return bot.editMessageCaption(
                `⚠️ Tidak ada stok tersedia untuk negara *${negara.name}*.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        // =====================================================
        // Buat tombol harga
        // =====================================================
        const inlineKeyboard = providers.map(p => [
            {
                text: `${p.price_format} 💰 (stok ${p.stock})`,
                callback_data: `buy_${numberId}_${p.provider_id}_${serviceId}`
            }
        ]);

        inlineKeyboard.push([
            { text: "⬅️ Kembali", callback_data: `service_${serviceId}` }
        ]);

        // =====================================================
        // ✔ UPDATE CAPTION JADI LIST HARGA
        // =====================================================
        const caption = `
🌍 Negara: ${negara.name} (${negara.prefix})
📦 Layanan: ${serviceName} (ID ${serviceId})

💵 Pilih harga:
(Termurah ➜ Termahal)

📊 Total Stok: ${negara.stock_total}
`;

        await bot.editMessageCaption(caption, {
            chat_id: global.lastCountryPhoto.chatId,
            message_id: global.lastCountryPhoto.messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });

    } catch (err) {
        console.log("❌ ERROR:", err);
        await bot.editMessageCaption(
            "❌ *Gagal memuat harga.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        );
    }
}
// =====================================================
// 📋 DETAIL SETELAH PILIH HARGA — FINAL V10 (No Delete)
// =====================================================
if (data.startsWith("buy_")) {
    const parts = data.split("_");
    const numberId   = parts[1];
    const providerId = parts[2];
    const serviceId  = parts[3];

    const axios = require("axios");
    const apiKey = config.RUMAHOTP;
    const UNTUNG_NOKOS = config.UNTUNG_NOKOS || 0;
    const photoThumb = config.ppthumb;

    let serviceName = "Layanan Tidak Dikenal";
    if (global.cachedServices) {
        const svc = global.cachedServices.find(s => String(s.service_code) === String(serviceId));
        if (svc) serviceName = svc.service_name;
    }

    // =====================================================
    // ✔ LANGSUNG UBAH CAPTION JADI LOADING
    // =====================================================
    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ *Memuat detail layanan…*`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        ).catch(() => {});
    }

    try {
        // =====================================================
        // Ambil data negara (cache → API)
        // =====================================================
        let negara;
        if (global.cachedCountries && global.cachedCountries[serviceId]) {
            negara = global.cachedCountries[serviceId]
                .find(c => String(c.number_id) === String(numberId));
        }

        if (!negara) {
            const res = await axios.get(
                `https://www.rumahotp.com/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey } }
            );
            negara = (res.data?.data || [])
                .find(c => String(c.number_id) === String(numberId));
        }

        if (!negara) {
            return bot.editMessageCaption(
                `❌ Negara tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        const providerData = negara.pricelist
            .find(p => String(p.provider_id) === String(providerId));

        if (!providerData) {
            return bot.editMessageCaption(
                `❌ Provider tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        // =====================================================
        // Hitung harga
        // =====================================================
        const base = Number(providerData.price) || 0;
        const hargaFinal = base + UNTUNG_NOKOS;
        const priceFormat = `Rp${hargaFinal.toLocaleString("id-ID")}`;

        // =====================================================
        // Simpan cache untuk operator
        // =====================================================
        global.lastBuyData = {
            serviceName,
            negaraName: negara.name,
            priceFormat,
            providerServer: providerData.server_id || "-"
        };

        // =====================================================
        // Buat tombol
        // =====================================================
        const inlineKeyboard = [
            [
                { text: "📡 Pilih Operator", callback_data: `operator_${numberId}_${providerId}_${serviceId}_${negara.iso_code}` }
            ],
            [
                { text: "⬅️ Kembali Ke Harga", callback_data: `country_${serviceId}_${negara.iso_code}_${numberId}` }
            ]
        ];

        const caption = `
<blockquote>📋 DETAIL LAYANAN

📱 Layanan: ${serviceName} (ID ${serviceId})
🌍 Negara: ${negara.name} (${negara.prefix})
📦 Provider ID: ${providerId}
🔧 Server: ${providerData.server_id || "-"}

💵 Harga: ${priceFormat}
📦 Stok: ${providerData.stock}

Klik tombol di bawah untuk melanjutkan memilih operator.</blockquote>
`;

        // =====================================================
        // ✔ EDIT FOTO YANG SAMA (TIDAK HAPUS)
        // =====================================================
        await bot.editMessageMedia(
            {
                type: "photo",
                media: photoThumb,
                caption,
                parse_mode: "HTML"
            },
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                reply_markup: { inline_keyboard: inlineKeyboard }
            }
        );

    } catch (err) {
        console.error("❌ Error detail:", err?.response?.data || err.message);
        await bot.editMessageCaption(
            "❌ *Gagal memuat detail layanan.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        );
    }
}
// =====================================================
// 📡 LIST OPERATOR SETELAH PILIH PROVIDER — FINAL V10
// =====================================================
if (data.startsWith("operator_")) {
    const parts = data.split("_");
    const numberId   = parts[1];
    const providerId = parts[2];
    const serviceId  = parts[3];
    const isoCode    = parts[4];

    const axios = require("axios");
    const apiKey = config.RUMAHOTP;

    // =====================================================
    // ✔ UBAH CAPTION MENJADI LOADING (tanpa hapus pesan)
    // =====================================================
    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ *Memuat daftar operator untuk ${isoCode.toUpperCase()}…*`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        ).catch(()=>{});
    }

    try {
        // 🔥 Ambil cache dari step buy_
        const cached = global.lastBuyData || {};
        const serviceName    = cached.serviceName || "-";
        const negaraName     = cached.negaraName || isoCode.toUpperCase();
        const priceFormat    = cached.priceFormat || "-";
        const providerServer = cached.providerServer || "-";

        // =====================================================
        // AMBIL OPERATOR DARI API
        // =====================================================
        const response = await axios.get(
            `https://www.rumahotp.com/api/v2/operators?country=${encodeURIComponent(negaraName)}&provider_id=${providerId}`,
            { headers: { "x-apikey": apiKey } }
        );

        const operators = response.data?.data || [];

        if (operators.length === 0) {
            return bot.editMessageCaption(
                `⚠️ Tidak ada operator tersedia untuk negara *${negaraName}*.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        // =====================================================
        // BUAT TOMBOL OPERATOR
        // =====================================================
        const inlineKeyboard = operators.map(op => [
            {
                text: op.name,
                callback_data: `chooseop_${op.id}_${numberId}_${providerId}_${serviceId}_${isoCode}`
            }
        ]);

        inlineKeyboard.push([
            { text: "⬅️ Kembali ke Detail", callback_data: `buy_${numberId}_${providerId}_${serviceId}` }
        ]);

        // =====================================================
        // ✔ UPDATE CAPTION MENJADI LIST OPERATOR
        // =====================================================
        const caption = `
<blockquote>📡 PILIH OPERATOR

📱 Layanan: ${serviceName}
🌍 Negara: ${negaraName} (${isoCode.toUpperCase()})
💠 Provider: ${providerId}
💵 Harga: ${priceFormat}
🔧 Server: ${providerServer}

Silakan pilih operator di bawah ini:</blockquote>
`;

        await bot.editMessageCaption(caption, {
            chat_id: global.lastCountryPhoto.chatId,
            message_id: global.lastCountryPhoto.messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: inlineKeyboard }
        });

    } catch (err) {
        console.error("❌ ERROR OPERATOR:", err?.response?.data || err.message);

        await bot.editMessageCaption(
            "❌ *Gagal memuat daftar operator.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        );
    }
}
// =====================================================
// 📄 DETAIL SETELAH PILIH OPERATOR — FINAL V10 (Edit Caption Only)
// =====================================================
if (data.startsWith("chooseop_")) {
    const parts = data.split("_");
    const operatorId = parts[1];
    const numberId = parts[2];
    const providerId = parts[3];
    const serviceId = parts[4];
    const isoCode = parts[5];

    const axios = require("axios");
    const apiKey = config.RUMAHOTP;
    const UNTUNG_NOKOS = config.UNTUNG_NOKOS || 0;
    const photoThumb = config.ppthumb;

    // =====================================================
    // ✔ LANGSUNG EDIT CAPTION MENJADI LOADING
    // =====================================================
    if (global.lastCountryPhoto) {
        await bot.editMessageCaption(
            `⏳ *Mengambil detail operator…*`,
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        ).catch(()=>{});
    }

    try {
        // 🔹 Ambil nama service
        let serviceName = "Layanan Tidak Dikenal";
        if (global.cachedServices) {
            const svc = global.cachedServices.find(s => String(s.service_code) === String(serviceId));
            if (svc) serviceName = svc.service_name;
        }

        // 🔹 Ambil data negara
        let negara;
        if (global.cachedCountries && global.cachedCountries[serviceId]) {
            negara = global.cachedCountries[serviceId]
                .find(c => c.iso_code.toLowerCase() === isoCode.toLowerCase());
        }

        if (!negara) {
            const resNeg = await axios.get(
                `https://www.rumahotp.com/api/v2/countries?service_id=${serviceId}`,
                { headers: { "x-apikey": apiKey } }
            );
            negara = (resNeg.data?.data || [])
                .find(c => c.iso_code.toLowerCase() === isoCode.toLowerCase());
        }

        if (!negara) {
            return bot.editMessageCaption(
                `❌ Negara *${isoCode.toUpperCase()}* tidak ditemukan.`,
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        // 🔹 Ambil provider
        const providerData = negara.pricelist
            .find(p => String(p.provider_id) === String(providerId));

        if (!providerData) {
            return bot.editMessageCaption(
                "❌ Provider tidak ditemukan untuk negara ini.",
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        const hargaFinal = (Number(providerData.price) || 0) + UNTUNG_NOKOS;
        const priceFormat = `Rp${hargaFinal.toLocaleString("id-ID")}`;

        // 🔹 Ambil detail operator
        const ops = await axios.get(
            `https://www.rumahotp.com/api/v2/operators?country=${encodeURIComponent(negara.name)}&provider_id=${providerId}`,
            { headers: { "x-apikey": apiKey } }
        );

        const operator = (ops.data?.data || [])
            .find(o => String(o.id) === String(operatorId));

        if (!operator) {
            return bot.editMessageCaption(
                "❌ Operator tidak ditemukan.",
                {
                    chat_id: global.lastCountryPhoto.chatId,
                    message_id: global.lastCountryPhoto.messageId,
                    parse_mode: "HTML"
                }
            );
        }

        // =====================================================
        // ✔ SIAPKAN CAPTION FINAL KONFIRMASI
        // =====================================================
        const caption = `
<blockquote>📱 KONFIRMASI PESAN NOMOR

💠 Layanan: ${serviceName} (ID ${serviceId})
🌍 Negara: ${negara.name} (${negara.iso_code.toUpperCase()})
🏷️ Provider: ${providerId}
📶 Operator: ${operator.name}
💵 Harga: ${priceFormat}
📦 Stok: ${providerData.stock}

Tekan tombol di bawah untuk melanjutkan.</blockquote>
`;

        const inlineKeyboard = [
            [
                {
                    text: "✅ Pesan Nomor Ini",
                    callback_data: `confirm_${numberId}_${providerId}_${serviceId}_${operatorId}_${isoCode}`
                }
            ],
            [
                {
                    text: "⬅️ Kembali ke Operator",
                    callback_data: `operator_${numberId}_${providerId}_${serviceId}_${isoCode}`
                }
            ]
        ];

        // =====================================================
        // ✔ EDIT FOTO SAMA → GANTI CAPTION JADI KONFIRMASI
        // =====================================================
        await bot.editMessageMedia(
            {
                type: "photo",
                media: photoThumb,
                caption,
                parse_mode: "HTML"
            },
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                reply_markup: { inline_keyboard: inlineKeyboard }
            }
        );

    } catch (err) {
        console.error("❌ ERROR chooseop:", err?.response?.data || err.message);

        await bot.editMessageCaption(
            "❌ *Gagal memuat detail operator.*",
            {
                chat_id: global.lastCountryPhoto.chatId,
                message_id: global.lastCountryPhoto.messageId,
                parse_mode: "HTML"
            }
        );
    }
}
// =====================================================
// ✅ PROSES PESAN NOMOR — FIX: EDIT CAPTION LOADING (Tanpa Hapus Foto)
// =====================================================
if (data.startsWith("confirm_")) {
  const parts = data.split("_");
  const numberId = parts[1];
  const providerId = parts[2];
  const serviceId = parts[3];
  const operatorId = parts[4];
  const isoCode = parts[5];

  const fs = require("fs");
  const path = require("path");
  const axios = require("axios");
  const saldoPath = path.join(__dirname, "./database/saldoOtp.json");

  const apiKey = config.RUMAHOTP;
  const UNTUNG_NOKOS = config.UNTUNG_NOKOS || 0;

let chatId =
  callbackQuery?.message?.chat?.id ||         // Dari callbackQuery
  msg?.chat?.id ||                             // Fallback dari msg (jika ada)
  global.lastCountryPhoto?.chatId ||           // Fallback global foto terakhir
  global.lastChatId ||                         // Backup tambahan
  null;

if (!chatId) return;

// ============== FIX EDIT CAPTION SAJA ==============
await bot.editMessageCaption(
  "⏳ Memproses pesanan Anda...\nMohon tunggu sebentar.",
  {
    chat_id: global.lastCountryPhoto.chatId,
    message_id: global.lastCountryPhoto.messageId,
    parse_mode: "HTML"
  }
).catch(()=>{});
// ===================================================

  // =====================================================
  // ⚠️ STOP — JANGAN DELETE FOTO KONFIRMASI LAGI
  // ❌ (Kode deleteMessage dihapus total)
  // =====================================================

let userId = String(chatId);
let userSaldo = 0;
let saldoData = {};

try {
    if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}, null, 2));
    saldoData = JSON.parse(fs.readFileSync(saldoPath));
    userSaldo = saldoData[userId] || 0;

    // ... dst (semua tetap seperti kode kamu)

    // ===================================================
    // 💰 Ambil harga provider dari CACHE negara (tanpa request ulang)
    // ===================================================
    let hargaFinal = 0;
    let providerData = null;

    try {
      // 🔹 Cek cache global hasil dari menu "Pilih Negara"
      if (global.cachedCountries && global.cachedCountries[serviceId]) {
        const negaraCache = global.cachedCountries[serviceId].find(
          c => c.iso_code.toLowerCase() === isoCode.toLowerCase()
        );
        providerData = negaraCache?.pricelist?.find(
          p => String(p.provider_id) === String(providerId)
        );
      }

      // 🔹 Jika belum ada di cache, fallback ke API (backup)
      if (!providerData) {
        const resNeg = await axios.get(
          `https://www.rumahotp.com/api/v2/countries?service_id=${serviceId}`,
          { headers: { "x-apikey": apiKey, Accept: "application/json" } }
        );
        const negara = (resNeg.data?.data || []).find(
          c => c.iso_code.toLowerCase() === isoCode.toLowerCase()
        );
        providerData = negara?.pricelist?.find(
          p => String(p.provider_id) === String(providerId)
        );
      }

      hargaFinal = parseInt(providerData?.price || 0, 10) + UNTUNG_NOKOS;
    } catch (e) {
      console.error("❌ Gagal ambil harga provider dari cache/API:", e.message);
      hargaFinal = 0;
    }

    const priceFormatted = `Rp${hargaFinal.toLocaleString("id-ID")}`;
    const saldoFormatted = `Rp${userSaldo.toLocaleString("id-ID")}`;

    // ===================================================
    // 💳 Cek saldo user
    // ===================================================
    if (userSaldo < hargaFinal) {
await bot.editMessageCaption(
  `❌ SALDO TIDAK CUKUP!

Sisa saldo Anda: ${saldoFormatted}
Harga layanan: ${priceFormatted}

Silakan deposit terlebih dahulu.`,
  {
    chat_id: global.lastCountryPhoto.chatId,
    message_id: global.lastCountryPhoto.messageId,
    parse_mode: "HTML"
  }
).catch(()=>{});

return;
    }

    // Potong saldo
    saldoData[userId] = userSaldo - hargaFinal;
    fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

await bot.editMessageCaption(
  "🛒 Saldo cukup!\nMemproses pemesanan nomor Anda...",
  {
    chat_id: global.lastCountryPhoto.chatId,
    message_id: global.lastCountryPhoto.messageId,
    parse_mode: "HTML"
  }
).catch(()=>{});

    // ===================================================
    // 🛒 Buat pesanan
    // ===================================================
    const resOrder = await axios.get(
      `https://www.rumahotp.com/api/v2/orders?number_id=${numberId}&provider_id=${providerId}&operator_id=${operatorId}`,
      { headers: { "x-apikey": apiKey, Accept: "application/json" } }
    );

    const dataOrder = resOrder.data?.data;
    if (!dataOrder || !resOrder.data?.success) throw new Error("Order gagal, tidak ada data dari API.");

    const finalPrice = hargaFinal;
    const priceFormattedFinal = `Rp${finalPrice.toLocaleString("id-ID")}`;
    const saldoFormattedAfter = `Rp${saldoData[userId].toLocaleString("id-ID")}`;

    const caption = `
<blockquote>✅ PESANAN BERHASIL TERBUAT*

📱 Layanan: ${dataOrder.service}
🌍 Negara: ${dataOrder.country}
📶 Operator: ${dataOrder.operator}

🆔 Order ID: \`${dataOrder.order_id}\`
📞 Nomor: \`${dataOrder.phone_number}\`
💵 Harga: ${priceFormattedFinal}

⏱️ Status: ${dataOrder.status || "Menunggu OTP"}
🔐 SMS Code: -
⏳ Kadaluarsa: ${dataOrder.expires_in_minute} menit

💳 Saldo kamu telah dikurangi ${priceFormattedFinal} secara otomatis!
💰 Sisa Saldo: ${saldoFormattedAfter}

Klik tombol di bawah untuk cek SMS atau batalkan pesanan.</blockquote>
`;

    const inlineKeyboard = [
      [{ text: "📩 Cek Status / Kode SMS", callback_data: `checksms_${dataOrder.order_id}` }],
      [{ text: "❌ Batalkan Pesanan Ini", callback_data: `cancelorder_${dataOrder.order_id}` }]
    ];

await bot.editMessageMedia(
  {
    type: "photo",
    media: config.ppthumb,
    caption,
    parse_mode: "HTML"
  },
  {
    chat_id: global.lastCountryPhoto.chatId,
    message_id: global.lastCountryPhoto.messageId,
    reply_markup: { inline_keyboard: inlineKeyboard }
  }
);

// tetap simpan untuk callback berikutnya
global.lastCountryPhoto = {
  chatId: global.lastCountryPhoto.chatId,
  messageId: global.lastCountryPhoto.messageId
};

    // ===================================================
    // 💾 Simpan order aktif ke cache (untuk auto cancel)
    // ===================================================
    if (!global.activeOrders) global.activeOrders = {};
    global.activeOrders[dataOrder.order_id] = {
      userId,
      messageId: global.lastCountryPhoto.messageId,
      hargaTotal: finalPrice,
      createdAt: Date.now(),
      operator: dataOrder.operator
    };

// ===================================================
// ⏱️ AUTO CANCEL & REFUND JIKA OTP TIDAK MASUK DALAM 15 MENIT
// ===================================================
setTimeout(async () => {
  const orderInfo = global.activeOrders?.[dataOrder.order_id];
  if (!orderInfo) return; // Sudah selesai atau dibatalkan manual

  try {
    const resCheck = await axios.get(
      `https://www.rumahotp.com/api/v1/orders/get_status?order_id=${dataOrder.order_id}`,
      { headers: { "x-apikey": apiKey } }
    );

    const d = resCheck.data?.data;
    if (!d || d.status === "completed" || (d.otp_code && d.otp_code !== "-")) return;

    // Belum dapat OTP -> cancel dan refund
    await axios.get(
      `https://www.rumahotp.com/api/v1/orders/set_status?order_id=${dataOrder.order_id}&status=cancel`,
      { headers: { "x-apikey": apiKey } }
    );

    const saldoData2 = JSON.parse(fs.readFileSync(saldoPath, "utf-8"));
    saldoData2[orderInfo.userId] = (saldoData2[orderInfo.userId] || 0) + orderInfo.hargaTotal;
    fs.writeFileSync(saldoPath, JSON.stringify(saldoData2, null, 2));

    const refundFormatted = `Rp${orderInfo.hargaTotal.toLocaleString("id-ID")}`;
    const saldoFormattedNow = `Rp${saldoData2[orderInfo.userId].toLocaleString("id-ID")}`;

    try {
      await bot.deleteMessage(orderInfo.userId, orderInfo.messageId);
    } catch {}

    await bot.sendMessage(
      orderInfo.userId,
      `⌛ Pesanan Dibatalkan Otomatis (${dataOrder.expires_in_minute} Menit Tanpa OTP)\n\n🆔 
      Order ID:* \`${dataOrder.order_id}\`\n💸 *Refund: ${refundFormatted}\n💰 Saldo Saat Ini: ${saldoFormattedNow}\n\nPesanan otomatis expired & saldo telah dikembalikan.`,
      { parse_mode: "HTML" }
    );

    delete global.activeOrders[dataOrder.order_id];
  } catch (err) {
    console.error("❌ Error auto cancel:", err?.response?.data || err.message);
  }
}, dataOrder.expires_in_minute * 60 * 1000);

} catch (err) {
  console.error("❌ Error saat order nomor:", err?.response?.data || err.message);

  // ==========================
  // 🔍 DETEKSI ALASAN GAGAL
  // ==========================
  let reason = "Tidak diketahui";

  const msgErr =
    err?.response?.data?.message ||
    err?.response?.data?.msg ||
    err?.message ||
    "Gagal memesan nomor.";

  if (/stock|habis|no number|not available/i.test(msgErr)) reason = "STOK HABIS";
  else if (/provider/i.test(msgErr)) reason = "PROVIDER BERMASALAH";
  else if (/price|harga 0/i.test(msgErr)) reason = "HARGA TIDAK VALID (0)";
  else if (/limit|over/i.test(msgErr)) reason = "LIMIT PROVIDER";
  else reason = msgErr; // fallback

  // ==========================
  // 🔥 REFUND OTOMATIS
  // ==========================
  try {
    const saldoDataFix = JSON.parse(fs.readFileSync(saldoPath, "utf-8"));

    // Jika saldo sudah dipotong → balikin
    if ((saldoDataFix[userId] || 0) < userSaldo) {
      saldoDataFix[userId] = userSaldo;
      fs.writeFileSync(saldoPath, JSON.stringify(saldoDataFix, null, 2));

      await bot.sendMessage(
        chatId,
        `❌ *Gagal Memesan Nomor*\n` +
          `Alasan: *${reason}*\n\n` +
          `💰 *Saldo dikembalikan otomatis*\n` +
          `Saldo kembali: *Rp${userSaldo.toLocaleString("id-ID")}*`,
        { parse_mode: "HTML" }
      );
      return;
    }
  } catch (eRefund) {
    console.error("❌ Error refund otomatis:", eRefund.message);
  }

  // ==========================
  // 💬 GAGAL TANPA REFUND
  // ==========================
  await bot.sendMessage(
    chatId,
    `❌ *Gagal Memesan Nomor*\nAlasan: *${reason}*`,
    { parse_mode: "HTML" }
  );
}
}
// ==============================================
// ✅ CEK STATUS / KODE SMS — (CheckSMS Final v7 Sync RumahOTP)
// ==============================================
if (data.startsWith("checksms_")) {
  const orderId = data.split("_")[1];
  const axios = require("axios");
  const fs = require("fs");
  const apiKey = config.RUMAHOTP;
  const userId = from.id;
  const userName = from.first_name || "Anonymous";
  const username = from.username || "Anonymous";
  const ownerId = String(config.OWNER_ID);
  const channellog = config.idchannel;
  const nokosPath = "./database/nokosData.json";

  if (!global.activeOrders?.[orderId]) {
    return bot.sendMessage(chatId, `⚠️ Order ID \`${orderId}\` tidak ditemukan atau sudah dibatalkan.`, { parse_mode: "HTML" });
  }

  const cachedOrder = global.activeOrders[orderId];
  const loadingMsg = await bot.sendMessage(chatId, "📡 Mengecek status SMS OTP...", { parse_mode: "HTML" });

  try {
    const res = await axios.get(`https://www.rumahotp.com/api/v1/orders/get_status?order_id=${orderId}`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" }
    });

    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    const d = res.data?.data;
    if (!d) return bot.sendMessage(chatId, "❌ Tidak ada data status dari server RumahOTP.");

    const otp = d.otp_code && d.otp_code !== "-" ? d.otp_code : "Belum masuk";

    // Kalau OTP belum masuk
    if (otp === "Belum masuk") {
      const statusText = `
📩 STATUS TERBARU PESANAN

📱 Layanan: ${d.service}
🌍 Negara: ${d.country}
📶 Operator: ${cachedOrder.operator}

🆔 Order ID: \`${d.order_id}\`
📞 Nomor: \`${d.phone_number}\`
💰 Harga: Rp${cachedOrder.hargaTotal.toLocaleString("id-ID")}

⏱️ Status: ${d.status}
🔐 SMS Code: \`${otp}\`

Tekan tombol di bawah untuk refresh ulang.
`;
      return bot.sendMessage(chatId, statusText, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🔄 Cek Ulang OTP", callback_data: `checksms_${orderId}` }]] }
      });
    }

    // ✅ OTP SUDAH MASUK
    const now = new Date();
    const tanggal = now.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    const trxData = {
      customerName: userName,
      customerUsername: username,
      customerId: userId,
      service: d.service,
      country: d.country,
      operator: cachedOrder.operator,
      number: d.phone_number,
      otp: otp,
      price: `Rp${cachedOrder.hargaTotal.toLocaleString("id-ID")}`,
      orderId: d.order_id,
      date: tanggal
    };

    let db = [];
    if (fs.existsSync(nokosPath)) {
      try { db = JSON.parse(fs.readFileSync(nokosPath, "utf-8")); } catch { db = []; }
    }
    db.push(trxData);
    fs.writeFileSync(nokosPath, JSON.stringify(db, null, 2));

    try { await bot.deleteMessage(chatId, cachedOrder.messageId); } catch {}
    delete global.activeOrders[orderId];

    const notifText = `
<blockquote>
🎉 TRANSAKSI BERHASIL! 🎉

📱 Layanan: ${trxData.service}
🌍 Negara: ${trxData.country}
📶 Operator: ${trxData.operator}

🆔 Order ID: \`${trxData.orderId}\`
📞 Nomor: \`${trxData.number}\`
🔐 Kode OTP: \`${trxData.otp}\`
💰 Harga: ${trxData.price}

📆 Tanggal: ${trxData.date}

🟢 Status: OTP diterima & transaksi selesai

🤖 Sistem Auto 24/7
✅ Proses cepat & aman  
✅ SMS langsung masuk  
✅ Refund otomatis jika gagal
📞 Order sekarang juga!
</blockquote>
`;

    await bot.sendMessage(chatId, notifText, { parse_mode: "HTML" });

// ======================
// 📢 NOTIF KE CHANNEL & OWNER (FINAL FIX)
// ======================

// Kirim ke owner (full detail)
if (ownerId) {
  await bot.sendMessage(ownerId, `
<blockquote>🔔 Transaksi Baru:

🎉 TRANSAKSI BERHASIL! 🎉

📱 Layanan: ${trxData.service}
🌍 Negara: ${trxData.country}
📶 Operator: ${trxData.operator}

🆔 Order ID: \`${trxData.orderId}\`
📞 Nomor: \`${trxData.number}\`
🔐 Kode OTP: \`${trxData.otp}\`
💰 Harga: ${trxData.price}

📆 Tanggal: ${trxData.date}

🟢 Status: OTP diterima & transaksi selesai

👤 Pembeli:
  • Nama: ${userName}  
  • Username: @${username}  
  • ID Telegram: \`${userId}\`

🤖 Sistem Auto 24/7
✅ Proses cepat & aman  
✅ SMS langsung masuk  
✅ Refund otomatis jika gagal
📞 Order sekarang juga!</blockquote>
`, { parse_mode: "HTML" }).catch(() => {});
}

// ======================
// MASKING UNTUK CHANNEL
// ======================
if (channellog && channellog !== "" && channellog !== "0") {

  const number = trxData.number || "";
  const cleanNumber = number.replace(/\D/g, "");
  const phoneMasked =
    cleanNumber.length > 4
      ? `${cleanNumber.slice(0, 2)}*******${cleanNumber.slice(-2)}`
      : `${cleanNumber.slice(0, 1)}***`;

  const otp = trxData.otp || "";
  const cleanOtp = otp.replace(/\D/g, "");
  const otpMasked =
    cleanOtp.length > 3
      ? `${cleanOtp.slice(0, 2)}***${cleanOtp.slice(-1)}`
      : `***`;

  const chNotif = `
<blockquote>📢 Transaksi OTP Selesai

📱 Layanan: ${trxData.service}
🌍 Negara: ${trxData.country}
📶 Operator: ${trxData.operator}

🆔 Order ID: <code>${trxData.orderId}</code>
📞 Nomor: <code>+${phoneMasked}</code>
🔐 Kode OTP: <code>${otpMasked}</code>
💰 Harga: ${trxData.price}

📆 Tanggal: ${trxData.date}

👤 Pembeli: 
  • Nama: ${userName}  
  • Username: @${username}  
  • ID Telegram: <code>${userId}</code>

🤖 Sistem Auto 24/7 
✅ Proses cepat & aman  
✅ SMS langsung masuk  
✅ Refund otomatis jika gagal
📞 Order sekarang juga!</blockquote>
`;

  // Kirim ke channel — anti error
  await bot.sendMessage(channellog, chNotif, { parse_mode: "HTML" })
    .catch(err => console.error("Gagal kirim ke channel:", err.message));
}
  } catch (err) {
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    console.error("❌ Error cek OTP:", err?.response?.data || err.message);
    await bot.sendMessage(chatId, "❌ Terjadi kesalahan saat cek OTP.", { parse_mode: "HTML" });
  }
}
// ==============================================
// ❌ BATALKAN PESANAN + REFUND + WAKTU REALTIME — V12.1 FINAL FIX
// ==============================================
if (data.startsWith("cancelorder_")) {
  const orderId = data.split("_")[1];
  const axios = require("axios");
  const fs = require("fs");
  const path = require("path");

  const apiKey = config.RUMAHOTP;
  const saldoPath = path.join(__dirname, "./database/saldoOtp.json");

  const orderInfo = global.activeOrders?.[orderId];
  if (!orderInfo) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Data pesanan tidak ditemukan atau sudah kadaluarsa.*",
      { parse_mode: "HTML" }
    );
  }

  const cooldown = 5 * 60 * 1000; // 5 menit
  const cancelableAt = orderInfo.createdAt + cooldown;
  const now = Date.now();

  // 🔹 Tunda pembatalan kalau belum 5 menit
  if (now < cancelableAt) {
    // 💡 Format waktu realtime Indonesia (WIB)
    const waktuBisaCancel = new Date(cancelableAt)
      .toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(/\./g, ":");

    return bot.sendMessage(
      chatId,
      `❌ Anda belum bisa membatalkan pesanan ini.\n\n🆔 *Order ID:* \`${orderId}\`\n🕒 *Waktu Pembatalan:* ${waktuBisaCancel}\n\nSilakan tunggu hingga waktu di atas.`,
      { parse_mode: "HTML" }
    );
  }

  // 🔹 Kirim pesan loading
  const loadingMsg = await bot.sendMessage(chatId, "🗑️ Membatalkan pesanan...", {
    parse_mode: "HTML",
  });

  try {
    // 🔹 Batalkan pesanan di server RumahOTP
    const response = await axios.get(
      `https://www.rumahotp.com/api/v1/orders/set_status?order_id=${orderId}&status=cancel`,
      { headers: { "x-apikey": apiKey, Accept: "application/json" } }
    );

    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

    if (response.data?.success) {
      // ✅ Hapus pesan order utama
      if (orderInfo.messageId) {
        await bot.deleteMessage(chatId, orderInfo.messageId).catch(() => {});
      }

      // ✅ Baca saldo & refund otomatis
      let saldoData = {};
      if (fs.existsSync(saldoPath)) {
        saldoData = JSON.parse(fs.readFileSync(saldoPath));
      }

      const userId = orderInfo.userId;
      saldoData[userId] = (saldoData[userId] || 0) + orderInfo.hargaTotal;
      fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

      const saldoFormatted = `Rp${saldoData[userId].toLocaleString("id-ID")}`;
      const refundFormatted = `Rp${orderInfo.hargaTotal.toLocaleString("id-ID")}`;

      await bot.sendMessage(
        chatId,
        `✅ *Pesanan Berhasil Dibatalkan!*\n\n🆔 *Order ID:* \`${orderId}\`\n💸 *Refund:* ${refundFormatted}\n💰 *Saldo Terbaru:* ${saldoFormatted}\n\nPesanan telah dibatalkan & saldo otomatis dikembalikan.`,
        { parse_mode: "HTML" }
      );

      delete global.activeOrders[orderId];
    } else {
      await bot.sendMessage(
        chatId,
        `❌ *Gagal membatalkan pesanan!*\n🧩 ${response.data?.message || "Tidak ada pesan dari API."}`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    console.error("❌ Error cancelorder:", err?.response?.data || err.message);
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    await bot.sendMessage(chatId, "❌ Terjadi kesalahan saat membatalkan pesanan.", {
      parse_mode: "HTML",
    });
  }
}
// ===============================
// 👤 PROFILE MENU (Owner + User)
// ===============================
if (data === "profile") {
  await bot.answerCallbackQuery(callbackQuery.id, { text: "👤 Membuka profil Anda..." });

  const fs = require("fs");
  const saldoFile = "./database/saldoOtp.json";
  const apiKey = config.RUMAHOTP; // ✅ Ambil API key langsung dari config.js

  let saldoUser = 0;
  let name = from.first_name || "Tanpa Nama";
  let username = from.username ? `@${from.username}` : "Tidak ada username";
  let saldoApi = null;
  let saldoApiFormat = null;
  let apiStatus = "✅ Berhasil";

  // 🔰 Jika OWNER utama → ambil saldo dari API RumahOTP
  if (String(userId) === String(config.OWNER_ID)) {
    try {
      const response = await axios.get("https://www.rumahotp.com/api/v1/user/balance", {
        headers: {
          "x-apikey": apiKey,
          Accept: "application/json",
        },
        timeout: 20000,
      });

      if (response.data.success && response.data.data) {
        const info = response.data.data;
        saldoApi = info.balance || 0;
        saldoApiFormat = info.formated || `Rp ${saldoApi.toLocaleString("id-ID")}`;
        name = `${info.first_name} ${info.last_name}`.trim() || name;
        username = info.username ? `@${info.username}` : username;
      } else {
        apiStatus = "⚠️ Gagal (Data kosong)";
      }
    } catch (err) {
      console.error("❌ Gagal ambil saldo API RumahOTP:", err.message);
      apiStatus = "❌ Gagal koneksi API";
    }
  }

  // 👥 Semua user (termasuk owner) → ambil dari saldoOtp.json juga
  if (fs.existsSync(saldoFile)) {
    try {
      const saldoData = JSON.parse(fs.readFileSync(saldoFile));
      saldoUser = saldoData[userId] || 0;
    } catch (err) {
      console.error("Gagal baca saldoOtp.json:", err);
    }
  }

  // Format tampilan saldo
  const saldoLocalFormat = saldoUser.toLocaleString("id-ID");

  // 🧾 Template profil
  let caption = `
<blockquote>👤 OTP Saldo
━━━━━━━━━━━━━━
🆔 User ID: \`${userId}\`
👤 Name: ${name}
🔖 Username: ${username}
💰 Saldo (Lokal): Rp*${saldoLocalFormat}</blockquote>
`;

  // 🌐 Tambahkan saldo API hanya untuk OWNER utama
  if (String(userId) === String(config.OWNER_ID)) {
    caption += saldoApiFormat
      ? `🌐 Saldo (DepositOTP): ${saldoApiFormat}  \n📡 Status: ${apiStatus}\n`
      : `🌐 Saldo (DepositOTP): ⚠️ Gagal ambil saldo dari API\n📡 Status: ${apiStatus}\n`;
  }

  caption += `
━━━━━━━━━━━━━━
📞 Customer Service: [Hubungi Admin](${config.urladmin})
`;

  const options = {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Riwayat", callback_data: "riwayat_deposit" }],      
        [{ text: "📱 Menu", callback_data: "back_home" }],
      ],
    },
  };

  await bot.editMessageCaption(caption, {
    chat_id: chatId,
    message_id: message.message_id,
    ...options,
  });

  return;
}
// ===============================  
// 💰 RIWAYAT DEPOSIT USER (MAX 10 DATA)  
// ===============================  
if (data === "riwayat_deposit") {
  const fs = require("fs");
  const pathDeposit = "./database/deposit.json";
  const pathSaldo = "./database/saldoOtp.json";

  const username = from.username ? `@${from.username}` : "Tidak ada username";
  const name = from.first_name || "Tanpa Nama";
  const userId = from.id.toString();

  // Pastikan file ada
  if (!fs.existsSync(pathDeposit)) fs.writeFileSync(pathDeposit, JSON.stringify([]));
  if (!fs.existsSync(pathSaldo)) fs.writeFileSync(pathSaldo, JSON.stringify({}));

  const depositData = JSON.parse(fs.readFileSync(pathDeposit));
  const saldoData = JSON.parse(fs.readFileSync(pathSaldo));

  // ✅ Filter deposit sesuai user
  const userDeposits = depositData.filter(d => d.userId.toString() === userId);

  // ===============================
  // 💾 BATAS 10 RIWAYAT PER USER
  // ===============================
  if (userDeposits.length > 10) {
    // hapus data lama jika lebih dari 10
    const userLatest10 = userDeposits.slice(-10);
    // hapus semua data lama user dari database
    const newData = depositData.filter(d => d.userId.toString() !== userId);
    // gabungkan 10 data terakhir user dengan data user lain
    const finalData = [...newData, ...userLatest10];
    fs.writeFileSync(pathDeposit, JSON.stringify(finalData, null, 2));
  }

  // Ambil ulang data deposit setelah filter
  const updatedDeposits = JSON.parse(fs.readFileSync(pathDeposit));
  const userDepositsUpdated = updatedDeposits.filter(d => d.userId.toString() === userId);

  let caption = `📊 Riwayat Deposit\n\n`;

  if (userDepositsUpdated.length === 0) {
    caption += `Kamu belum pernah melakukan deposit.\n\n`;
  } else {
    const lastDeposits = userDepositsUpdated.slice(-10).reverse(); // 10 terakhir, terbaru di atas
    caption += `💰 Deposit Terakhir:\n`;
    for (const dep of lastDeposits) {
      let totalFormatted;
      if (dep.total === "-" || dep.total === "" || dep.total === null) {
        totalFormatted = "-";
      } else {
        totalFormatted = parseInt(dep.total).toLocaleString("id-ID");
      }

      const status = dep.status.toLowerCase().includes("success")
        ? "✅Berhasil"
        : "❌Cancelled";

      caption += `• Rp${totalFormatted} - ${status}\n`;
    }
    caption += `\n`;
  }

  const saldoUser = saldoData[userId] || 0;
  caption += `📄 Saldo Saat Ini: Rp${saldoUser.toLocaleString("id-ID")}`;

  const options = {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "⬅️ Kembali", callback_data: "profile" }],
        [{ text: "📱 Menu Utama", callback_data: "back_home" }],
      ],
    },
  };

  try {
    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: message.message_id,
      ...options,
    });
  } catch {
    await bot.sendMessage(chatId, caption, options);
  }

  return bot.answerCallbackQuery(callbackQuery.id);
}

  // 📜 Jika user klik tombol history order
  if (data === "history_orderbot") {
    const filePath = "./database/nokosData.json";
    if (!fs.existsSync(filePath)) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: "Belum ada riwayat order.", show_alert: true });
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    // Filter order berdasarkan ID user
    const userOrders = rawData.filter((item) => item.customerId === userId);

    if (userOrders.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: "Kamu belum pernah melakukan order.", show_alert: true });
    }

    // Tampilkan halaman pertama
    showOrderPage(chatId, messageId, userOrders, 1, callbackQuery.id);
  }

  // 📄 Pagination handler (misal: page_2)
  if (data.startsWith("page_")) {
    const page = parseInt(data.split("_")[1]);
const filePath = "./database/nokosData.json";
let rawData = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Pastikan dalam bentuk array
if (!Array.isArray(rawData)) {
  rawData = [rawData];
}

const userOrders = rawData.filter((item) => item.customerId === userId);

    showOrderPage(chatId, messageId, userOrders, page, callbackQuery.id);
  }
async function showOrderPage(chatId, messageId, userOrders, page, callbackId) {
  try {
    const perPage = 5;
    const totalPages = Math.ceil(userOrders.length / perPage);
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageData = userOrders.slice(start, end);

    let caption = `🧾 Riwayat Order Kamu\nHalaman ${page}/${totalPages}\n\n`;

    pageData.forEach((order, i) => {
      caption += `${start + i + 1}. ${order.service} — ${order.country}\n`;
      caption += `📞 Nomor: \`${order.number}\`\n`;
      caption += `💬 OTP: ${order.otp || "Belum ada"}\n`;
      caption += `💰 Harga: ${order.price}\n`;
      caption += `🆔 Order ID: \`${order.orderId}\`\n`;
      caption += `🗓️ Tanggal: ${order.date}\n\n`;
    });

    const buttons = [];
    if (page > 1) buttons.push({ text: "⬅️ Sebelumnya", callback_data: `page_${page - 1}` });
    if (page < totalPages) buttons.push({ text: "Berikutnya ➡️", callback_data: `page_${page + 1}` });

    // ✅ Tambahkan tombol kembali ke menu utama
    const keyboard = [
      buttons,
      [{ text: "🏠 Menu Utama", callback_data: "back_home" }],
    ].filter(b => b.length);

    await bot.editMessageCaption(caption, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });

    if (callbackId) bot.answerCallbackQuery(callbackId);
  } catch (err) {
    console.error("❌ Error showOrderPage:", err);
    bot.answerCallbackQuery(callbackId, {
      text: "Terjadi kesalahan saat menampilkan riwayat.",
      show_alert: true,
    });
  }
}
// =====================================================
// 🏆 LIST TOP USER MENU (TOP ORDER / TOP DEPOSIT / TOP SALDO)
// =====================================================
if (data === "listtop_user") {
  return bot.editMessageCaption(
    "🏆 LIST TOP USER\n\nSilakan pilih kategori:",
    {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛒 Top Order", callback_data: "top_order" }],
          [{ text: "💰 Top Deposit", callback_data: "top_depo" }],
          [{ text: "💳 Top Saldo", callback_data: "top_saldo" }],
          [{ text: "⬅️ Kembali", callback_data: "back_home" }],
        ],
      },
    }
  );
}
// ===============================
// 🛒 TOP ORDER (10 USER ORDER TERBANYAK)
// ===============================
if (data === "top_order") {
  try {
    const fs = require("fs");

    const path = "./database/nokosData.json";

    // 🔍 Cek file
    if (!fs.existsSync(path)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Data order tidak ditemukan!",
        show_alert: true,
      });
    }

    // 🔍 Baca JSON
    let raw = fs.readFileSync(path, "utf8");
    let orders = [];

    try {
      orders = JSON.parse(raw);
      if (!Array.isArray(orders)) throw new Error("Format bukan array");
    } catch (e) {
      console.log("JSON ERROR:", e);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Format JSON rusak!",
        show_alert: true,
      });
    }

    if (orders.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada data order!",
        show_alert: true,
      });
    }

    // ==========================
    // HITUNG ORDER PER USER
    // ==========================
    const count = {}; 
    const nameMap = {};

    for (const o of orders) {
      const uid = String(o.customerId);
      nameMap[uid] = o.customerName || "Tidak diketahui";

      if (!count[uid]) count[uid] = 0;
      count[uid]++;
    }

    // Convert to array → sort → ambil top 10
    const ranking = Object.entries(count)
      .sort((a, b) => b[1] - a[1]) // terbanyak
      .slice(0, 10);

    // ==========================
    // SUSUN TEKS
    // ==========================
    let text = `💳 TOP 10 USER ORDER TERBANYAK\n\n`;

    ranking.forEach((u, i) => {
      const userId = u[0];
      const totalOrder = u[1];
      const namaUser = nameMap[userId] || "Tidak diketahui";

      text += `${i + 1}. [${namaUser}](tg://user?id=${userId})\n`;
      text += `🆔 ID: \`${userId}\`\n`;
      text += `🛒 Order: ${totalOrder}x\n\n`;
    });

    // Tombol kembali
    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali", callback_data: "listtop_user" }]
        ],
      },
    };

    await bot.editMessageCaption(text, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.log("ERR TOP ORDER:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat memuat Top Order.",
      show_alert: true,
    });
  }
}
// ===============================
// 💰 TOP DEPOSIT (10 USER DEPOSIT TERBANYAK)
// ===============================
if (data === "top_depo") {
  try {
    const fs = require("fs");

    const path = "./database/deposit.json";

    // 🔍 Cek file ada
    if (!fs.existsSync(path)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Data deposit tidak ditemukan!",
        show_alert: true,
      });
    }

    // 🔍 Baca file JSON
    let raw = fs.readFileSync(path, "utf8");
    let depo = [];

    try {
      depo = JSON.parse(raw);
      if (!Array.isArray(depo)) throw new Error("Data bukan array");
    } catch (e) {
      console.log("JSON ERROR:", e);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Format JSON rusak!",
        show_alert: true,
      });
    }

    if (depo.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada data deposit!",
        show_alert: true,
      });
    }

    // 🔄 Hitung total deposit per user (SUCCESS ONLY)
    const map = {}; // key = userId

    for (let d of depo) {
      if (!d.userId) continue;
      if (d.status !== "success") continue;
      if (isNaN(d.total)) continue; // skip "-", null, dll

      const amount = Number(d.total);

      if (!map[d.userId]) {
        map[d.userId] = {
          userId: d.userId,
          username: d.username || "-",
          totalDepo: 0,
        };
      }

      map[d.userId].totalDepo += amount;
    }

    // Jika semua data tidak valid / 0
    const arr = Object.values(map);
    if (arr.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada deposit berhasil!",
        show_alert: true,
      });
    }

    // 🔽 Urutkan dari deposit terbesar
    const ranking = arr.sort((a, b) => b.totalDepo - a.totalDepo).slice(0, 10);

// 📝 Buat list text  
let text = `💰 *TOP 10 USER DEPOSIT TERBANYAK*\n\n`;  

ranking.forEach((u, i) => {

  const clickable = u.username && u.username !== "-" 
    ? `(@${u.username})`
    : "(tanpa username)";

  text += `*${i + 1}. ${u.username || "NoName"}* ${clickable}\n`;
  text += `🆔 ID: \`${u.userId}\`\n`;
  text += `💵 Total Deposit: *Rp${u.totalDepo.toLocaleString()}*\n\n`;
});

    // 🔘 Tombol kembali
    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "listtop_user" }]],
      },
    };

    // Kirim hasil
    await bot.editMessageCaption(text, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.log("ERR TOP DEPOSIT:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat memuat Top Deposit.",
      show_alert: true,
    });
  }
}
// ===============================
// 💳 TOP SALDO (10 USER SALDO TERBANYAK)
// ===============================
if (data === "top_saldo") {
  try {
    const fs = require("fs");

    const path = "./database/saldoOtp.json";

    // 🔍 Cek file
    if (!fs.existsSync(path)) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Data saldo tidak ditemukan!",
        show_alert: true,
      });
    }

    // 🔍 Baca file JSON
    let raw = fs.readFileSync(path, "utf8");
    let saldo = {};

    try {
      saldo = JSON.parse(raw);
      if (typeof saldo !== "object") throw new Error("Format bukan object");
    } catch (e) {
      console.log("JSON ERROR:", e);
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Format JSON rusak!",
        show_alert: true,
      });
    }

    const entries = Object.entries(saldo); // [ [userId, saldo], ... ]

    if (entries.length === 0) {
      return bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Belum ada data saldo!",
        show_alert: true,
      });
    }

    // 🔽 Urutkan saldo terbanyak → ambil 10
    const ranking = entries
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 10);

    // 📝 Susun teks
    let text = `💳 *TOP 10 USER SALDO TERBANYAK*\n\n`;

    // 🔍 Ambil nama user dengan getChat (jika bisa)
    for (let i = 0; i < ranking.length; i++) {
      const userId = ranking[i][0];
      const userSaldo = Number(ranking[i][1]);

      let namaUser = "Tidak diketahui";

      try {
        const info = await bot.getChat(userId);
        if (info.first_name || info.last_name) {
          namaUser = `${info.first_name || ""} ${info.last_name || ""}`.trim();
        } else if (info.username) {
          namaUser = `@${info.username}`;
        }
      } catch (e) {
        // bot belum pernah chat ketemu user → fallback
      }

      text += `*${i + 1}.* [${namaUser}](tg://user?id=${userId})\n`;
      text += `🆔 ID: \`${userId}\`\n`;
      text += `💰 Saldo: *Rp${userSaldo.toLocaleString()}*\n\n`;
    }

    // 🔘 Tombol kembali
    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali", callback_data: "listtop_user" }]
        ],
      },
    };

    // Kirim hasil
    await bot.editMessageCaption(text, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.log("ERR TOP SALDO:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat memuat Top Saldo.",
      show_alert: true,
    });
  }
}
// ===============================================

    // ========================================
// ===============================
// 🏠 PANDUAN USER (NEW MESSAGE ONLY – NO EDIT)
// ===============================
if (data === "panduan_user") {
  try {
    const fs = require("fs");
    const from = callbackQuery.from;
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const config = require("./config.js");

    // =====================================================
    // 🔹 LOAD SYSTEM REFERRAL FROM JSON (BUKAN DARI CONFIG)
    // =====================================================
    const sysPath = "./database/SystemReferral.json";
    let sys = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };

    if (fs.existsSync(sysPath)) {
      sys = JSON.parse(fs.readFileSync(sysPath));
    }

    const BONUS_REFERRAL = sys.Referral_PerUser || 0;
    const BONUS_REFERRED = sys.Referral_PerDaftar || 0;
    
const caption = `
╔═══════✨  *P A N D U A N   P E N G G U N A*  ✨═══════╗
Panduan lengkap untuk menggunakan layanan Nokos.  
Didesain agar mudah dibaca, elegan, dan rapi.
╚════════════════════════════════════════════╝

📱 *CARA ORDER NOMOR VIRTUAL*
──────────────────────────────────
1. Buka menu *📱 ORDER NOKOS*
2. Pilih aplikasi (WhatsApp, Telegram, dll)  
3. Pilih negara  
4. Pilih provider  
5. Pilih operator yang tersedia  
6. Cek harga → Konfirmasi order  
7. Tekan *Cek Kode SMS* untuk mengambil OTP

💡 *Tips Penting:*  
• Tetap berada di chat ini agar OTP tampil otomatis  
• Pilih operator yang stoknya banyak untuk hasil lebih cepat  

──────────────────────────────────

💳 *CARA DEPOSIT SALDO*
1. Klik menu *💰 DEPOSIT*
2. Pilih nominal atau input manual  
3. Scan QRIS otomatis  
4. Sistem membaca pembayaran *real-time*  
5. Jika valid → saldo langsung masuk otomatis

⚡ *Fitur deposit aktif 24 jam non-stop*

──────────────────────────────────

🎁 *SISTEM REFERRAL — RALZZNOKOS*
Dapatkan bonus hanya dengan mengundang teman!

💰 *Bonus untuk Kamu:* Rp ${BONUS_REFERRAL.toLocaleString("id-ID")}
🎁 *Bonus untuk Teman Baru:* Rp ${BONUS_REFERRED.toLocaleString("id-ID")}

*Cara Pakai:*
1. Ambil link referral dari menu *🎁 Referral*
2. Bagikan ke teman  
3. Jika teman pertama kali start bot → bonus langsung masuk

⭐ *Tanpa batas! Semakin banyak invite → semakin besar bonus.*

──────────────────────────────────

☎ *BUTUH BANTUAN?*
Hubungi Admin: *${config.urladmin}*

──────────────────────────────────
👉 *Tekan tombol di bawah untuk kembali ke menu utama.*
`;

    // 🟢 JANGAN EDIT PESAN → KIRIM PESAN BARU
    await bot.sendMessage(chatId, caption, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali", callback_data: "back_home" }],
        ],
      },
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.error("❌ PANDUAN USER ERROR:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan.",
      show_alert: true,
    });
  }
}
// ===============================
// 🏠 BACK HOME (DELETE & RESEND PHOTO VERSION)
// ===============================
if (data === "back_home") {
  try {
    const fs = require("fs");
    const from = callbackQuery.from;
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const userId = from.id;
    const username = from.username ? `@${from.username}` : "Tidak ada username";
    const name = from.first_name || "Tanpa Nama";
    const config = require("./config.js");
    
    // =====================================================
    // 🔹 LOAD SYSTEM REFERRAL FROM JSON (BUKAN DARI CONFIG)
    // =====================================================
    const sysPath = "./database/SystemReferral.json";
    let sys = { Referral_Enabled: false, Referral_PerUser: 0, Referral_PerDaftar: 0 };

    if (fs.existsSync(sysPath)) {
      sys = JSON.parse(fs.readFileSync(sysPath));
    }

    const BONUS_REFERRAL = sys.Referral_PerUser || 0;
    const BONUS_REFERRED = sys.Referral_PerDaftar || 0;    

    // Hapus pesan panduan terlebih dahulu
    try {
      await bot.deleteMessage(chatId, message.message_id);
    } catch (err) {
      console.log("Tidak bisa hapus pesan (mungkin sudah hilang):", err.message);
    }

    // Hitung total user
    const usersFile = "./users.json";
    let totalUsers = 0;

    if (fs.existsSync(usersFile)) {
      const dataUsers = JSON.parse(fs.readFileSync(usersFile));
      if (Array.isArray(dataUsers)) {
        totalUsers = dataUsers.length;
      }
    }

    const caption = `
<blockquote>🛒 𝗔𝗨𝗧𝗢𝗠𝗔𝗧𝗜𝗖 𝗢𝗥𝗗𝗘𝗥 
𝗛𝗮𝗹𝗹𝗼 ${name} ( 👋 )
𝗦𝗲𝗹𝗮𝗺𝗮𝘁 𝗱𝗮𝘁𝗮𝗻𝗴 𝗱𝗶 𝗯𝗼𝘁 𝗮𝘂𝘁𝗼 𝗼𝗿𝗱𝗲𝗿 𝗻𝗼𝗺𝗼𝗿 𝗸𝗼𝘀𝗼𝗻𝗴 𝗸𝗮𝗺𝗶.
──────── ୨୧ ──────── 

📊 𝗦𝗧𝗔𝗧𝗨𝗦 𝗔𝗞𝗨𝗡 𝗔𝗡𝗗𝗔 :
• 👤 𝗡𝗮𝗺𝗮 : ${name}  
• 🆔 𝗜𝗗 𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮 : \`${userId}\`  
• 🔗 𝗨𝘀𝗲𝗿𝗻𝗮𝗺𝗲 : ${username}  
• 👥 𝗧𝗼𝘁𝗮𝗹 𝗣𝗲𝗻𝗴𝗴𝘂𝗻𝗮 : ${totalUsers.toLocaleString("id-ID")} 𝗢𝗿𝗮𝗻𝗴

──────── ୨୧ ──────── 
</blockquote>
`;

    const options = {
      parse_mode: "HTML",
      reply_markup: {
  inline_keyboard: [
    [
      { text: "📱 𝗢𝗥𝗗𝗘𝗥", callback_data: "choose_service" }
    ],
    [
      { text: "💰 𝗗𝗘𝗣𝗢𝗦𝗜𝗧", callback_data: "topup_nokos" },
      { text: "💳 𝗖𝗘𝗞 𝗦𝗔𝗟𝗗𝗢", callback_data: "profile" }
    ],
    [     
      { text: "🛒 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗢𝗥𝗗𝗘𝗥", callback_data: "history_orderbot" },
      { text: "📊 𝗛𝗜𝗦𝗧𝗢𝗥𝗬 𝗗𝗘𝗣𝗢𝗦𝗜𝗧", callback_data: "riwayat_deposit" }
    ],
    [
      { text: "📞 𝗕𝗔𝗡𝗧𝗨𝗔𝗡 𝗖𝗦", callback_data: "contact_admin" }
    ],
  ]
},
    };

    // ⬅ Kirim ulang HOME dengan FOTO
    await bot.sendPhoto(chatId, config.ppthumb, {
      caption,
      ...options,
    });

    await bot.answerCallbackQuery(callbackQuery.id);

  } catch (err) {
    console.error("❌ BACK HOME ERROR:", err);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan saat membuka menu utama.",
      show_alert: true,
    });
  }
}

  } catch (err) {
    console.error(err);
    bot.answerCallbackQuery(callbackQuery.id, {
      text: "❌ Terjadi kesalahan.",
      show_alert: true,
    });
  }
});
// ====== FIX: ADD GLOBAL DEPOSIT LOCK ======
const depositLock = {};
// ==========================================
// ==============================================
// 💰 CALLBACK "Top Up Balance" — FINAL FIX (fee ikut QRIS)
// ==============================================
bot.on("callback_query", async (callbackQuery) => {
  const { message, data, from } = callbackQuery;
  const chatId = message.chat.id;
  const userId = from.id;
  const username = from.username || from.first_name || "TanpaNama";
  const name = from.first_name || from.last_name || username || "TanpaNama";
  const config = require("./config.js");
if (await guardAll(message)) return;

  if (data === "topup_nokos") {
    const fs = require("fs");
    const axios = require("axios");

    const API_KEY = config.RUMAHOTP;
    const OWNER_ID = config.OWNER_ID;
    const channellog = config.idchannel;

    if (!API_KEY)
      return bot.sendMessage(chatId, `⚠️ *API Key RumahOTP belum diset di config.js!*`, { parse_mode: "HTML" });

    const BASE_URL = "https://www.rumahotp.com/api/v2/deposit/create";
    const STATUS_URL = "https://www.rumahotp.com/api/v2/deposit/get_status";
    const CANCEL_URL = "https://www.rumahotp.com/api/v1/deposit/cancel";
    const PAYMENT_ID = "qris";
    const pendingPath = "./database/depositPending.json";
    const saldoPath = "./database/saldoOtp.json";
    const depositPath = "./database/deposit.json";

    // Minta nominal deposit dari user
    const promptMsg = await bot.sendMessage(
      chatId,
      `<blockquote>💳 TOP UP BALANCE\n\nMasukkan nominal deposit yang ingin kamu isi.\n\n💡 Minimal Rp 2000\nContoh: \`5000</blockquote>\``,
      { parse_mode: "HTML" }
    );

    bot.once("message", async (msg2) => {
      const amount = parseInt(msg2.text.trim());

      try {
        await bot.deleteMessage(chatId, promptMsg.message_id);
        await bot.deleteMessage(chatId, msg2.message_id);
      } catch {}

      if (isNaN(amount) || amount < 2000) {
        return bot.sendMessage(chatId, `<blockquote>🚫 Minimal deposit Rp 2000!</blockquote>`, { parse_mode: "HTML" });
      }

      const frames = [
        "🔄 Membuat QRIS [▰▱▱▱▱]",
        "🔄 Membuat QRIS [▰▰▱▱▱]",
        "🔄 Membuat QRIS [▰▰▰▱▱]",
        "🔄 Membuat QRIS [▰▰▰▰▱]",
        "🔄 Membuat QRIS [▰▰▰▰▰]",
        "💫 Menyiapkan QR Code...",
        "⚙️ Menghubungkan server...",
        "✅ Hampir selesai...",
      ];
      let f = 0;
      const loadingMsg = await bot.sendMessage(chatId, frames[f], { parse_mode: "HTML" });
      const loadingInterval = setInterval(async () => {
        f = (f + 1) % frames.length;
        try {
          await bot.editMessageText(frames[f], {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            parse_mode: "HTML",
          });
        } catch {}
      }, 600);

      try {
        if (!fs.existsSync(pendingPath)) fs.writeFileSync(pendingPath, JSON.stringify({}));
        if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}));
        if (!fs.existsSync(depositPath)) fs.writeFileSync(depositPath, JSON.stringify([]));

        const pendingData = JSON.parse(fs.readFileSync(pendingPath));
        const saldoData = JSON.parse(fs.readFileSync(saldoPath));
        const depositData = JSON.parse(fs.readFileSync(depositPath));

        if (!pendingData[userId]) pendingData[userId] = [];
        pendingData[userId] = pendingData[userId].filter((d) => Date.now() < d.expired_at_ts);

        if (pendingData[userId].length > 0) {
          clearInterval(loadingInterval);
          try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}

          let aktifList = pendingData[userId]
            .map((x, i) => `#${i + 1} • ID: \`${x.id}\` • Rp${x.total.toLocaleString("id-ID")}`)
            .join("\n");

          return bot.sendMessage(
            chatId,
            `<blockquote>🚫 Kamu masih punya pembayaran QRIS yang belum selesai!*\n\n${aktifList}\n\n❗ Selesaikan atau batalkan dulu sebelum membuat QRIS baru.</blockquote>`,
            { parse_mode: "HTML" }
          );
        }

        // ==== FIX START ====
        const UNTUNG = config.UNTUNG_DEPOSIT || 0; // misal 500
        const totalRequest = amount + UNTUNG;

        // Buat QRIS dengan totalRequest (sudah termasuk fee)
        const response = await axios.get(`${BASE_URL}?amount=${totalRequest}&payment_id=${PAYMENT_ID}`, {
          headers: { "x-apikey": API_KEY, Accept: "application/json" },
        });
        // ==== FIX END ====

        const data = response.data;
        if (!data.success) {
          clearInterval(loadingInterval);
          try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}
          return bot.sendMessage(chatId, `<blockquote>❌ Gagal membuat QRIS. Coba lagi nanti.</blockquote>`, { parse_mode: "HTML" });
        }

        const d = data.data;
const diterima = amount; // saldo masuk tetap sesuai input user
const totalBaru = d.total; // nominal QRIS final dari API
const feeAkhir = totalBaru - diterima; // FEE ADMIN FIX

        const waktuBuat = new Date(d.created_at_ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        const waktuExp = new Date(d.expired_at_ts).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

        const caption = `
<blockquote>🏦 PEMBAYARAN DEPOSIT OTP
━━━━━━━━━━━━━━━━━━
🧾 ID Pembayaran: \`${d.id}\`
👤 User: @${username}
💰 Nominal: Rp${totalBaru.toLocaleString("id-ID")}
💵 Biaya Admin: Rp${feeAkhir.toLocaleString("id-ID")}
📥 Diterima: Rp${diterima.toLocaleString("id-ID")}

🕒 Dibuat: ${waktuBuat}
⏳ Kedaluwarsa: ${waktuExp}

📸 Scan QRIS untuk membayar!
🔁 Auto cek status setiap 5 detik.
🕔 Akan dibatalkan otomatis jika tidak dibayar dalam 5 menit.</blockquote>
`;

        clearInterval(loadingInterval);
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}

        const sentMsg = await bot.sendPhoto(chatId, d.qr_image, {
          caption,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "❌ Batalkan Pembayaran", callback_data: `bataldeposit_${d.id}_${userId}` }]],
          },
        });

// SIMPAN ID PESAN QRIS UNTUK DELETE SAAT EXPIRED
pendingData[userId].push({
    id: d.id,
    total: totalBaru,
    status: d.status,
    expired_at_ts: d.expired_at_ts,
    message_id: sentMsg.message_id,   // <===== TAMBAHAN BARU
});
fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));

        // AUTO CANCEL 5 MENIT
const autoCancelTimer = setTimeout(async () => {
  try {
    const cancelRes = await axios.get(`${CANCEL_URL}?deposit_id=${d.id}`, { headers: { "x-apikey": API_KEY } });
    if (cancelRes.data.success) {

      // 🔥 AUTO DELETE MESSAGE QRIS
      try {
        const pendingUser = pendingData[userId].find(x => x.id === d.id);
        if (pendingUser && pendingUser.message_id) {
          await bot.deleteMessage(chatId, pendingUser.message_id);
        }
      } catch (e) {}

      await bot.sendMessage(
        chatId,
        `<blockquote>❌ PEMBAYARAN DIBATALKAN OTOMATIS (5 MENIT)*\n━━━━━━━━━━━━━━━━━━\n🧾 ID Transaksi: \`${d.id}\`\n💰 Nominal: Rp${totalBaru.toLocaleString("id-ID")}\n📆 Status: Cancelled</blockquote>`,
        { parse_mode: "HTML" }
      );

depositData.push({
    id: d.id,
    userId,
    name,
    username,
    total: totalBaru,
    diterima: 0,
    fee: feeAkhir,
    status: "cancelled (auto)",
    tanggal: new Date().toISOString(),
    metode: checkRes.data.data.brand_name,
});
      fs.writeFileSync(depositPath, JSON.stringify(depositData, null, 2));

      pendingData[userId] = pendingData[userId].filter((x) => x.id !== d.id);
      fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));

      clearInterval(checkInterval);
    }
  } catch (err) {
    console.error("Auto-cancel error:", err.message);
  }
}, 5 * 60 * 1000);

        // AUTO CHECK STATUS
        const checkInterval = setInterval(async () => {
          try {
            const checkRes = await axios.get(`${STATUS_URL}?deposit_id=${d.id}`, { headers: { "x-apikey": API_KEY } });
            if (checkRes.data.success) {
              const s = checkRes.data.data.status;
if (s === "success") {

    // ======== ANTI DOUBLE EXEC FIX ========
    if (depositLock[d.id]) return;
    depositLock[d.id] = true;
    // ======================================

    clearInterval(checkInterval);
    clearTimeout(autoCancelTimer);
    try { await bot.deleteMessage(chatId, sentMsg.message_id); } catch {}

    saldoData[userId] = (saldoData[userId] || 0) + diterima;
    fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

    const waktuSukses = new Date(checkRes.data.data.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    const successMsg = `
<blockquote>💰 DEPOSIT OTP BERHASIL!

🧾 ID Pembayaran: <code>${checkRes.data.data.id}</code>
👤 User: @${username} (<code>${userId}</code>)
💰 Nominal: Rp${totalBaru.toLocaleString("id-ID")}
💵 Biaya Admin: Rp${feeAkhir.toLocaleString("id-ID")}
📥 Diterima: Rp${diterima.toLocaleString("id-ID")}
🏷️ Metode: ${checkRes.data.data.brand_name}
📆 Tanggal: ${waktuSukses}

💳 Saldo kamu telah ditambah Rp${diterima.toLocaleString("id-ID")} secara otomatis!
💰 Saldo Saat Ini: Rp${saldoData[userId].toLocaleString("id-ID")}</blockquote>
`;

    await bot.sendMessage(chatId, successMsg, { parse_mode: "HTML" });

    depositData.push({
        id: checkRes.data.data.id,
        userId,
        name,
        username,
        total: totalBaru,
        diterima,
        fee: feeAkhir,
        status: "success",
        tanggal: new Date().toISOString(),
        metode: checkRes.data.data.brand_name,
    });
    fs.writeFileSync(depositPath, JSON.stringify(depositData, null, 2));

    if (channellog) await bot.sendMessage(channellog, successMsg, { parse_mode: "HTML" });
    if (OWNER_ID) await bot.sendMessage(OWNER_ID, successMsg, { parse_mode: "HTML" });

    pendingData[userId] = pendingData[userId].filter((x) => x.id !== d.id);
    fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));

    delete depositLock[d.id]; // HAPUS LOCK
}
            }
          } catch (err) {
            console.error(`Gagal cek status deposit ${d.id}:`, err.message);
          }
        }, 5000);

      } catch (err) {
        clearInterval(loadingInterval);
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch {}
        console.error(err);
        return bot.sendMessage(chatId, `⚠️ Terjadi kesalahan saat membuat QRIS.\n\nDetail: ${err.message}`, { parse_mode: "HTML" });
      }
    });
  }
});
// ==============================================
// 🧾 HANDLE BUTTON "BATAL PEMBAYARAN"
// ==============================================
bot.on("callback_query", async (cb) => {
  try {
    const data = cb.data;
    if (!data.startsWith("bataldeposit_")) return;

    const fs = require("fs");
    const axios = require("axios");
    const config = require("./config.js");

    const [_, depositId, uid] = data.split("_");
    const userId = cb.from.id.toString();
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;

    if (userId !== uid) {
      return bot.answerCallbackQuery(cb.id, {
        text: "❌ Kamu tidak bisa membatalkan deposit orang lain!",
        show_alert: true
      });
    }

    const API_KEY = config.RUMAHOTP;
    const CANCEL_URL = "https://www.rumahotp.com/api/v1/deposit/cancel";
    const pendingPath = "./database/depositPending.json";
    const depositPath = "./database/deposit.json";

    if (!fs.existsSync(depositPath)) fs.writeFileSync(depositPath, JSON.stringify([]));
    if (!fs.existsSync(pendingPath)) fs.writeFileSync(pendingPath, JSON.stringify({}));

    const depositData = JSON.parse(fs.readFileSync(depositPath));
    const pendingData = JSON.parse(fs.readFileSync(pendingPath));

    // 🟩 Cari data pending untuk ambil total aslinya
    let totalNominal = 0;
    if (pendingData[userId]) {
      const found = pendingData[userId].find(x => x.id === depositId);
      if (found) totalNominal = found.total || 0;
    }

    // Batalkan di API RumahOTP
    const cancelRes = await axios.get(`${CANCEL_URL}?deposit_id=${depositId}`, {
      headers: { "x-apikey": API_KEY }
    });

    if (cancelRes.data.success) {
      // Hapus dari pending
      if (pendingData[userId]) {
        pendingData[userId] = pendingData[userId].filter(x => x.id !== depositId);
        fs.writeFileSync(pendingPath, JSON.stringify(pendingData, null, 2));
      }

      try { await bot.deleteMessage(chatId, msgId); } catch {}

      await bot.sendMessage(chatId, `
<blockquote>❌ Pembayaran Dibatalkan!
━━━━━━━━━━━━━━━━━━
🧾 ID Transaksi: <code>${depositId}</code>
👤 User: [${cb.from.first_name}](tg://user?id=${userId})
💰 Nominal: Rp${totalNominal.toLocaleString('id-ID')}
💬 Status: Cancelled oleh pengguna</blockquote>
`, { parse_mode: "HTML" });

depositData.push({
  id: depositId,
  userId,
  name: cb.from.first_name || "Unknown",
  username: cb.from.username || cb.from.first_name || "TanpaUsername",
  total: totalNominal,
  status: "cancelled",
  tanggal: new Date().toISOString(),
  metode: cancelRes.data.data?.brand_name || "QRIS",
});
      fs.writeFileSync(depositPath, JSON.stringify(depositData, null, 2));

      await bot.answerCallbackQuery(cb.id, {
        text: "✅ Pembayaran berhasil dibatalkan.",
        show_alert: false
      });

    } else {
      await bot.answerCallbackQuery(cb.id, {
        text: "⚠️ Gagal membatalkan! Mungkin sudah dibayar atau expired.",
        show_alert: true
      });
    }

  } catch (err) {
    console.error("Error bataldeposit:", err.message);
    await bot.answerCallbackQuery(cb.id, {
      text: "❌ Terjadi kesalahan internal.",
      show_alert: true
    });
  }
});
// ==============================================
// 🛒 /listh2h — Cari Produk H2H RumahOTP (Pagination)
// ==============================================
bot.onText(/^\/listh2h(?:@[\w_]+)?\s*(.*)?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const keyword = (match[1] || "").toLowerCase().trim();

    const axios = require("axios");
    const config = require("./config.js");
        const userId = msg.from.id.toString();
        if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 Akses ditolak!\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

    if (!keyword)
        return bot.sendMessage(chatId,
`❗ Cara pakai:
Gunakan perintah:
\`/listh2h <kata kunci>\`

Contoh:
• /listh2h dana  
• /listh2h ff  
• /listh2h mlbb 86  
• /listh2h pulsa`,
        { parse_mode: "HTML" }
    );

try {
    const res = await axios.get("https://www.rumahotp.com/api/v1/h2h/product", {
        headers: { "x-apikey": config.RUMAHOTP }
    });

    let list = res.data.data || [];

    // 🔥 Urutkan harga termurah → termahal
    list = list.sort((a, b) => a.price - b.price);

    const result = list.filter(p =>
        p.name.toLowerCase().includes(keyword) ||
        p.brand.toLowerCase().includes(keyword) ||
        p.note.toLowerCase().includes(keyword) ||
        p.code.toLowerCase().includes(keyword)
    );

    if (result.length === 0)
        return bot.sendMessage(chatId, `⚠️ Tidak ada produk ditemukan untuk kata kunci *${keyword}*`, { parse_mode: "HTML" });

    // simpan data ke memory
    const pageSize = 5;
    const totalPages = Math.ceil(result.length / pageSize);

    const state = {
        keyword,
        result,
        pageSize,
        totalPages
    };

    global.h2hPages = global.h2hPages || {};
    global.h2hPages[chatId] = state;

    sendH2HPage(bot, chatId, 1);

} catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Terjadi kesalahan saat mengambil produk.");
}
});

// ==============================================
// FUNGSI KIRIM HALAMAN (EDIT MESSAGE)
// ==============================================
function sendH2HPage(bot, chatId, page, messageId = null) {
    const data = global.h2hPages?.[chatId];
    if (!data) return;

    const { keyword, result, pageSize, totalPages } = data;

    const start = (page - 1) * pageSize;
    const sliced = result.slice(start, start + pageSize);

    let text = `📦 *Hasil Pencarian Produk H2H*\n`;
    text += `🔍 Kata kunci: *${keyword}*\n`;
    text += `📊 Total ditemukan: *${result.length}*\n`;
    text += `📄 Halaman: *${page}/${totalPages}*\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;

    for (const p of sliced) {
        text += `
💠 *${p.name}*
🧩 Code: \`${p.code}\`
🏷️ Brand: *${p.brand}*
📂 Kategori: *${p.category}*
💬 Note: ${p.note}
💰 Harga: Rp${p.price.toLocaleString("id-ID")}
━━━━━━━━━━━━━━`;
    }

    const buttons = [];
    if (page > 1) buttons.push({ text: "⬅️ Prev", callback_data: `h2h_prev_${page}` });
    if (page < totalPages) buttons.push({ text: "➡️ Next", callback_data: `h2h_next_${page}` });

    const options = {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [buttons] }
    };

    // Jika pertama kali → sendMessage
    if (!messageId) {
        bot.sendMessage(chatId, text, options);
    } else {
        // Jika next/prev → editMessageText
        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [buttons] }
        }).catch(err => console.log("Edit error:", err.message));
    }
}

// ==============================================
// CALLBACK NEXT & PREV (EDIT MODE)
// ==============================================
bot.on("callback_query", (cb) => {
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    if (data.startsWith("h2h_next_")) {
        let page = Number(data.split("_")[2]);
        sendH2HPage(bot, chatId, page + 1, messageId);
        bot.answerCallbackQuery(cb.id);
    }

    if (data.startsWith("h2h_prev_")) {
        let page = Number(data.split("_")[2]);
        sendH2HPage(bot, chatId, page - 1, messageId);
        bot.answerCallbackQuery(cb.id);
    }
});
// ==============================================
// 💳 /orderh2h <kode> <target> + AUTO STATUS CHECK
// ==============================================
bot.onText(/^\/orderh2h(?:@[\w_]+)?(?:\s+(\S+)\s+(\S+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const code = match[1];
    const target = match[2];
    const userId = msg.from.id.toString();

    const axios = require("axios");
    const config = require("./config.js");

    if (await guardAll(msg)) return;


    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }
    
    // ❗ Jika tanpa argumen → kasih tutorial
    if (!code || !target) {
        return bot.sendMessage(
            chatId,
`❗ *Format salah!*

Gunakan perintah:
*/orderh2h <kode> <target>*

Contoh:
\`/orderh2h pln 1234567890\`
\`/orderh2h pulsa 08951234xxxx\`

📌 *kode* = kode produk (cek daftar produk)
📌 *target* = nomor / tujuan pembelian

Silakan coba lagi.`,
            { parse_mode: "HTML" }
        );
    }

    const loading = await bot.sendMessage(chatId, "⏳ *Memproses transaksi...*", {
        parse_mode: "HTML"
    });

    try {
        // 🔥 Buat transaksi
        const url = `https://www.rumahotp.com/api/v1/h2h/transaksi/create?id=${code}&target=${target}`;
        const res = await axios.get(url, {
            headers: {
                "x-apikey": config.RUMAHOTP,
                "Accept": "application/json"
            }
        });

        if (!res.data.success) {
            return bot.editMessageText(
                `❌ *Transaksi gagal!*\nPesan: ${res.data.message || "Tidak diketahui."}`,
                { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
            );
        }

        const d = res.data.data;

        // ======================
        // 🟦 TEXT HASIL PEMBUATAN ORDER
        // ======================
        const initialText = 
`✅ *Transaksi Berhasil Dibuat!*

🛒 *Produk:* ${d.product?.name || "-"}
🏷️ Brand: ${d.product?.brand || "-"}
🧩 Code: \`${d.product?.code || "-"}\`
📂 Kategori: ${d.product?.category || "-"}

🎯 *Tujuan:* ${d.tujuan}

📌 *Status Awal:* ${d.status}
🆔 *ID Transaksi:* \`${d.id}\`

⏳ *Sedang memantau status transaksi...*`;

        await bot.editMessageText(initialText, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "HTML"
        });

        // ==========================================
        // 🔥 AUTO CHECK STATUS TIAP 5 DETIK
        // ==========================================
        const orderId = d.id;

        const interval = setInterval(async () => {
            try {
                const statusURL = `https://www.rumahotp.com/api/v1/h2h/transaksi/status?transaksi_id=${orderId}`;

                const s = await axios.get(statusURL, {
                    headers: {
                        "x-apikey": config.RUMAHOTP,
                        "Accept": "application/json"
                    }
                });

                if (!s.data.success) return;

                const st = s.data.data;

                // ======================
                // 🟨 Jika masih proses
                // ======================
                if (st.status === "processing") {
                    return bot.editMessageText(
`⏳ *Transaksi Diproses...*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *processing*

⏳ Sistem sedang menunggu respon provider...`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                    );
                }

                // ======================
                // 🟩 Jika sukses
                // ======================
                if (st.status === "success") {
                    clearInterval(interval);

                    return bot.editMessageText(
`🎉 *TRANSAKSI BERHASIL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *SUCCESS*

🧾 Produk: ${st.product?.name}
🏷 Brand: ${st.product?.brand}
💰 Harga: Rp${st.price.toLocaleString("id-ID")}

🔐 *SN:* \`${st.response?.sn || "-"}\`

🕒 Waktu Provider: ${st.response?.time || "-"}

✅ Transaksi telah selesai.`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                    );
                }

                // ======================
                // 🟥 Jika gagal
                // ======================
                if (st.status === "failed" || st.status === "canceled") {
                    clearInterval(interval);

                    return bot.editMessageText(
`❌ *TRANSAKSI GAGAL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}

📦 Status: *${st.status.toUpperCase()}*
💬 Provider Message: ${st.response?.status || "-"}

🔁 Refund: ${st.refund ? "✔️ Iya" : "❌ Tidak"}`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                    );
                }

            } catch (e) {
                console.log("ERROR AUTO CHECK:", e);
            }

        }, 5000); // ⏳ cek status tiap 5 detik

    } catch (err) {
        console.error("ORDER H2H ERROR:", err);
        bot.editMessageText(`❌ Terjadi kesalahan saat memproses transaksi.`, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "HTML"
        });
    }
});
// ==============================================
// 💳 /cairkan <nominal>  — AUTO MAP + AUTO STATUS CHECK
// ==============================================
bot.onText(/^\/cairkan(?:@[\w_]+)?(?:\s+(\S+))?(?:\s+(\S+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const code = match[1] ? match[1].trim() : null;
    const target = match[2] ? match[2].trim() : null;

    const axios = require("axios");
    const config = require("./config.js");

    const userId = msg.from.id.toString();
    if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

    // ==============================================
    // ❗ Jika tanpa argumen → TAMPILKAN TUTORIAL
    // ==============================================
    if (!code) {
        return bot.sendMessage(
            chatId,
`❗ *Format salah!*

Gunakan perintah:
*/cairkan <nominal>*

Contoh:
\`/cairkan 2000\`
\`/cairkan 5000\`
\`/cairkan 10000\`

📌 *nominal* = nominal pencairan yang akan dilakukan ke e-wallet (otomatis ke nomor di config).`,
            { parse_mode: "HTML" }
        );
    }

    // ==============================================
    // Jika hanya 1 argumen → tetap anggap user cuma input nominal, beri tutorial
    // ==============================================
    if (code && !target && isNaN(code)) {
        return bot.sendMessage(
            chatId,
`❗ *Format salah!*

Untuk input manual:
\`/cairkan <kode_produk> <nomor_tujuan>\`

Contoh:
\`/cairkan D1 081234xxxxxx\`

Untuk input berdasarkan nominal:
\`/cairkan 2000\` (otomatis ke nomor pencairan di config)`,
            { parse_mode: "HTML" }
        );
    }

    const loading = await bot.sendMessage(chatId, "⏳ *Memproses transaksi...*", {
        parse_mode: "HTML"
    });

    try {

        // ==============================================
        // AUTO MAP NOMINAL → CODE DARI CONFIG
        // ==============================================
        let finalCode = code;
        let finalTarget = target;

        // Hanya angka = user minta nominal
        if (!isNaN(code)) {

            // ==============================================
            // ❌ VALIDASI KELIPATAN 1000
            // ==============================================
            const nominalUser = Number(code);
            if (nominalUser % 1000 !== 0) {
                return bot.editMessageText(
                    `❌ Nominal *${code}* tidak valid!\nNominal harus kelipatan *1000*.\n\nContoh valid:\n• 1000\n• 2000\n• 5000\n• 10000`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                );
            }

            // Mapping prefix H2H sesuai layanan
            const prefixMap = {
                dana: "D",
                gopay: "GPY",
                ovo: "OVO",
                shopeepay: "SHOPE",
                linkaja: "LINK"
            };

            const ewallet = config.type_ewallet_RUMAHOTP?.toLowerCase();
            const prefix = prefixMap[ewallet];

            if (!prefix) {
                return bot.editMessageText(
                    `❌ Prefix untuk ewallet *${config.type_ewallet_RUMAHOTP}* tidak ditemukan!`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                );
            }

            const productRes = await axios.get("https://www.rumahotp.com/api/v1/h2h/product", {
                headers: { "x-apikey": config.RUMAHOTP }
            });

            const all = productRes.data.data || [];

            // Filter produk sesuai prefix ewallet
            const filtered = all.filter(x => x.code.startsWith(prefix));

            // Cari produk berdasarkan angka murni (2000, 5000, dst)
            const found = filtered.find(x => {
                const angkaName = Number(String(x.name).replace(/\D/g, ""));
                const angkaNote = Number(String(x.note).replace(/\D/g, ""));
                return angkaName === nominalUser || angkaNote === nominalUser;
            });

            if (!found) {
                return bot.editMessageText(
                    `❌ Produk dengan nominal *${code}* tidak ditemukan untuk *${config.type_ewallet_RUMAHOTP}*`,
                    { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                );
            }

            finalCode = found.code; 
            finalTarget = config.nomor_pencairan_RUMAHOTP;
        }

        // Jika user manual input: /orderh2h D1 0812…
        if (!finalTarget) {
            return bot.editMessageText(
                "⚠️ Format salah!\nContoh:\n• /orderh2h 2000\n• /orderh2h D1 08123xxxx",
                { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
            );
        }

        // ==============================================
        // 🔥 CREATE TRANSAKSI
        // ==============================================
        const url = `https://www.rumahotp.com/api/v1/h2h/transaksi/create?id=${finalCode}&target=${finalTarget}`;
        const res = await axios.get(url, {
            headers: {
                "x-apikey": config.RUMAHOTP,
                "Accept": "application/json"
            }
        });

        if (!res.data.success) {
            return bot.editMessageText(
                `❌ *Transaksi gagal!*\nPesan: ${res.data.message || "Tidak diketahui."}`,
                { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
            );
        }

        const d = res.data.data;

        const initialText =
`✅ *Transaksi Berhasil Dibuat!*

🛒 *Produk:* ${d.product?.name || "-"}
🏷️ Brand: ${d.product?.brand || "-"}
🧩 Code: \`${d.product?.code || "-"}\`
📂 Kategori: ${d.product?.category || "-"}

🎯 *Tujuan:* ${d.tujuan}

📌 *Status Awal:* ${d.status}
🆔 *ID Transaksi:* \`${d.id}\`

⏳ *Sedang memantau status transaksi...*`;

        await bot.editMessageText(initialText, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "HTML"
        });

        // ==============================================
        // 🔥 AUTO CHECK STATUS TIAP 5 DETIK
        // ==============================================
        const orderId = d.id;

        const interval = setInterval(async () => {
            try {
                const s = await axios.get(
                    `https://www.rumahotp.com/api/v1/h2h/transaksi/status?transaksi_id=${orderId}`,
                    {
                        headers: {
                            "x-apikey": config.RUMAHOTP,
                            "Accept": "application/json"
                        }
                    }
                );

                if (!s.data.success) return;

                const st = s.data.data;

                if (st.status === "processing") {
                    return bot.editMessageText(
`⏳ *Transaksi Diproses...*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *processing*

⏳ Menunggu respon provider...`,
                        { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                    );
                }

                if (st.status === "success") {
                    clearInterval(interval);

                    return bot.editMessageText(
`🎉 *TRANSAKSI BERHASIL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}
📦 Status: *SUCCESS*

🧾 Produk: ${st.product?.name}
🏷 Brand: ${st.product?.brand}
💰 Harga: Rp${st.price.toLocaleString("id-ID")}

🔐 *SN:* \`${st.response?.sn || "-"}\`
🕒 Waktu Provider: ${st.response?.time || "-"}

✅ Transaksi selesai.`,
                        { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                    );
                }

                if (st.status === "failed" || st.status === "canceled") {
                    clearInterval(interval);

                    return bot.editMessageText(
`❌ *TRANSAKSI GAGAL!*

🆔 ID: \`${st.id}\`
🎯 Tujuan: ${st.tujuan}

📦 Status: *${st.status.toUpperCase()}*
💬 Pesan Provider: ${st.response?.status || "-"}

🔁 Refund: ${st.refund ? "✔️ Iya" : "❌ Tidak"}`,
                        { chat_id: chatId, message_id: loading.message_id, parse_mode: "HTML" }
                    );
                }

            } catch (e) {
                console.log("ERROR AUTO CHECK:", e);
            }

        }, 5000);

    } catch (err) {
        console.error("ORDER H2H ERROR:", err);
        bot.editMessageText(`❌ Terjadi kesalahan saat memproses transaksi.`, {
            chat_id: chatId,
            message_id: loading.message_id,
            parse_mode: "HTML"
        });
    }
});
// ====================================================
// 🧾 COMMANDS — BOT.ONTEXT
// ====================================================
bot.onText(/^\/ownermenu$/i, async (msg) => {
  try {
    if (await guardAll(msg)) return;

    const userId = msg.from.id.toString();
    const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
    const username = msg.from.username || null;
    const name = msg.from.first_name || "pengguna";

    // === Pesan /ownermenu ===
    const caption = `<blockquote>( 🍁 ) Auto Order - Botz 🛒</blockquote>
─「 🛒 」olá, @${username} 👋
Sono Uno Script Telegram Automatizzare Gli Ordini.

( 🍁 ) 「 Bot - Information 🛒 」
☇ Bot Name : ${config.botName}
☇ Version : ${config.version}
☇ Author : ${config.authorName}
☇ Framework : Node - Telegram - Bot - Api
☇ Runtime : ${getRuntime()}

<blockquote><b>─「 📜 」Owner ☇ Menu ─</b></blockquote>
𖥔 /setreferral — Settings Referral Bonus
𖥔 /self — Set Bot To Self Mode
𖥔 /public — Set Bot To Public Mode
𖥔 /joinch — Set Required Join Channel
𖥔 /cooldown — Set Global Cooldown
𖥔 /grouponly — Lock Commands To Group Only
𖥔 /maintenance — Set Bot To Maintenance
𖥔 /bluser — Add User To Blacklist
𖥔 /unbluser — Remove User From Blacklist
𖥔 /broadcast — Kirim pesan ke semua pengguna yang terdaftar
𖥔 /addsaldo — Menambahkan saldo ke akun pengguna
𖥔 /delsaldo — Mengurangi saldo dari akun pengguna
𖥔 /listsaldo — Melihat saldo dari semua akun pengguna bot

<blockquote>#- Ralzz - AutoOrder¡ 🛒</blockquote>`;

    // === Inline Keyboard ===
    const buttons = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "CS ☇ Limit", callback_data: "contact_admin" }],
          [{ text: "⌦ ∂єνєℓσρєя ⌫", url: urladmin }],
        ],
      },
      parse_mode: "HTML",
    };

    // === Kirim foto dengan caption + tombol ===
    await bot.sendPhoto(msg.chat.id, config.ppthumb, {
      caption,
      ...buttons,
    });

    // ====================================================
    // 🗑️ BAGIAN NOTIF OWNER DIHAPUS SEPENUHNYA
    // ====================================================

  } catch (err) {
    logError(err, "/ownermenu");
  }
});

// =====================
// CALLBACK QUERY
// =====================
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;
  const isPrivate = cb.message.chat.type === 'private';
  const userId = cb.from.id;
    if (await guardAll(cb)) return;  

  if (data === 'contact_admin') {
    if (!isPrivate) return bot.answerCallbackQuery(cb.id, { text: '❌ Hanya bisa di private chat!', show_alert: true });
    if (String(userId) === String(config.OWNER_ID)) return bot.sendMessage(chatId, '🧠 Kamu owner, tidak bisa kontak diri sendiri!', { parse_mode: 'HTML' });

    // Aktifkan session user
    contactSession[userId] = true;
    if (terminatedSession[userId]) delete terminatedSession[userId];
    saveSession();

    return bot.sendMessage(chatId, '📨 Silakan kirim pesan ke admin.\nKetik *batal* untuk membatalkan.', { parse_mode: 'HTML' });
  }
});

// =====================
// HANDLE MESSAGE
// =====================
bot.on('message', async (msg) => {
  const userId = msg.from.id;
  const isPM = msg.chat.type === 'private';
  const isOwner = String(userId) === String(config.OWNER_ID);
  const replyTo = msg.reply_to_message;
  const text = msg.text?.trim();
  const caption = msg.caption || '';
      if (await guardAll(msg)) return;

  // Blok pesan jika session sudah batal
  if (terminatedSession[userId] && !contactSession[userId]) return;

  // Owner membalas user
  if (isOwner && replyTo && forwardedMap[replyTo.message_id]) {
    const targetUserId = forwardedMap[replyTo.message_id];
    if (terminatedSession[targetUserId]) return; // silent jika user batal

    if (text?.toLowerCase() === 'batal') {
      delete contactSession[targetUserId];
      delete forwardedMap[replyTo.message_id];
      terminatedSession[targetUserId] = true;
      saveSession();
      await bot.sendMessage(config.OWNER_ID, `✅ Sesi dengan user <code>${targetUserId}</code> dibatalkan.`, { parse_mode: 'HTML' });
      await bot.sendMessage(targetUserId, '❌ Sesi chat dibatalkan oleh Admin. Klik 📞 untuk mulai lagi.');
      return;
    }

    // Kirim balasan owner
    try {
      if (text) await bot.sendMessage(targetUserId, `📬 <b>Balasan dari Admin:</b>\n\n${text}`, { parse_mode: 'HTML' });
      else if (msg.document) await bot.sendDocument(targetUserId, msg.document.file_id, { caption: `📦 <b>File dari Admin</b>\n<code>${msg.document.file_name}</code>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.photo) await bot.sendPhoto(targetUserId, msg.photo.pop().file_id, { caption: `🖼️ <b>Foto dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.voice) await bot.sendVoice(targetUserId, msg.voice.file_id, { caption: `🎙️ <b>Voice dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.video) await bot.sendVideo(targetUserId, msg.video.file_id, { caption: `🎥 <b>Video dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });
      else if (msg.audio) await bot.sendAudio(targetUserId, msg.audio.file_id, { caption: `🎵 <b>Audio dari Admin</b>\n📝 ${caption}`, parse_mode: 'HTML' });

      await bot.sendMessage(config.OWNER_ID, '✅ Balasan berhasil dikirim.');
    } catch { /* silent jika gagal */ }
    return;
  }

  // User mengirim pesan ke admin
  if (isPM && contactSession[userId]) {
    if (text?.toLowerCase() === 'batal') {
      delete contactSession[userId];
      terminatedSession[userId] = true;
      saveSession();

      await bot.sendMessage(userId, '✅ Sesi chat dibatalkan. Tekan 📞 Contact Admin untuk mulai lagi.');
      await bot.sendMessage(config.OWNER_ID, `❌ Sesi chat dengan <code>${userId}</code> dibatalkan oleh user.`, { parse_mode: 'HTML' });
      return;
    }

    const info = `🆔 <code>${userId}</code>\n👤 <b>${msg.from.first_name}</b>\n🔗 @${msg.from.username || '-'}`;

    // Forward pesan ke owner
    if (text) {
      const fwd = await bot.sendMessage(config.OWNER_ID, `<b>Pesan dari User</b>\n\n${info}\n💬:\n<pre>${text}</pre>`, { parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.document) {
      const fwd = await bot.sendDocument(config.OWNER_ID, msg.document.file_id, { caption: `📎 File dari User\n${info}\n📄 <code>${msg.document.file_name}</code>\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.photo) {
      const fwd = await bot.sendPhoto(config.OWNER_ID, msg.photo.pop().file_id, { caption: `🖼️ Foto dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.voice) {
      const fwd = await bot.sendVoice(config.OWNER_ID, msg.voice.file_id, { caption: `🎙️ Voice dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.video) {
      const fwd = await bot.sendVideo(config.OWNER_ID, msg.video.file_id, { caption: `🎥 Video dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    if (msg.audio) {
      const fwd = await bot.sendAudio(config.OWNER_ID, msg.audio.file_id, { caption: `🎵 Audio dari User\n${info}\n📝 ${caption}`, parse_mode: 'HTML', reply_markup: { force_reply: true } });
      forwardedMap[fwd.message_id] = userId;
    }
    saveSession();
    await bot.sendMessage(userId, '✅ Terkirim ke admin. Ketik *batal* untuk akhiri chat.', { parse_mode: 'HTML' });
  }
});

// =====================
// BATAL COMMAND (FINAL FIX)
// =====================
bot.onText(/^\/batal(?:\s+(\d+))?$/i, async (msg, match) => {
  const userId = msg.from.id.toString();
  const targetIdFromCommand = match[1];
  const replyTo = msg.reply_to_message;
  const isOwner = userId === String(config.OWNER_ID);
  const isPM = msg.chat.type === 'private';
      if (await guardAll(msg)) return;

  // === USER membatalkan sendiri ===
  if (!isOwner && isPM) {
    if (contactSession[userId]) {
      delete contactSession[userId];
      terminatedSession[userId] = true;
      Object.keys(forwardedMap).forEach(key => {
        if (forwardedMap[key] === userId) delete forwardedMap[key];
      });
      saveSession();

      await bot.sendMessage(userId, '✅ Sesi chat dibatalkan. Tekan 📞 Contact Admin untuk mulai lagi.');
      await bot.sendMessage(config.OWNER_ID, `❌ Sesi chat dengan <code>${userId}</code> dibatalkan oleh user.`, { parse_mode: 'HTML' });

      // Kirim dummy reply biar mode reply dihapus di Telegram
      await bot.sendMessage(userId, "💬 Sesi telah berakhir.", { reply_markup: { remove_keyboard: true } });
    } else {
      await bot.sendMessage(userId, 'ℹ️ Tidak ada sesi chat aktif.', { parse_mode: 'HTML' });
    }
    return;
  }

  // === OWNER membatalkan user ===
  if (!isOwner) return;

  let targetId;
  if (targetIdFromCommand) targetId = targetIdFromCommand;
  else if (replyTo && forwardedMap[replyTo.message_id]) targetId = forwardedMap[replyTo.message_id];
  else return bot.sendMessage(msg.chat.id, '❌ Format salah.\nGunakan:\n`/batal 123456789`\nAtau balas pesan user yang ingin dibatalkan.', { parse_mode: 'HTML' });

  if (!contactSession[targetId]) {
    return bot.sendMessage(msg.chat.id, `ℹ️ Tidak ada sesi aktif dengan <code>${targetId}</code>.`, { parse_mode: 'HTML' });
  }

  delete contactSession[targetId];
  terminatedSession[targetId] = true;
  Object.keys(forwardedMap).forEach(key => {
    if (forwardedMap[key] === targetId) delete forwardedMap[key];
  });
  saveSession();

  await bot.sendMessage(targetId, '❌ Sesi chat dibatalkan oleh Admin.');
  await bot.sendMessage(msg.chat.id, `✅ Sesi dengan user <code>${targetId}</code> telah dibatalkan.`, { parse_mode: 'HTML' });

  // Kirim dummy reply agar "Membalas Security Bots" hilang
  await bot.sendMessage(config.OWNER_ID, "💬 Sesi telah ditutup.", { reply_markup: { remove_keyboard: true } });
});
// ===============================================
// ⚙️ SETTING REFERRAL — OWNER ONLY (FINAL FIX)
// ===============================================
bot.onText(/^\/setreferral(?:\s+(.+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const args = match[1] ? match[1].split(" ") : [];

  const fs = require("fs");
  const config = require("./config.js");

  const dbPath = "./database/SystemReferral.json";

  // ===== LOADING REFERRAL JSON =====
  function loadReferral() {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  }

  // ===== SAVE REFERRAL JSON =====
  function saveReferral(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  }

  // Hanya owner
  if (userId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak memiliki akses perintah ini.");
  }

  // Load data sekarang
  let ref = loadReferral();

  // ================================
  // 📘 TUTORIAL SAAT TANPA ARGUMEN
  // ================================
  if (args.length === 0) {
return bot.sendMessage(
  chatId,
  `
⚙️ <b>SETTINGS REFERRAL</b>
Atur sistem referral bot kamu dengan mudah.

==============================
<b>📌 FORMAT PERINTAH</b>
==============================

<b>1️⃣ /setreferral peruser &lt;angka&gt;</b>
💰 Bonus yang diterima PEMILIK link referral  
Contoh: <code>/setreferral peruser 500</code>

<b>2️⃣ /setreferral perdaftar &lt;angka&gt;</b>
🎁 Bonus untuk USER yang daftar lewat link  
Contoh: <code>/setreferral perdaftar 300</code>

<b>3️⃣ /setreferral on</b>
🔵 Mengaktifkan sistem referral

<b>4️⃣ /setreferral off</b>
🔴 Menonaktifkan sistem referral

==============================
<b>📊 STATUS SAAT INI</b>
==============================
• Bonus PerUser: <b>${ref.Referral_PerUser}</b>
• Bonus PerDaftar: <b>${ref.Referral_PerDaftar}</b>
• Status Referral: <b>${ref.Referral_Enabled ? "ON 🔵" : "OFF 🔴"}</b>

Gunakan perintah di atas untuk mengubah pengaturan referral.
  `,
  { parse_mode: "HTML" }
);
  }

  const type = args[0].toLowerCase();

  // ====== /setreferral peruser 500 ======
  if (type === "peruser") {
    const value = parseInt(args[1]);

    if (isNaN(value) || value < 0)
      return bot.sendMessage(chatId, "❌ Masukkan angka yang valid.");

    ref.Referral_PerUser = value;
    saveReferral(ref);

    return bot.sendMessage(chatId, `✅ Bonus <b>PerUser</b> diperbarui menjadi: <b>${value}</b>`, {
      parse_mode: "HTML",
    });
  }

  // ====== /setreferral perdaftar 500 ======
  if (type === "perdaftar") {
    const value = parseInt(args[1]);

    if (isNaN(value) || value < 0)
      return bot.sendMessage(chatId, "❌ Masukkan angka yang valid.");

    ref.Referral_PerDaftar = value;
    saveReferral(ref);

    return bot.sendMessage(chatId, `✅ Bonus <b>PerDaftar</b> diperbarui menjadi: <b>${value}</b>`, {
      parse_mode: "HTML",
    });
  }

  // ====== /setreferral on ======
  if (type === "on") {
    ref.Referral_Enabled = true;
    saveReferral(ref);

    return bot.sendMessage(chatId, "✅ Sistem referral telah *DI-AKTIFKAN*.", {
      parse_mode: "HTML",
    });
  }

  // ====== /setreferral off ======
  if (type === "off") {
    ref.Referral_Enabled = false;
    saveReferral(ref);

    return bot.sendMessage(chatId, "🔴 Sistem referral telah *DI-NONAKTIFKAN*.", {
      parse_mode: "HTML",
    });
  }

  return bot.sendMessage(chatId, "❌ Format salah. Ketik <b>/setreferral</b> untuk tutorial lengkap.", {
    parse_mode: "HTML",
  });
});
// ======================= 🔒 /SELF =======================
bot.onText(/^\/self$/i, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
        if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

    // 📂 Baca status mode sekarang
    let currentMode = { self: false };
    if (fs.existsSync(modeFile)) {
      try {
        currentMode = JSON.parse(fs.readFileSync(modeFile, "utf8"));
      } catch {
        currentMode = { self: false };
      }
    }

    // ⚠️ Jika sudah self mode
    if (currentMode.self === true) {
      return bot.sendMessage(
        chatId,
        "⚠️ Mode *Self* sudah aktif sebelumnya!\nTidak perlu diaktifkan lagi.",
        { parse_mode: "HTML" }
      );
    }

    // ✅ Aktifkan mode self
    fs.writeFileSync(modeFile, JSON.stringify({ self: true }, null, 2));
    await bot.sendMessage(
      chatId,
      "🔒 Mode *Self* berhasil diaktifkan!\nSekarang hanya *owner* yang bisa menggunakan bot.",
      { parse_mode: "HTML" }
    );
  } catch (err) {
    logError(err, "/self");
  }
});

// ======================= 🌍 /PUBLIC =======================
bot.onText(/^\/public$/i, async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
        if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

    // 📂 Baca status mode sekarang
    let currentMode = { self: false };
    if (fs.existsSync(modeFile)) {
      try {
        currentMode = JSON.parse(fs.readFileSync(modeFile, "utf8"));
      } catch {
        currentMode = { self: false };
      }
    }

    // ⚠️ Jika sudah mode public
    if (currentMode.self === false) {
      return bot.sendMessage(
        chatId,
        "⚠️ Mode *Public* sudah aktif sebelumnya!\nTidak perlu diaktifkan lagi.",
        { parse_mode: "HTML" }
      );
    }

    // ✅ Aktifkan mode public
    fs.writeFileSync(modeFile, JSON.stringify({ self: false }, null, 2));
    await bot.sendMessage(
      chatId,
      "🌍 Mode *Public* diaktifkan!\nSekarang semua user dapat menggunakan bot.",
      { parse_mode: "HTML" }
    );
  } catch (err) {
    logError(err, "/public");
  }
});
// ======================= ⚙️ /JOINCH =======================
bot.onText(/^\/joinch(?:\s*(on|off))?$/i, async (msg, match) => {
  try {
    const userId = msg.from.id.toString();
    const chatId = msg.chat.id;
    const arg = match[1];

    if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

    // =======================
    // 📌 FIX JSON AUTO-REPAIR
    // =======================
    let current = { status: false };

    try {
      const raw = fs.readFileSync(joinChFile, "utf8").trim();

      if (!raw) {
        fs.writeFileSync(joinChFile, JSON.stringify(current, null, 2));
      } else {
        current = JSON.parse(raw);
      }

    } catch (err) {
      current = { status: false };
      fs.writeFileSync(joinChFile, JSON.stringify(current, null, 2));
    }

    const currentStatus = current.status ? "Aktif ✅" : "Nonaktif ❌";

    // ❓ Jika tanpa argumen → tampilkan status
    if (!arg) {
      const helpMsg = `
🔐 *WAJIB JOIN CHANNEL*

Status saat ini: *${currentStatus}*

Gunakan perintah:
• \`/joinch on\`  → Aktifkan wajib join channel
• \`/joinch off\` → Matikan wajib join channel
`;
      return bot.sendMessage(chatId, helpMsg, { parse_mode: "HTML" });
    }

    // 🔄 Ubah status
    const status = arg.toLowerCase() === "on";
    fs.writeFileSync(joinChFile, JSON.stringify({ status }, null, 2));

    const pesan = `🔐 Fitur *wajib join channel* sekarang ${status ? "*aktif*" : "*nonaktif*"}!`;
    await bot.sendMessage(chatId, pesan, { parse_mode: "HTML" });

  } catch (err) {
    logError(err, "/joinch");
  }
});
// ======================= ⚙️ /MAINTENANCE =======================
bot.onText(/^\/maintenance(?:\s*(on|off))?$/i, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const arg = match[1];
    const userId = msg.from.id.toString();

    if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

    // 🔧 Lokasi file
    const maintenanceFile = path.join(__dirname, "./database/maintenance.json");

    // ============================
    // 📌 AUTO-REPAIR JSON (ANTI ERROR)
    // ============================
    let current = { status: false };

    try {
      const raw = fs.readFileSync(maintenanceFile, "utf8").trim();

      if (!raw) {
        // Jika kosong → tulis default
        fs.writeFileSync(maintenanceFile, JSON.stringify(current, null, 2));
      } else {
        current = JSON.parse(raw);
      }
    } catch (e) {
      // Jika rusak → reset ulang
      current = { status: false };
      fs.writeFileSync(maintenanceFile, JSON.stringify(current, null, 2));
    }

    const currentStatus = current.status ? "Aktif ✅" : "Nonaktif ❌";

    // ❓ Jika tanpa argumen → tampilkan status
    if (!arg) {
      const helpMsg = `
🛠️ *MAINTENANCE MODE*

Status saat ini: *${currentStatus}*

Gunakan perintah berikut:
• \`/maintenance on\`  → Aktifkan mode maintenance
• \`/maintenance off\` → Nonaktifkan mode maintenance
`;
      return bot.sendMessage(chatId, helpMsg, { parse_mode: "HTML" });
    }

    // 🔄 Ubah status
    const status = arg.toLowerCase() === "on";
    fs.writeFileSync(maintenanceFile, JSON.stringify({ status }, null, 2));

    await bot.sendMessage(
      chatId,
      `⚙️ Maintenance mode ${status ? "*aktif*" : "*nonaktif*"}!`,
      { parse_mode: "HTML" }
    );

  } catch (err) {
    logError(err, "/maintenance");
  }
});
// ======================= ⚙️ /GROUPONLY =======================
bot.onText(/^\/grouponly(?:\s*(on|off))?$/i, async (msg, match) => {
  try {
    const arg = match[1];
    const chatId = msg.chat.id;
    // ✅ Cek owner
    const userId = msg.from.id.toString();
        if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

    // 📂 Lokasi file penyimpanan
    const groupOnlyFile = path.join(__dirname, "./database/grouponly.json");
    if (!fs.existsSync(groupOnlyFile)) fs.writeFileSync(groupOnlyFile, JSON.stringify({ status: false }));

    const current = JSON.parse(fs.readFileSync(groupOnlyFile, "utf8"));
    const currentStatus = current.status ? "Aktif ✅" : "Nonaktif ❌";

    // ❓ Jika tanpa argumen → tampilkan tutorial
    if (!arg) {
      const helpMsg = `
⚙️ *GROUP ONLY MODE*

Status saat ini: *${currentStatus}*

Gunakan perintah berikut untuk mengubah mode:
• \`/grouponly on\`  → Aktifkan mode grup-only (bot hanya merespon di grup)
• \`/grouponly off\` → Nonaktifkan mode grup-only (bot bisa digunakan di semua chat)
`;
      return bot.sendMessage(chatId, helpMsg, { parse_mode: "HTML" });
    }

    // 🔄 Ubah status sesuai argumen
    const status = arg.toLowerCase() === "on";
    fs.writeFileSync(groupOnlyFile, JSON.stringify({ status }));

    const pesan = `👥 GroupOnly mode ${status ? "*aktif*" : "*nonaktif*"}!\nSekarang bot ${
      status ? "tidak merespon chat private" : "bisa digunakan di semua tempat"
    }.`;

    await bot.sendMessage(chatId, pesan, { parse_mode: "HTML" });
  } catch (err) {
    logError(err, "/grouponly");
  }
});

// ====================== ⚫ /BL & /BLACKLIST (Owner Only) ======================
bot.onText(/^\/(?:bl|blacklist|bluser)(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
        if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

  // ⚙️ Jika tidak ada argumen → kirim tutorial penggunaan
  if (!match[1]) {
    const tutorial = `
📝 *Cara Menambahkan Blacklist:*

Gunakan format:
\`/bl <user_id>, <alasan>\`

📌 *Contoh:*
\`/bl 123456789, Melanggar aturan bot\`

Perintah ini akan menambahkan user ke daftar blacklist dan mereka tidak bisa menggunakan bot lagi.
`;
    return bot.sendMessage(chatId, tutorial, { parse_mode: "HTML" });
  }

  // 🧩 Parsing argumen
  const args = match[1].split(",");
  if (args.length < 2) {
    return bot.sendMessage(chatId, "❌ Format salah!\nGunakan format: `/bl <user_id>, <alasan>`", { parse_mode: "HTML" });
  }

  const targetId = args[0].trim();
  const alasan = args.slice(1).join(",").trim();

  const blacklistFile = path.join(__dirname, "./database/blacklist.json");

  // 📁 Buat file jika belum ada
  if (!fs.existsSync(blacklistFile)) fs.writeFileSync(blacklistFile, JSON.stringify([], null, 2));

  let blacklist = JSON.parse(fs.readFileSync(blacklistFile, "utf8"));
  const sudahAda = blacklist.find((u) => u.id === targetId);

  if (sudahAda) {
    return bot.sendMessage(chatId, `⚠️ User \`${targetId}\` sudah ada di daftar blacklist.`, { parse_mode: "HTML" });
  }

  // 🧾 Tambahkan ke blacklist
  blacklist.push({
    id: targetId,
    alasan,
    waktu: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
  });
  fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));

  const teks = `
🚫 *BLACKLIST DITAMBAHKAN!*

👤 *User ID:* \`${targetId}\`
📋 *Alasan:* ${alasan}
🕐 *Waktu:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}

User ini tidak dapat menggunakan bot lagi.
`;

  await bot.sendMessage(chatId, teks, { parse_mode: "HTML" });
});

// ====================== ⚪ /UNBL & /UNBLACKLIST (Owner Only) ======================
bot.onText(/^\/(?:unbl|unblacklist|unbluser)(?:\s+(.*))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
        if (await guardAll(msg)) return;

    // 🔒 Hanya owner
    if (userId !== config.OWNER_ID.toString()) {
      return bot.sendMessage(
        chatId,
        "🚫 *Akses ditolak!*\nHanya owner yang dapat menggunakan perintah ini.",
        { parse_mode: "HTML" }
      );
    }

  // ⚙️ Jika tidak ada argumen → kirim tutorial penggunaan
  if (!match[1]) {
    const tutorial = `
📝 *Cara Menghapus Blacklist:*

Gunakan format:
\`/unbl <user_id>\`

📌 *Contoh:*
\`/unbl 123456789\`

Perintah ini akan menghapus user dari daftar blacklist, sehingga mereka dapat menggunakan bot lagi.
`;
    return bot.sendMessage(chatId, tutorial, { parse_mode: "HTML" });
  }

  // 🧩 Parsing argumen
  const targetId = match[1].trim();
  const blacklistFile = path.join(__dirname, "./database/blacklist.json");

  // 📁 Pastikan file ada
  if (!fs.existsSync(blacklistFile)) {
    return bot.sendMessage(chatId, "❌ File *blacklist.json* belum ada atau kosong.", { parse_mode: "HTML" });
  }

  let blacklist = JSON.parse(fs.readFileSync(blacklistFile, "utf8"));

  // 🔍 Cek apakah user ada di daftar blacklist
  const index = blacklist.findIndex((u) => String(u.id) === String(targetId));
  if (index === -1) {
    return bot.sendMessage(chatId, `ℹ️ User \`${targetId}\` tidak ditemukan di daftar blacklist.`, { parse_mode: "HTML" });
  }

  const removedUser = blacklist[index];
  blacklist.splice(index, 1);
  fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));

  const teks = `
✅ *BLACKLIST DIHAPUS!*

👤 *User ID:* \`${targetId}\`
📋 *Alasan Sebelumnya:* ${removedUser.alasan || "Tidak disebutkan"}
🕐 *Diblacklist Pada:* ${removedUser.waktu || "Tidak diketahui"}

User ini sekarang sudah bisa menggunakan bot kembali.
`;

  await bot.sendMessage(chatId, teks, { parse_mode: "HTML" });
});

// =====================================================
// 💰 FITUR MANUAL: /addsaldo idUser nominal
// Hanya Owner yang bisa akses + auto tutorial + notifikasi lengkap
// =====================================================
bot.onText(/^\/addsaldo(?:\s+(\d+))?(?:\s+(\d+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id.toString();
          if (await guardAll(msg)) return;

  // 🔐 Hanya owner
  if (fromId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak punya akses ke perintah ini.");
  }

  const id = match[1];        // user id
  const jumlah = parseInt(match[2]);  // nominal

  // 📌 Jika argumen tidak lengkap → tampilkan tutorial
  if (!id || !jumlah) {
    return bot.sendMessage(
      chatId,
      `❗ *Cara Pakai Perintah /addsaldo*\n\nFormat:\n\`/addsaldo <id_user> <nominal>\`\n\nContoh:\n\`/addsaldo 8333063872 5000\`\n\n• ID user adalah ID Telegram pembeli.\n• Nominal harus berupa angka tanpa titik.\n`,
      { parse_mode: "HTML" }
    );
  }

  if (isNaN(jumlah) || jumlah <= 0) {
    return bot.sendMessage(chatId, "❌ Nominal harus berupa angka lebih dari 0.");
  }

  const fs = require("fs");
  const saldoPath = "./database/saldoOtp.json";

  // Pastikan file ada
  if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}, null, 2));

  // Baca file saldo
  let saldoData = JSON.parse(fs.readFileSync(saldoPath, "utf8"));
  let before = saldoData[id] || 0;

  // Tambah saldo
  saldoData[id] = before + jumlah;

  // Simpan file
  fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

  const after = saldoData[id];

  // ============================
  // 🔔 NOTIFIKASI 1 — ke Admin (yang mengetik perintah)
  // ============================
  const teks = `✅ Saldo user \`${id}\` ditambah *Rp${toRupiah(jumlah)}*\n\n💵 Sebelumnya: Rp${toRupiah(before)}\n💼 Total Sekarang: Rp${toRupiah(after)}`;
  bot.sendMessage(chatId, teks, { parse_mode: 'HTML' });

  // ============================
  // 🔔 NOTIFIKASI 2 — ke User yang ditambah saldonya
  // ============================
  bot.sendMessage(
    id,
    `🎉 *Saldo Anda telah ditambahkan!*\n\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n➕ Tambahan: *Rp${toRupiah(jumlah)}*\n💼 Total Sekarang: *Rp${toRupiah(after)}*`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  // ============================
  // 🔔 NOTIFIKASI 3 — ke OWNER sebagai log
  // ============================
  bot.sendMessage(
    config.OWNER_ID,
    `📢 *NOTIFIKASI ADD SALDO*\n\n👤 Admin: @${msg.from.username || msg.from.first_name}\n🆔 ID Admin: \`${msg.from.id}\`\n\n➕ Menambah saldo ke ID \`${id}\` sebesar *Rp${toRupiah(jumlah)}*\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n💼 Total: *Rp${toRupiah(after)}*`,
    { parse_mode: 'HTML' }
  );
});
// =====================================================
// ❌ FITUR MANUAL: /delsaldo idUser nominal
// Hanya Owner + auto tutorial + notifikasi lengkap
// =====================================================
bot.onText(/^\/delsaldo(?:\s+(\d+))?(?:\s+(\d+))?$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id.toString();
            if (await guardAll(msg)) return;

  // 🔐 Hanya owner
  if (fromId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak punya akses ke perintah ini.");
  }

  const id = match[1];             // user id
  const jumlah = parseInt(match[2]); // nominal

  // 📌 Jika argumen tidak lengkap → tampilkan tutorial
  if (!id || !jumlah) {
    return bot.sendMessage(
      chatId,
      `❗ *Cara Pakai Perintah /delsaldo*\n\nFormat:\n\`/delsaldo <id_user> <nominal>\`\n\nContoh:\n\`/delsaldo 8333063872 5000\`\n\n• ID user adalah ID Telegram pembeli.\n• Nominal harus berupa angka tanpa titik.\n`,
      { parse_mode: "HTML" }
    );
  }

  if (isNaN(jumlah) || jumlah <= 0) {
    return bot.sendMessage(chatId, "❌ Nominal harus berupa angka lebih dari 0.");
  }

  const fs = require("fs");
  const saldoPath = "./database/saldoOtp.json";

  // Pastikan file saldo ada
  if (!fs.existsSync(saldoPath)) fs.writeFileSync(saldoPath, JSON.stringify({}, null, 2));

  // Baca saldo
  let saldoData = JSON.parse(fs.readFileSync(saldoPath, "utf8"));
  let before = saldoData[id] || 0;

  // Cek apakah saldo cukup
  if (before < jumlah) {
    return bot.sendMessage(
      chatId,
      `❌ Saldo user tidak mencukupi!\n\n💵 Saldo saat ini: *Rp${toRupiah(before)}*\n➖ Yang ingin dikurangi: *Rp${toRupiah(jumlah)}*`,
      { parse_mode: "HTML" }
    );
  }

  // Kurangi saldo
  saldoData[id] = before - jumlah;

  // Simpan file
  fs.writeFileSync(saldoPath, JSON.stringify(saldoData, null, 2));

  const after = saldoData[id];

  // ============================
  // 🔔 NOTIFIKASI 1 — ke Admin (yang mengetik perintah)
  // ============================
  const teks = `❌ Saldo user \`${id}\` dikurangi *Rp${toRupiah(jumlah)}*\n\n💵 Sebelumnya: Rp${toRupiah(before)}\n💼 Total Sekarang: Rp${toRupiah(after)}`;
  bot.sendMessage(chatId, teks, { parse_mode: 'HTML' });

  // ============================
  // 🔔 NOTIFIKASI 2 — ke User yang dikurangi saldonya
  // ============================
  bot.sendMessage(
    id,
    `⚠️ *Saldo Anda telah dikurangi!*\n\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n➖ Pengurangan: *Rp${toRupiah(jumlah)}*\n💼 Total Sekarang: *Rp${toRupiah(after)}*`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  // ============================
  // 🔔 NOTIFIKASI 3 — ke OWNER sebagai log
  // ============================
  bot.sendMessage(
    config.OWNER_ID,
    `📢 *NOTIFIKASI DEL SALDO*\n\n👤 Admin: @${msg.from.username || msg.from.first_name}\n🆔 ID Admin: \`${msg.from.id}\`\n\n➖ Mengurangi saldo ID \`${id}\` sebesar *Rp${toRupiah(jumlah)}*\n💵 Sebelumnya: *Rp${toRupiah(before)}*\n💼 Total: *Rp${toRupiah(after)}*`,
    { parse_mode: 'HTML' }
  );
});
// =====================================================
// 📋 LIST SEMUA SALDO USER + USERNAME
// =====================================================
bot.onText(/^\/listsaldo$/i, async (msg) => {
  const fs = require("fs");
  const saldoPath = "./database/saldoOtp.json";
            if (await guardAll(msg)) return;

  if (!fs.existsSync(saldoPath)) {
    return bot.sendMessage(msg.chat.id, "❌ Data saldo tidak ditemukan.");
  }

  const saldoData = JSON.parse(fs.readFileSync(saldoPath, "utf8"));
  const entries = Object.entries(saldoData);

  if (entries.length === 0) {
    return bot.sendMessage(msg.chat.id, "📭 Belum ada data saldo.");
  }

  let teks = `📋 *DAFTAR SALDO USER*\n\n`;

  // Loop tiap user
  for (const [id, saldo] of entries) {
    let username = "(username tidak ditemukan)";

    try {
      const userInfo = await bot.getChat(id);
      if (userInfo.username) username = `@${userInfo.username}`;
      else if (userInfo.first_name) username = userInfo.first_name;
    } catch (e) {
      // User belum pernah chat bot → username tetap '(username tidak ditemukan)'
    }

    teks += `🆔 \`${id}\`\n👤 ${username}\n💰 Rp${toRupiah(saldo)}\n\n`;
  }

  bot.sendMessage(msg.chat.id, teks, { parse_mode: "HTML" });
});
// ===========================================================
// 🔁 /broadcast & /bcbot — Forward pesan ke semua user bot
// ===========================================================
bot.onText(/^\/(broadcast|bcbot)$/i, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id.toString();
  const cmd = match[1];
            if (await guardAll(msg)) return;

  if (fromId !== config.OWNER_ID.toString()) {
    return bot.sendMessage(chatId, "❌ Kamu tidak punya akses.");
  }

  // Harus reply
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      chatId,
      `❗ *Reply pesan yang ingin di-forward, lalu ketik /${cmd}.*`,
      { parse_mode: "HTML" }
    );
  }

  const fs = require("fs");
  const userPath = "./users.json";

  if (!fs.existsSync(userPath)) {
    return bot.sendMessage(chatId, "❌ File users.json tidak ditemukan.");
  }

  let users;
  try {
    users = JSON.parse(fs.readFileSync(userPath, "utf8"));
  } catch {
    return bot.sendMessage(chatId, "❌ Gagal membaca users.json");
  }

  if (!Array.isArray(users) || users.length === 0) {
    return bot.sendMessage(chatId, "⚠️ Tidak ada user terdaftar.");
  }

  users = users.map(id => id.toString());

  let success = 0;
  let failed = 0;
  let failedIds = [];

  const startTime = Date.now();

  // Status awal
  const statusMsg = await bot.sendMessage(
    chatId,
    `🚀 Memulai broadcast...\n0% | 0/${users.length}`
  );

  const delay = 400;

  for (let i = 0; i < users.length; i++) {
    const uid = users[i];

    try {
      await bot.forwardMessage(uid, chatId, msg.reply_to_message.message_id);
      success++;
    } catch (err) {
      failed++;
      failedIds.push(uid.toString());
      console.log(`❌ Gagal kirim ke ID ${uid}: ${err.message}`);
    }

    const done = success + failed;

    // Update progress setiap 5 user
    if ((i + 1) % 5 === 0 || done === users.length) {
      const percent = Math.floor((done / users.length) * 100);

      const progress =
        `📢 *Broadcast Berjalan...*\n\n` +
        `🔄 PROSES: *${percent}%*\n` +
        `🎯 TARGET: \`${uid}\`\n` +
        `📊 PROGRESS: *${done}/${users.length}*\n\n` +
        `🟢 Berhasil: ${success}\n` +
        `🔴 Gagal: ${failed}`;

      await bot.editMessageText(progress, {
        chat_id: statusMsg.chat.id,
        message_id: statusMsg.message_id,
        parse_mode: "HTML"
      });
    }

    await new Promise(r => setTimeout(r, delay));
  }

  // Hapus ID gagal
  if (failedIds.length > 0) {
    const updatedUsers = users.filter(id => !failedIds.includes(id));
    fs.writeFileSync(userPath, JSON.stringify(updatedUsers, null, 2));
    console.log("🔥 ID yang dihapus:", failedIds);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const summary =
    `✅ *Broadcast Selesai!*\n\n` +
    `📬 *Total Target:* ${success + failed}\n` +
    `🟢 *Berhasil:* ${success}\n` +
    `🔴 *Gagal:* ${failed}\n` +
    `🗑 *ID gagal sudah dihapus dari users.json*\n` +
    `⏱ *Durasi:* ${duration} detik\n` +
    `📅 *Selesai:* ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`;

  await bot.sendMessage(chatId, summary, { parse_mode: "HTML" });

  // ===========================================================
  // 🧹 AUTO DELETE STATUS PROGRESS (FIX UTAMA)
  // ===========================================================
  bot.deleteMessage(statusMsg.chat.id, statusMsg.message_id).catch(() => {});
});
// ====================================================
// 🧠 AUTO RESTART (ANTI HANG)
// ====================================================
setInterval(() => {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  if (used > 500) {
    console.log("⚠️ Memory tinggi, restart otomatis...");
    process.exit(1);
  }
}, 30000);

//##################################//

bot.getMe().then(async () => {
  console.clear();

  const developer = config.authorName;
  const botversion = config.version;

  // 🌌 Tampilan Cyber Boot Logo (WOW Style)
  console.log(chalk.cyanBright(`
⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠳⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣀⡴⢧⣀⠀⠀⣀⣠⠤⠤⠤⠤⣄⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠘⠏⢀⡴⠊⠁⠀⠀⠀⠀⠀⠀⠈⠙⠦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⣰⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢶⣶⣒⣶⠦⣤⣀⠀
⠀⠀⠀⠀⠀⠀⢀⣰⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣟⠲⡌⠙⢦⠈⢧
⠀⠀⠀⣠⢴⡾⢟⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⡴⢃⡠⠋⣠⠋
⠐⠀⠞⣱⠋⢰⠁⢿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣠⠤⢖⣋⡥⢖⣫⠔⠋
⠈⠠⡀⠹⢤⣈⣙⠚⠶⠤⠤⠤⠴⠶⣒⣒⣚⣩⠭⢵⣒⣻⠭⢖⠏⠁⢀⣀
⠠⠀⠈⠓⠒⠦⠭⠭⠭⣭⠭⠭⠭⠭⠿⠓⠒⠛⠉⠉⠀⠀⣠⠏⠀⠀⠘⠞
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠓⢤⣀⠀⠀⠀⠀⠀⠀⣀⡤⠞⠁⠀⣰⣆⠀
⠀⠀⠀⠀⠀⠘⠿⠀⠀⠀⠀⠀⠈⠉⠙⠒⠒⠛⠉⠁⠀⠀⠀⠉⢳⡞⠉
`));
  console.log(chalk.bold.white("        WIKI - GANTENG\n"));
  console.log(chalk.white.bold("DEVELOPER    : ") + chalk.cyan(developer));
  console.log(chalk.white.bold("VERSION      : ") + chalk.green(botversion));
  console.log(chalk.greenBright("\nBot Berhasil Tersambung [✓]\n"));

  // 🔔 Kirim notifikasi ke owner
  bot.sendMessage(config.OWNER_ID, "*✅ Bot Telegram Berhasil Tersambung!*", { parse_mode: "HTML" });

});

// ==================== ⚡ SYSTEM LOG : USER COMMAND DETECTED (CYBER RALZZ EDITION) ====================
bot.on("message", async (msg) => {
  try {
    if (!msg.text || !msg.from) return;
    const text = msg.text.trim();

    // Hanya notif untuk command "/"
    if (!text.startsWith("/")) return;

    const command = text.split(" ")[0].toLowerCase();
    const userId = msg.from.id.toString();
    const username = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
    const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim();
    const fiturDipakai = command;

    const moment = require("moment-timezone");
    const waktu = moment().tz("Asia/Jakarta").format("DD-MM-YYYY HH:mm:ss");

    const chatType =
      msg.chat.type === "private"
        ? "📩 Private Chat"
        : msg.chat.title
        ? `👥 Group: *${msg.chat.title}*`
        : "🌐 Unknown Zone";

    const locationInfo =
      msg.chat.type === "private"
        ? "📩 Mode     : *Private Chat*"
        : `👥 Grup     : *${msg.chat.title}*\n┃ 🆔 Group ID : \`${msg.chat.id}\``;

    // Skip notif untuk owner
    if (userId === config.OWNER_ID.toString()) return;

    const notifText = `
<blockquote>╔═══ 𓆩⚡𓆪 𝗨𝗦𝗘𝗥 𝗕𝗔𝗥𝗨 𝗗𝗘𝗧𝗘𝗞𝗧𝗘𝗞𝗧𝗘𝗗 𓆩⚡𓆪 ═══╗

📥 Seseorang baru saja mengakses bot!

┣━〔 👤 PROFIL 〕
┃ 🧍 Nama     : *${fullName}*
┃ 🔗 Username : ${msg.from.username ? `[@${msg.from.username}](https://t.me/${msg.from.username})` : "Tidak tersedia"}
┃ 🆔 User ID  : \`${msg.from.id}\`
┃ 🕐 Waktu    : ${waktu}
┃ 📡 Status   : *LIVE CONNECTED*
┃ ${locationInfo.split("\n").join("\n┃ ")}
┃ 💬 *Command:* \`${fiturDipakai}\`

┣━〔 ⚙️ SYSTEM LOG 〕
┃ 🤖 Bot     : ${config.botName}
┃ 🔋 Mode    : Public + Real-Time
┃ 🚀 Access  : Premium Service
┃ 🧠 Logger  : Aktif ✅
┃ 🛰️ Channel : ${chatType}

╚═══ ✦ SYSTEM ALERT BLAST 2025 ✦ ═══╝</blockquote>`;

    await bot.sendMessage(config.OWNER_ID, notifText, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("❌ Gagal kirim notif ke owner:", err);
  }
});

//##################################//

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log("Update File:", __filename);
  delete require.cache[file];
  require(file);
});