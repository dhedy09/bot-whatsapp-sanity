// =================================================================
// ==              BOT DINASDIKBUD PERENCANAAN v1.0               ==
// =================================================================

// ====== BAGIAN 1: Impor & Konfigurasi ======
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@sanity/client');

// Konfigurasi koneksi ke Sanity
const clientSanity = createClient({
  projectId: 'dk0so8pj',
  dataset: 'production',
  apiVersion: '2025-08-13', // Gunakan tanggal saat ini untuk versi API terbaru
  token: 'sk1XUQiUqNVclnlv5ZBluX9AGQRhNYD1TGqJAqi4SpnPPF4I8q7bZisHvDpra702X5OeiuXuZ63OdQxD3Lu3Xuv5idnIfZAefMDETu8Gk9NzVUb79oL55213Ye5j8JPQ4yjD2i4oTK4qnaBQgr6JgD2m4PM754Erb2CHPflQ2BeIh9wYe4Gn',
  useCdn: false, // Selalu false untuk bot agar mendapat data terbaru
});

// "Ingatan Jangka Pendek" Bot untuk menyimpan state percakapan
const userState = {};

// ====== BAGIAN 2: Inisialisasi Klien WhatsApp ======
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox'] // Opsi untuk server/lingkungan tertentu
  }
});

// ====== BAGIAN 3: Event Handler (Logika Inti Bot) ======
client.on('qr', (qr) => {
  console.log('--- QR CODE UNTUK WHATSAPP ---');
  qrcode.generate(qr, { small: true });
  console.log('Silakan scan QR Code di atas dengan aplikasi WhatsApp Anda.');
});

client.on('ready', () => {
  console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
});

