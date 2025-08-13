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

    // =================================================================
    // ==               AWAL BAGIAN LOGIKA PILIHAN ANGKA              ==
    // =================================================================
    const userLastState = userState[message.from];
    const isNumericChoice = !isNaN(parseInt(userMessage));

    if (userLastState && isNumericChoice) {
      // =================================================================
      // ==           AWAL FUNGSI UNTUK TOMBOL KEMBALI (0)              ==
      // =================================================================
      if (userMessage === '0') {
        console.log('↩️  Pengguna memilih 0 untuk kembali ke menu.');
        delete userState[message.from];
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
      // =================================================================
      // ==            AKHIR FUNGSI UNTUK TOMBOL KEMBALI (0)              ==
      // =================================================================
      
      const index = parseInt(userMessage) - 1;
      if (index >= 0 && index < userLastState.list.length) {
        const selectedItem = userLastState.list[index];
        console.log(`💬 Pengguna memilih item nomor ${userMessage} dari daftar '${userLastState.type}'.`);

        if (userLastState.type === 'menu_utama') {
            const pilihanJudul = selectedItem.title;
            // =================================================================
            // ==     AWAL FUNGSI 'DAFTAR PUSTAKA' DENGAN OPSI KEMBALI        ==
            // =================================================================
            if (pilihanJudul === 'Daftar Pustaka') {
              const kategoriQuery = `*[_type == "kategoriDokumen"]`;
              const kategoriList = await clientSanity.fetch(kategoriQuery);
              if (!kategoriList || kategoriList.length === 0) {
                message.reply('Maaf, data untuk pustaka ini belum tersedia.\n\nBalas dengan *0* untuk kembali ke menu utama.');
              } else {
                message.reply('Fitur "Daftar Pustaka" sedang dalam pengembangan lanjut. Terima kasih!');
              }
            } 
            // =================================================================
            // ==      AKHIR FUNGSI 'DAFTAR PUSTAKA' DENGAN OPSI KEMBALI       ==
            // =================================================================
            else if (pilihanJudul === 'Daftar User SIPD') {
              const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
              if (result) message.reply(result.jawaban);
            }
        }
        else if (userLastState.type === 'pegawai') {
          const pegawai = selectedItem;
          let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}`;
          if (pegawai.tipePegawai === 'admin') {
            detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* ${pegawai.userRakortek || '-'}\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
          }
          detailMessage += `\n\n*Keterangan:* ${pegawai.keterangan || '-'}`;
          message.reply(detailMessage);
        }

        delete userState[message.from];
        return;
      }
    }

    // =================================================================
    // ==               AWAL BAGIAN LOGIKA PERINTAH BARU              ==
    // =================================================================
    let trigger = '';
    let keyword = '';

    if (chat.isGroup && userMessage.startsWith('.')) {
      trigger = '.';
      keyword = userMessage.substring(1).trim().toLowerCase();
    } else if (!chat.isGroup) {
      const mentions = await message.getMentions();
      const botIsMentioned = mentions.some(contact => contact.id._serialized === client.info.wid._serialized);
      if (botIsMentioned) {
        trigger = '@';
        keyword = message.body.replace(/@\d+/g, '').trim().toLowerCase();
      }
    }

    if (trigger === '') return;
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
      userState[message.from] = { type: 'pegawai', list: pegawaiDitemukan };
      let pilihanMessage = `Ditemukan beberapa hasil untuk "${kataKunci}".\n\nSilakan balas dengan *nomor* untuk melihat detail:\n\n`;
      pegawaiDitemukan.forEach((pegawai, index) => { pilihanMessage += `${index + 1}. ${pegawai.nama} - *(${pegawai.jabatan})*\n`; });
      return message.reply(pilihanMessage);
    }

    message.reply('Maaf, saya tidak mengerti perintah itu. Coba `.menu` (di grup) atau `@NamaBot menu` (chat pribadi).');

  } catch (error) {
    console.error('Terjadi error fatal:', error);
    message.reply('Maaf, terjadi sedikit gangguan pada sistem saya. Coba lagi beberapa saat.');
  }
});

// ====== BAGIAN 4: Menjalankan Bot ======
console.log('Memulai bot WhatsApp...');
client.initialize();