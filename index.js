// =================================================================
// ==              BOT DINASDIKBUD PERENCANAAN v1.3               ==
// ==        (Versi dengan Fitur 'Kembali ke Menu')             ==
// =================================================================

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@sanity/client');

const clientSanity = createClient({
  projectId: 'dk0so8pj',
  dataset: 'production',
  apiVersion: '2025-08-13',
  token: 'sk1XUQiUqNVclnlv5ZBluX9AGQRhNYD1TGqJAqi4SpnPPF4I8q7bZisHvDpra702X5OeiuXuZ63OdQxD3Lu3Xuv5idnIfZAefMDETu8Gk9NzVUb79oL55213Ye5j8JPQ4yjD2i4oTK4qnaBQgr6JgD2m4PM754Erb2CHPflQ2BeIh9wYe4Gn',
  useCdn: false,
});

const userState = {};

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', (qr) => console.log('--- QR CODE UNTUK WHATSAPP ---', qrcode.generate(qr, { small: true })));
client.on('ready', () => console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!'));

client.on('message', async (message) => {
  try {
    const chat = await message.getChat();
    const userMessage = message.body.trim();

    const userLastState = userState[message.from];
    const isNumericChoice = !isNaN(parseInt(userMessage));

    if (userLastState && isNumericChoice) {
      if (userMessage === '0') {
        console.log('↩️  Pengguna memilih 0 untuk kembali ke menu.');
        delete userState[message.from]; // Menghapus state saat ini
        
        // Membangun ulang dan mengirim menu utama
        const contact = await message.getContact();
        const userName = contact.pushname || contact.name || 'Pengguna';
        const salamQuery = `*[_type == "botReply" && keyword == "salam_menu_utama"][0]`;
        const salamData = await clientSanity.fetch(salamQuery);
        const salamText = salamData ? salamData.jawaban.replace(/\n\n/g, '\n') : 'Berikut adalah menu yang tersedia:';
        const menuUtama = [{ title: 'Daftar Pustaka' }, { title: 'Daftar User SIPD' }];
        
        // Mengatur state kembali ke menu utama
        userState[message.from] = { type: 'menu_utama', list: menuUtama };
        
        let menuMessage = `👋 Selamat datang *${userName}* di bot perencanaan.\n${salamText}\n\n`;
        menuUtama.forEach((item, index) => { menuMessage += `${index + 1}. ${item.title}\n`; });
        return message.reply(menuMessage);
      }
      
      const index = parseInt(userMessage) - 1;
      if (index >= 0 && index < userLastState.list.length) {
        const selectedItem = userLastState.list[index];
        console.log(`💬 Pengguna memilih item nomor ${userMessage} dari daftar '${userLastState.type}'.`);

        if (userLastState.type === 'menu_utama') {
            const pilihanJudul = selectedItem.title;
            if (pilihanJudul === 'Daftar Pustaka') {
              // INI ADALAH MENU BARU, JADI JANGAN HAPUS STATE
              // State akan di-update di sini dengan daftar kategori nantinya
              const kategoriQuery = `*[_type == "kategoriDokumen"]`;
              const kategoriList = await clientSanity.fetch(kategoriQuery);
              if (!kategoriList || kategoriList.length === 0) {
                message.reply('Maaf, data untuk pustaka ini belum tersedia.\n\nBalas dengan *0* untuk kembali ke menu utama.');
                // Atur state agar tombol kembali berfungsi
                userState[message.from] = { type: 'info', list: [] };
              } else {
                message.reply('Fitur "Daftar Pustaka" sedang dalam pengembangan lanjut. Terima kasih!\n\nBalas dengan *0* untuk kembali ke menu utama.');
                 // Atur state agar tombol kembali berfungsi
                userState[message.from] = { type: 'info', list: [] };
              }
            } else if (pilihanJudul === 'Daftar User SIPD') {
              // INI ADALAH JAWABAN AKHIR, JADI HAPUS STATE SETELAHNYA
              const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
              if (result) message.reply(result.jawaban);
              delete userState[message.from]; // <-- STATE DIHAPUS DI SINI
            }
        } else if (userLastState.type === 'pegawai') {
          // INI ADALAH JAWABAN AKHIR, JADI HAPUS STATE SETELAHNYA
          const pegawai = selectedItem;
          let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}`;
          if (pegawai.tipePegawai === 'admin') {
            detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* ${pegawai.userRakortek || '-'}\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
          }
          detailMessage += `\n\n*Keterangan:* ${pegawai.keterangan || '-'}`;
          message.reply(detailMessage);
          delete userState[message.from]; // <-- STATE DIHAPUS DI SINI
        }

        // KITA TIDAK LAGI MENGHAPUS STATE SECARA UMUM DI SINI
        // delete userState[message.from]; // <-- BARIS INI DIHAPUS DARI SINI
        return;
      }
    }

    // ... sisa kode Anda untuk trigger '.' dan '@' tidak perlu diubah ...
    // Logika di bawah sini sudah benar
    let trigger = '';
    let keyword = '';

    if (chat.isGroup && userMessage.startsWith('.')) {
      trigger = '.';
      keyword = userMessage.substring(1).trim().toLowerCase();
    } else if (!chat.isGroup) {
      // Untuk private chat, kita anggap setiap pesan adalah keyword, kecuali itu angka saat ada state
      if (!userLastState) {
        trigger = 'direct';
        keyword = userMessage.trim().toLowerCase();
      }
    }

    if (trigger === '') return;
    
    // Khusus untuk private chat, kita ubah 'menu' menjadi trigger utama jika tidak ada perintah lain
    if (trigger === 'direct' && keyword !== 'menu' && !keyword.startsWith('user')) {
        keyword = 'menu';
    }
    
    console.log(`▶️  Bot dipicu oleh '${trigger}' dengan perintah: "${keyword}"`);

    if (keyword === 'menu') {
        const contact = await message.getContact();
        const userName = contact.pushname || contact.name || 'Pengguna';
        const salamQuery = `*[_type == "botReply" && keyword == "salam_menu_utama"][0]`;
        const salamData = await clientSanity.fetch(salamQuery);
        const salamText = salamData ? salamData.jawaban.replace(/\n\n/g, '\n') : 'Berikut adalah menu yang tersedia:';
        const menuUtama = [{ title: 'Daftar Pustaka' }, { title: 'Daftar User SIPD' }];
        userState[message.from] = { type: 'menu_utama', list: menuUtama };
        let menuMessage = `👋 Selamat datang *${userName}* di bot perencanaan.\n${salamText}\n\n`;
        menuUtama.forEach((item, index) => { menuMessage += `${index + 1}. ${item.title}\n`; });
        return message.reply(menuMessage);
    }
    
    if (keyword.startsWith('user')) {
      const kataKunci = keyword.substring('user'.length).trim();
      if (!kataKunci) return message.reply('Silakan masukkan nama atau jabatan yang ingin dicari.\nContoh: `.user Kepala Bidang`');
      const pegawaiQuery = `*[_type == "pegawai" && (nama match $kataKunci || jabatan match $kataKunci)] | order(nama asc)`;
      const pegawaiDitemukan = await clientSanity.fetch(pegawaiQuery, { kataKunci: `*${kataKunci}*` });
      if (!pegawaiDitemukan || pegawaiDitemukan.length === 0) return message.reply(`Maaf, data untuk "${kataKunci}" tidak ditemukan.`);
      if (pegawaiDitemukan.length === 1) {
        const pegawai = pegawaiDitemukan[0];
        let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}`;
        if (pegawai.tipePegawai === 'admin') {
            detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* ${pegawai.userRakortek || '-'}\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
        }
        detailMessage += `\n\n*Keterangan:* ${pegawai.keterangan || '-'}`;
        return message.reply(detailMessage);
      } 
      // INI ADALAH MENU BARU, JADI KITA SET STATE
      userState[message.from] = { type: 'pegawai', list: pegawaiDitemukan };
      let pilihanMessage = `Ditemukan beberapa hasil untuk "${kataKunci}".\n\nSilakan balas dengan *nomor* untuk melihat detail:\n\n`;
      pegawaiDitemukan.forEach((pegawai, index) => { pilihanMessage += `${index + 1}. ${pegawai.nama} - *(${pegawai.jabatan})*\n`; });
      return message.reply(pilihanMessage);
    }
    
    // Perbaikan kecil: jangan kirim pesan 'tidak mengerti' di private chat jika sudah menampilkan menu utama
    if (!chat.isGroup && keyword === 'menu') return;

    message.reply('Maaf, saya tidak mengerti perintah itu. Coba `.menu` (di grup). Di chat pribadi, cukup kirim pesan apa saja untuk menampilkan menu.');

  } catch (error) {
    console.error('Terjadi error fatal:', error);
    message.reply('Maaf, terjadi sedikit gangguan pada sistem saya. Coba lagi beberapa saat.');
  }
});

// ====== BAGIAN 4: Menjalankan Bot ======
console.log('Memulai bot WhatsApp...');
client.initialize();