// ====== BAGIAN 1: Impor & Konfigurasi ======

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@sanity/client');

// Konfigurasi untuk koneksi ke Sanity
const clientSanity = createClient({
  // Ambil dari manage.sanity.io
  projectId: 'dk0so8pj',
  dataset: 'production',
  apiVersion: '2021-10-21', // Gunakan tanggal ini atau yang lebih baru
  // Buat token ini di manage.sanity.io > API > Tokens
  token: 'sk1XUQiUqNVclnlv5ZBluX9AGQRhNYD1TGqJAqi4SpnPPF4I8q7bZisHvDpra702X5OeiuXuZ63OdQxD3Lu3Xuv5idnIfZAefMDETu8Gk9NzVUb79oL55213Ye5j8JPQ4yjD2i4oTK4qnaBQgr6JgD2m4PM754Erb2CHPflQ2BeIh9wYe4Gn',
  useCdn: false, // Set ke false agar selalu dapat data terbaru
});

// ====== BAGIAN 2: Inisialisasi Klien WhatsApp ======

// LocalAuth digunakan agar tidak perlu scan QR code setiap kali kode dijalankan ulang
const client = new Client({
  authStrategy: new LocalAuth(),
});

// ====== BAGIAN 3: Event Handler (Jantung Bot) ======

// Event ini akan terpanggil saat QR code perlu ditampilkan
client.on('qr', (qr) => {
  console.log('--- QR CODE UNTUK WHATSAPP ---');
  qrcode.generate(qr, { small: true });
  console.log('Silakan scan QR Code di atas dengan aplikasi WhatsApp Anda.');
});

// Event ini akan terpanggil saat bot berhasil terhubung
client.on('ready', () => {
  console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
});

// Event ini adalah inti dari bot, terpanggil setiap kali ada pesan masuk
// GANTI BLOK LAMA ANDA DENGAN VERSI FINAL INI
client.on('message', async (message) => {
  // --- LOGIKA TRIGGER BARU: HANYA MERESPONS JIKA DI-MENTION ---
  
  // Dapatkan semua mention di dalam pesan
  const mentions = await message.getMentions();
  // Cek apakah salah satu mention adalah bot kita sendiri
  const botIsMentioned = mentions.some(contact => contact.id._serialized === client.info.wid._serialized);

  // Abaikan pesan jika bot tidak di-mention
  if (!botIsMentioned) {
    return;
  }

  // Ambil teks pesan dan hapus bagian mention (@1234567890) agar bersih
  const keyword = message.body.replace(/@\d+/g, '').trim().toLowerCase();
  console.log(`💬 Bot di-mention dengan perintah: "${keyword}"`);

  // --- Sisa logika perintah tetap sama persis ---
  
  try {
    // JIKA PERINTAH ADALAH 'menu'
    if (keyword === 'menu') {
      const menuQuery = '*[_type == "botReply"]{keyword}';
      const allData = await clientSanity.fetch(menuQuery);

      if (allData.length > 0) {
        let menuMessage = 'Selamat datang di bot Dinasdikbud Perencanaan.\n\nBerikut daftar perintah yang tersedia:\n';
        allData.forEach((item, index) => {
          // Kita hilangkan trigger '!bot' karena sudah tidak dipakai
          menuMessage += `\n${index + 1}. ${item.keyword}`; 
        });
        message.reply(menuMessage);
      } else {
        message.reply('Maaf, belum ada data perintah yang bisa ditampilkan.');
      }
      return; 
    }

    // JIKA PERINTAH ADALAH 'pengumuman'
    if (keyword === 'pengumuman') {
      const pengumumanQuery = `*[_type == "pengumuman"] | order(tanggalPublikasi desc)[0...5]`;
      const items = await clientSanity.fetch(pengumumanQuery);

      if (items && items.length > 0) {
        let pengumumanMessage = `📢 *5 PENGUMUMAN TERBARU* 📢\n\n`;
        items.forEach((item, index) => {
          const tanggal = new Date(item.tanggalPublikasi).toLocaleDateString('id-ID', {
            day: '2-digit', month: 'long', year: 'numeric'
          });
          pengumumanMessage += `*${index + 1}. ${item.judul}*\n`;
          pengumumanMessage += `   📅 _${tanggal}_\n\n`;
        });
        message.reply(pengumumanMessage);
      } else {
        message.reply('Maaf, saat ini tidak ada pengumuman yang tersedia.');
      }
      return; 
    }
    
    // LOGIKA LAMA (untuk mengambil jawaban spesifik)
    const singleQuery = '*[_type == "botReply" && keyword == $keyword][0]';
    const params = { keyword: keyword };
    const result = await clientSanity.fetch(singleQuery, params);

    if (result) {
      message.reply(result.jawaban);
    } else {
      message.reply(`Maaf, perintah "${keyword}" tidak ditemukan. Coba mention saya dan ketik "menu" untuk melihat semua pilihan.`);
    }

  } catch (error) {
    console.error('Error saat memproses perintah:', error);
    message.reply('Maaf, terjadi sedikit gangguan pada sistem saya.');
  }
});

// ====== BAGIAN 4: Menjalankan Bot ======

console.log('Memulai bot WhatsApp...');
client.initialize();