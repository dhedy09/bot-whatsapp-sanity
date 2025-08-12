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
client.on('message', async (message) => {
  const keyword = message.body.toLowerCase().trim();
  console.log(`💬 Pesan diterima dari ${message.from}: "${keyword}"`);

  // Query GROQ untuk mencari data di Sanity
  // Artinya: "Cari semua dokumen (*) yang tipenya 'botReply' DAN field 'keyword'-nya sama dengan pesan dari pengguna"
  const query = '*[_type == "botReply" && keyword == $keyword][0]';
  const params = { keyword: keyword };

  try {
    const result = await clientSanity.fetch(query, params);

    if (result) {
      // Jika data ditemukan di Sanity, kirim jawabannya
      console.log(`✔️ Keyword ditemukan, membalas dengan: "${result.jawaban}"`);
      message.reply(result.jawaban);
    } else {
      // Jika tidak ditemukan, abaikan atau kirim pesan default
      console.log('❌ Keyword tidak ditemukan di Sanity.');
      // Anda bisa menambahkan balasan default di sini jika mau, misalnya:
      // message.reply("Maaf, saya tidak mengerti. Coba ketik 'menu'.");
    }
  } catch (error) {
    console.error('Error saat mengambil data dari Sanity:', error);
    message.reply('Maaf, terjadi sedikit gangguan pada sistem saya.');
  }
});

// ====== BAGIAN 4: Menjalankan Bot ======

console.log('Memulai bot WhatsApp...');
client.initialize();