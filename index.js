console.log('[LOG 1] Skrip dimulai.');

// Bagian Web Server untuk Render
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot WhatsApp is alive!'));
app.listen(port, () => console.log(`[LOG 2] Server web berjalan di port ${port}.`));

// Bagian Bot WhatsApp
console.log('[LOG 3] Memuat modul-modul bot...');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@sanity/client');
console.log('[LOG 4] Modul bot berhasil dimuat.');

// Cek krusial untuk Sanity Token
if (!process.env.SANITY_TOKEN) {
    console.error('FATAL ERROR: SANITY_TOKEN tidak ditemukan di Environment Variables!');
    // Proses tidak akan dilanjutkan jika token tidak ada
} else {
    console.log('[LOG 5] SANITY_TOKEN ditemukan. Mencoba membuat Sanity client...');
}

const clientSanity = createClient({
  projectId: 'dk0so8pj',
  dataset: 'production',
  apiVersion: '2025-08-13',
  token: process.env.SANITY_TOKEN,
  useCdn: false,
});
console.log('[LOG 6] Sanity client berhasil dibuat.');

const userState = {};

console.log('[LOG 7] Mencoba membuat WhatsApp client...');
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});
console.log('[LOG 8] WhatsApp client berhasil dibuat.');

client.on('qr', (qr) => {
    console.log('[LOG 9] QR Code diterima. Menampilkan...');
    console.log('--- QR CODE UNTUK WHATSAPP ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('[LOG 10] ✅ Client sudah siap dan terhubung!');
});

// ... tempel sisa kode 'client.on('message', ...)' Anda di sini ...
client.on('message', async (message) => {
    // Seluruh logika message handler Anda di sini
    try {
    const chat = await message.getChat();
    const userMessage = message.body.trim();

    const userLastState = userState[message.from];
    const isNumericChoice = !isNaN(parseInt(userMessage));

    if (userLastState && isNumericChoice) {
      if (userMessage === '0') {
        console.log('↩️  Pengguna memilih 0 untuk kembali ke menu.');
        delete userState[message.from];
        
        const contact = await message.getContact();
        const userName = contact.pushname || contact.name || 'Pengguna';
        const salamQuery = `*[_type == "botReply" && keyword == "salam_menu_utama"][0]`;
        const salamData = await clientSanity.fetch(salamQuery);
        const salamText = salamData ? salamData.jawaban.replace(/\n\n/g, '\n') : 'Berikut adalah menu yang tersedia:';
        const menuUtama = [{ title: 'Pustaka Data' }, { title: 'Daftar User SIPD' }];
        
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
            if (pilihanJudul === 'Pustaka Data') {
              const kategoriQuery = `*[_type == "kategoriDokumen"]`;
              const kategoriList = await clientSanity.fetch(kategoriQuery);
              if (!kategoriList || kategoriList.length === 0) {
                message.reply('Maaf, data untuk pustaka ini belum tersedia.\n\nBalas dengan *0* untuk kembali ke menu utama.');
                userState[message.from] = { type: 'info', list: [] };
              } else {
                message.reply('Fitur "Pustaka Data" sedang dalam pengembangan lanjut. Terima kasih!\n\nBalas dengan *0* untuk kembali ke menu utama.');
                userState[message.from] = { type: 'info', list: [] };
              }
            } else if (pilihanJudul === 'Daftar User SIPD') {
              const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
              if (result) message.reply(result.jawaban);
              delete userState[message.from];
            }
        } else if (userLastState.type === 'pegawai') {
          const pegawai = selectedItem;
          let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}`;
          if (pegawai.tipePegawai === 'admin') {
            detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* ${pegawai.userRakortek || '-'}\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
          }
          detailMessage += `\n\n*Keterangan:* ${pegawai.keterangan || '-'}`;
          message.reply(detailMessage);
          delete userState[message.from];
        }

        return;
      }
    }
    
    let trigger = '';
    let keyword = '';

    if (chat.isGroup && userMessage.startsWith('.')) {
      trigger = '.';
      keyword = userMessage.substring(1).trim().toLowerCase();
    } else if (!chat.isGroup) {
      if (!userLastState) {
        trigger = 'direct';
        keyword = userMessage.trim().toLowerCase();
      }
    }

    if (trigger === '') return;
    
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
        const menuUtama = [{ title: 'Pustaka Data' }, { title: 'Daftar User SIPD' }];
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
    
    if (!chat.isGroup && keyword === 'menu') return;

    message.reply('Maaf, saya tidak mengerti perintah itu. Coba `.menu` (di grup). Di chat pribadi, cukup kirim pesan apa saja untuk menampilkan menu.');

  } catch (error) {
    console.error('Terjadi error fatal:', error);
    message.reply('Maaf, terjadi sedikit gangguan pada sistem saya. Coba lagi beberapa saat.');
  }
});


console.log('[LOG 11] Mencoba menginisialisasi client...');
client.initialize();