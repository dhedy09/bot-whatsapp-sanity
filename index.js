// =================================================================
// ==              BOT DINASDIKBUD PERENCANAAN v1.1               ==
// ==          (Versi dengan Menu Utama Terstruktur)            ==
// =================================================================

// ====== BAGIAN 1: Impor & Konfigurasi ======
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@sanity/client');

// Konfigurasi koneksi ke Sanity
const clientSanity = createClient({
  projectId: 'dk0so8pj', // Ini projectId Anda
  dataset: 'production',
  apiVersion: '2025-08-13', // Gunakan tanggal saat ini
  token: 'sk1XUQiUqNVclnlv5ZBluX9AGQRhNYD1TGqJAqi4SpnPPF4I8q7bZisHvDpra702X5OeiuXuZ63OdQxD3Lu3Xuv5idnIfZAefMDETu8Gk9NzVUb79oL55213Ye5j8JPQ4yjD2i4oTK4qnaBQgr6JgD2m4PM754Erb2CHPflQ2BeIh9wYe4Gn', // Token Editor Anda
  useCdn: false,
});

// "Ingatan Jangka Pendek" Bot
const userState = {};

// ====== BAGIAN 2: Inisialisasi Klien WhatsApp ======
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox']
  }
});

// ====== BAGIAN 3: Event Handler (Logika Inti Bot) ======
client.on('qr', (qr) => {
  console.log('--- QR CODE UNTUK WHATSAPP ---');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
});

client.on('message', async (message) => {
  try {
    // --- BAGIAN A: Logika Pilihan Angka (Stateful) ---
    const userLastState = userState[message.from];
    const userMessage = message.body.trim();
    const isNumericChoice = !isNaN(parseInt(userMessage));

    if (userLastState && isNumericChoice) {
      const index = parseInt(userMessage) - 1;
      if (index >= 0 && index < userLastState.list.length) {
        const selectedItem = userLastState.list[index];
        console.log(`💬 Pengguna memilih item nomor ${userMessage} dari daftar '${userLastState.type}'.`);

        // Jika pengguna memilih dari MENU UTAMA
        if (userLastState.type === 'menu_utama') {
          const pilihanJudul = selectedItem.title;
          if (pilihanJudul === 'Daftar Pustaka') {
            message.reply('Fitur "Daftar Pustaka" akan segera dikembangkan. Terima kasih!');
          } else if (pilihanJudul === 'Daftar User SIPD') {
            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
            if (result) {
              message.reply(result.jawaban);
            }
          }
          delete userState[message.from];
          return;
        }

        // ... (Logika lain untuk 'pegawai', 'pustaka data' bisa ditambahkan di sini nanti)
      }
    }

    // --- BAGIAN B: Logika Perintah Mention (Stateless) ---
    const mentions = await message.getMentions();
    const botIsMentioned = mentions.some(contact => contact.id._serialized === client.info.wid._serialized);
    if (!botIsMentioned) return;

    const keyword = message.body.replace(/@\d+/g, '').trim().toLowerCase();
    console.log(`▶️  Bot di-mention dengan perintah: "${keyword}"`);

    // Perintah 'menu'
    if (keyword === 'menu') {
      const contact = await message.getContact();
      const userName = contact.pushname || contact.name || 'Pengguna';
      
      const salamQuery = `*[_type == "botReply" && keyword == "salam_menu_utama"][0]`;
      const salamData = await clientSanity.fetch(salamQuery);
      const salamText = salamData ? salamData.jawaban.replace(/\n\n/g, '\n') : 'Berikut adalah menu yang tersedia:';

      const menuUtama = [{ title: 'Daftar Pustaka' }, { title: 'Daftar User SIPD' }];
      userState[message.from] = { type: 'menu_utama', list: menuUtama };
      
      let menuMessage = `👋 Selamat datang *${userName}* di bot perencanaan.\n${salamText}\n\n`;
      menuUtama.forEach((item, index) => {
        menuMessage += `${index + 1}. ${item.title}\n`;
      });
      
      return message.reply(menuMessage);
    }
    
    // Perintah 'user [nama]' (sebelumnya 'pegawai')
    if (keyword.startsWith('user')) {
      const namaDicari = keyword.substring('user'.length).trim();
      if (!namaDicari) {
        return message.reply('Silakan masukkan nama atau jabatan yang ingin Anda cari.\nContoh: `@panda user Budi`');
      }
      
      const pegawaiQuery = `*[_type == "pegawai" && (nama match $kataKunci || jabatan match $kataKunci)] | order(nama asc)`;
      const pegawaiDitemukan = await clientSanity.fetch(pegawaiQuery, { kataKunci: `*${namaDicari}*` });

      if (!pegawaiDitemukan || pegawaiDitemukan.length === 0) {
        return message.reply(`Maaf, data untuk "${namaDicari}" tidak ditemukan.`);
      } 
      
      // ... (Logika untuk menampilkan 1 hasil atau banyak hasil akan kita tambahkan setelah ini)
      // Untuk sekarang, kita tampilkan saja jumlahnya
      return message.reply(`Ditemukan ${pegawaiDitemukan.length} data yang cocok dengan "${namaDicari}". Fitur detail akan segera diimplementasikan.`);

    }

    // Fallback jika perintah tidak dikenali
    message.reply('Maaf, saya tidak mengerti perintah itu. Coba ketik `@panda menu` untuk memulai.');

  } catch (error) {
    console.error('Terjadi error fatal:', error);
    message.reply('Maaf, terjadi sedikit gangguan pada sistem saya. Coba lagi beberapa saat.');
  }
});

// ====== BAGIAN 4: Menjalankan Bot ======
console.log('Memulai bot WhatsApp...');
client.initialize();