client.on('message', async (message) => {
  try {
    // --- BAGIAN A: Logika Pilihan Angka (Stateful) ---
    // Bot memeriksa apakah pesan ini adalah balasan angka dari menu sebelumnya
    const userLastState = userState[message.from];
    const userMessage = message.body.trim();
    const isNumericChoice = !isNaN(parseInt(userMessage));

    if (userLastState && isNumericChoice) {
      const index = parseInt(userMessage) - 1;

      // Pastikan angka yang dipilih valid
      if (index >= 0 && index < userLastState.list.length) {
        const selectedItem = userLastState.list[index];
        console.log(`💬 Pengguna memilih item nomor ${userMessage} (${selectedItem.title || selectedItem.nama || selectedItem.keyword}) dari daftar '${userLastState.type}'.`);

        // ## LOGIKA UNTUK SETIAP TIPE MENU ##

        // Jika pengguna memilih dari MENU UTAMA
        if (userLastState.type === 'menu_utama') {
          const pilihanJudul = selectedItem.title;
          if (pilihanJudul === 'Pustaka Data') {
            const kategoriQuery = `*[_type == "kategoriDokumen" && !defined(parent)] | order(namaKategori asc)`;
            const topLevelKategori = await clientSanity.fetch(kategoriQuery);
            if (topLevelKategori.length > 0) {
              userState[message.from] = { type: 'pilih_kategori', list: topLevelKategori };
              let kategoriMessage = 'Anda berada di Pustaka Data.\n\nSilakan pilih kategori dengan membalas nomor:\n\n';
              topLevelKategori.forEach((kat, index) => { kategoriMessage += `${index + 1}. ${kat.namaKategori}\n`; });
              message.reply(kategoriMessage);
            } else {
              message.reply('Maaf, belum ada kategori dokumen yang tersedia.');
              delete userState[message.from];
            }
          } else if (pilihanJudul === 'Username') {
            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_username"][0]`);
            if (result) message.reply(result.jawaban);
            delete userState[message.from];
          }
          return; // Penting: hentikan eksekusi setelah menangani pilihan menu_utama
        }
        
        // Jika pengguna memilih dari KATEGORI DOKUMEN
        else if (userLastState.type === 'pilih_kategori') {
          const kategoriTerpilih = selectedItem;
          const dokumenQuery = `*[_type == "dokumen" && kategori._ref == $kategoriId] | order(judulDokumen asc)`;
          const dokumenList = await clientSanity.fetch(dokumenQuery, { kategoriId: kategoriTerpilih._id });
          if (dokumenList.length > 0) {
            userState[message.from] = { type: 'pilih_dokumen', list: dokumenList };
            let dokumenMessage = `Dokumen dalam kategori *${kategoriTerpilih.namaKategori}*.\n\nBalas dengan nomor untuk info & link:\n\n`;
            dokumenList.forEach((doc, index) => { dokumenMessage += `${index + 1}. ${doc.judulDokumen}\n`; });
            message.reply(dokumenMessage);
          } else {
            message.reply(`Tidak ada dokumen yang ditemukan di dalam kategori *${kategoriTerpilih.namaKategori}*.`);
            delete userState[message.from];
          }
          return;
        }

        // Jika pengguna memilih sebuah DOKUMEN
        else if (userLastState.type === 'pilih_dokumen') {
          const dokumenTerpilih = selectedItem;
          let detailDokumen = `📄 *Detail Dokumen*\n\n*Judul:* ${dokumenTerpilih.judulDokumen}\n*Deskripsi:* ${dokumenTerpilih.deskripsi || 'Tidak ada deskripsi.'}\n\n🔗 *Link Dokumen:*\n${dokumenTerpilih.linkFile}`;
          message.reply(detailDokumen);
          delete userState[message.from];
          return;
        }

        // Jika pengguna memilih dari daftar PEGAWAI
        else if (userLastState.type === 'pegawai') {
          const pegawai = selectedItem;
          let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}\n\n🔑 *Informasi Login*\n*Username SIPD:* ${pegawai.usernameSipd || '-'}\n*Password SIPD:* ${pegawai.passwordSipd || '-'}\n*Password Penatausahaan:* ${pegawai.passwordPenatausahaan || '-'}`;
          if (pegawai.tipePegawai === 'admin') {
            detailMessage += `\n\n🛡️ *Data Khusus Admin*\n`;
            detailMessage += `*User Rakortek:* ${pegawai.userRakortek || '-'}\n`;
            detailMessage += `*User Renstra:* ${pegawai.sipdRenstra || '-'}\n`;
            detailMessage += `*Password Renstra:* ${pegawai.passRenstra || '-'}`;
          }
          detailMessage += `\n\n*Keterangan:* ${pegawai.keterangan || '-'}`;
          message.reply(detailMessage);
          delete userState[message.from];
          return;
        }
      }
    }

    // --- BAGIAN B: Logika Perintah Mention (Stateless) ---
    // Abaikan pesan jika tidak me-mention bot
    const mentions = await message.getMentions();
    const botIsMentioned = mentions.some(contact => contact.id._serialized === client.info.wid._serialized);
    if (!botIsMentioned) return;

    // Bersihkan pesan untuk mendapatkan keyword
    const keyword = message.body.replace(/@\d+/g, '').trim().toLowerCase();
    console.log(`▶️  Bot di-mention dengan perintah: "${keyword}"`);

    // ## LOGIKA PERINTAH UTAMA ##

    // Perintah 'menu'
    if (keyword === 'menu') {
      const contact = await message.getContact();
      const userName = contact.pushname || contact.name || message.from;
      const salamQuery = `*[_type == "botReply" && keyword == "salam_pembuka_menu"][0]`;
      const salamData = await clientSanity.fetch(salamQuery);
      const salamText = salamData ? salamData.jawaban : 'Selamat datang! Silakan pilih menu:';
      const menuUtama = [{ title: 'Pustaka Data' }, { title: 'Username' }];
      userState[message.from] = { type: 'menu_utama', list: menuUtama };
      let menuMessage = `👋 Halo, *${userName}*!\n${salamText}\n\n`;
      menuUtama.forEach((item, index) => { menuMessage += `${index + 1}. ${item.title}\n`; });
      return message.reply(menuMessage);
    }
    
    // Perintah 'pegawai [nama]'
    if (keyword.startsWith('pegawai')) {
      const namaDicari = keyword.substring('pegawai'.length).trim();
      if (!namaDicari) {
        return message.reply('Silakan masukkan nama pegawai yang ingin Anda cari.\nContoh: `@NamaBot pegawai Budi`');
      }
      
      const pegawaiQuery = `*[_type == "pegawai" && nama match $namaDicari] | order(nama asc)`;
      const pegawaiDitemukan = await clientSanity.fetch(pegawaiQuery, { namaDicari: `*${namaDicari}*` });

      if (!pegawaiDitemukan || pegawaiDitemukan.length === 0) {
        return message.reply(`Maaf, pegawai dengan nama yang mengandung "${namaDicari}" tidak ditemukan.`);
      } 
      
      if (pegawaiDitemukan.length === 1) {
        const pegawai = pegawaiDitemukan[0];
        let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}\n\n🔑 *Informasi Login*\n*Username SIPD:* ${pegawai.usernameSipd || '-'}\n*Password SIPD:* ${pegawai.passwordSipd || '-'}\n*Password Penatausahaan:* ${pegawai.passwordPenatausahaan || '-'}`;
        if (pegawai.tipePegawai === 'admin') {
          detailMessage += `\n\n🛡️ *Data Khusus Admin*\n`;
          detailMessage += `*User Rakortek:* ${pegawai.userRakortek || '-'}\n`;
          detailMessage += `*User Renstra:* ${pegawai.sipdRenstra || '-'}\n`;
          detailMessage += `*Password Renstra:* ${pegawai.passRenstra || '-'}`;
        }
        detailMessage += `\n\n*Keterangan:* ${pegawai.keterangan || '-'}`;
        return message.reply(detailMessage);
      } 
      
      // Jika hasilnya lebih dari satu
      userState[message.from] = { type: 'pegawai', list: pegawaiDitemukan };
      let pilihanMessage = `Ditemukan beberapa pegawai dengan nama "${namaDicari}".\n\nSilakan balas dengan *nomor* untuk melihat detail:\n\n`;
      pegawaiDitemukan.forEach((pegawai, index) => { pilihanMessage += `${index + 1}. ${pegawai.nama}\n`; });
      return message.reply(pilihanMessage);
    }

    // Fallback: Jika tidak ada perintah di atas yang cocok, cari di botReply
    const fallbackResult = await clientSanity.fetch(`*[_type == "botReply" && keyword == $keyword][0]`, { keyword });
    if (fallbackResult) {
      return message.reply(fallbackResult.jawaban);
    }

    // Jika tidak ada jawaban sama sekali
    message.reply('Maaf, saya tidak mengerti perintah itu. Coba ketik `@NamaBot menu` untuk melihat daftar perintah yang tersedia.');

  } catch (error) {
    console.error('Terjadi error fatal:', error);
    message.reply('Maaf, terjadi sedikit gangguan pada sistem saya. Coba lagi beberapa saat.');
  }
});

// ====== BAGIAN 4: Menjalankan Bot ======
console.log('Memulai bot WhatsApp...');
client.initialize();