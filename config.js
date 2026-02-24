/*
*/

// 🧩 Tambahkan ini di atas!
const fs = require("fs");
const chalk = require("chalk");

module.exports = {
TOKEN: "8422030262:AAFRsynFJzbDWELVko9Ux3aTpdG6iZ0ZZLU", // Token dari @BotFather
OWNER_ID: "8316389127", // ID Telegram owner
urladmin: "https://t.me/Iannv1",
urlchannel: "https://t.me/XiannInfo",
idchannel: "-1003044771045",
urlbackup: "https://t.me/XiannPdf", 
idbackup: "-1003821497007",
botName: "Xiann",
version: "1.0",
authorName: "Xiann",
ownerName: "Xiann",
  
//==============================================[ SETTING IMAGE ]=======//
ppthumb: "https://files.catbox.moe/dkvzfv.mp4",       // Foto utama bot (/start)

//==============================================[ SETTING RUMAHOTP ]=======//
RUMAHOTP: "otp_KVJkAmvtdsnyKRit",
type_ewallet_RUMAHOTP: "dana", 
// Hanya Menerima Type Ewalet : Dana, Gopay, Ovo, ShopeePay, Link Aja ( Ovo, ShopeePay, Link Aja Belom Gw Coba Si😂 )
nomor_pencairan_RUMAHOTP: "082263020256", // Nomor Ewalet Masing Masing
atas_nama_ewallet_RUMAHOTP: "empiiboost", // Ini Nama A/N Ewalet Masing Masing ( Gak Penting Sih Ini )
UNTUNG_NOKOS: 100,
UNTUNG_DEPOSIT: 250

};

// 🔁 Auto reload jika file config.js diubah
let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.blue(">> Update File :"), chalk.black.bgWhite(`${__filename}`));
  delete require.cache[file];
  require(file);
});