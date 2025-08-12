// ====== BAGIAN 1: Impor & Konfigurasi (Tetap Sama) ======
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@sanity/client');

const clientSanity = createClient({
  projectId: 'dk0so8pj',
  dataset: 'production',
  apiVersion: '2021-10-21',
  token: 'sk1XUQiUqNVclnlv5ZBluX9AGQRhNYD1TGqJAqi4SpnPPF4I8q7bZisHvDpra702X5OeiuXuZ63OdQxD3Lu3Xuv5idnIfZAefMDETu8Gk9NzVUb79oL55213Ye5j8JPQ4yjD2i4oTK4qnaBQgr6JgD2m4PM754Erb2CHPflQ2BeIh9wYe4Gn',
  useCdn: false,
});

// ====== BAGIAN BARU: "Ingatan Jangka Pendek" Bot ======
const userState = {}; // Objek kosong untuk menyimpan daftar yang dikirim ke setiap pengguna

// ====== BAGIAN 2: Inisialisasi Klien WhatsApp (Tetap Sama) ======
const client = new Client({
  authStrategy: new LocalAuth(),
});

// ====== BAGIAN 3: Event Handler (Logika Inti yang Diperbarui) ======
client.on('qr', (qr) => {
  console.log('--- QR CODE UNTUK WHATSAPP ---');
  qrcode.generate(qr, { small: true });
  console.log('Silakan scan QR Code di atas dengan aplikasi WhatsApp Anda.');
});

client.on('ready', () => {
  console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
});

client.on('message', async (message) => {
  // --- LOGIKA BARU: Pertama, Cek Apakah Pesan adalah Angka Pilihan ---
  const userLastState = userState[message.from];
  const userMessage = message.body.trim();
  const isNumericChoice = !isNaN(parseInt(userMessage));

  if (userLastState && isNumericChoice) {
    const index = parseInt(userMessage) - 1; // Ubah angka '1' menjadi index 0

    if (index >= 0 && index < userLastState.list.length) {
      const selectedItem = userLastState.list[index];
      console.log(`💬 Pengguna memilih item nomor ${userMessage} dari daftar sebelumnya.`);

      // Jika yang dipilih adalah item dari daftar 'pengumuman'
      if (userLastState.type === 'pengumuman') {
        const tanggal = new Date(selectedItem.tanggalPublikasi).toLocaleDateString('id-ID', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        let detailMessage = `📢 *DETAIL PENGUMUMAN* 📢\n\n`;
        detailMessage += `*Judul:* ${selectedItem.judul}\n`;
        detailMessage += `*Tanggal:* ${tanggal}\n\n`;
        detailMessage += `${selectedItem.isiPengumuman}`;
        message.reply(detailMessage);
      }
      // Jika yang dipilih adalah item dari daftar 'menu'
      else if (userLastState.type === 'menu') {
        const keywordToFetch = selectedItem.keyword;
        const singleQuery = '*[_type == "botReply" && keyword == $keyword][0]';
        const result = await clientSanity.fetch(singleQuery, { keyword: keywordToFetch });
        if (result) {
          message.reply(result.jawaban);
        }
      }

      delete userState[message.from]; // Hapus "ingatan" setelah berhasil digunakan
      return;
    }
  }

  // --- LOGIKA LAMA: Jika bukan angka, cek apakah bot di-mention ---
  const mentions = await message.getMentions();
  const botIsMentioned = mentions.some(contact => contact.id._serialized === client.info.wid._serialized);

  if (!botIsMentioned) {
    return;
  }

  const keyword = message.body.replace(/@\d+/g, '').trim().toLowerCase();
  console.log(`💬 Bot di-mention dengan perintah: "${keyword}"`);

  try {
    // JIKA PERINTAH ADALAH 'menu'
    if (keyword === 'menu') {
      // 1. AMBIL INFORMASI KONTAK PENGIRIM
      const contact = await message.getContact();
      // 'pushname' adalah nama profil WhatsApp pengguna.
      // Jika tidak ada, kita pakai nama yang tersimpan di kontak, atau nomornya.
      const userName = contact.pushname || contact.name || message.from;

      const menuQuery = '*[_type == "botReply"]{keyword}';
      const allData = await clientSanity.fetch(menuQuery);

      if (allData && allData.length > 0) {
        // Simpan daftar ini ke "ingatan"
        userState[message.from] = { type: 'menu', list: allData }; 

        // 2. GUNAKAN 'userName' DI PESAN SAMBUTAN
        // Kita menggunakan backtick (`) agar bisa memasukkan variabel ${userName}
        let menuMessage = `👋 Halo, *${userName}*!\nSelamat datang di bot Dinasdikbud Perencanaan.\n\nSilakan balas dengan *nomor* untuk memilih:\n`;

        allData.forEach((item, index) => {
          menuMessage += `\n${index + 1}. ${item.keyword}`;
        });
        
        message.reply(menuMessage);
      } else {
        message.reply(`Halo, *${userName}*! Maaf, belum ada data perintah yang bisa ditampilkan.`);
      }
      return;
    }

    // JIKA PERINTAH ADALAH 'pengumuman'
    if (keyword === 'pengumuman') {
      const pengumumanQuery = `*[_type == "pengumuman"] | order(tanggalPublikasi desc)[0...5]`;
      const items = await clientSanity.fetch(pengumumanQuery);
      if (items && items.length > 0) {
        userState[message.from] = { type: 'pengumuman', list: items }; // Simpan daftar ini ke "ingatan"
        let pengumumanMessage = `📢 *5 PENGUMUMAN TERBARU* 📢\n\nSilakan balas dengan *nomor* untuk melihat detail:\n\n`;
        items.forEach((item, index) => {
          pengumumanMessage += `*${index + 1}.* ${item.judul}\n`;
        });
        message.reply(pengumumanMessage);
      }
      return;
    }

    // Dan seterusnya... (sisa logika sama)

  } catch (error) {
    console.error('Error saat memproses perintah:', error);
  }
});

// ====== BAGIAN 4: Menjalankan Bot (Tetap Sama) ======
console.log('Memulai bot WhatsApp...');
client.initialize();