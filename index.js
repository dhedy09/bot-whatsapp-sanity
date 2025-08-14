require('dotenv').config(); // Untuk membaca file .env di lingkungan lokal

// =================================================================
// BAGIAN 1: INISIALISASI & KONFIGURASI AWAL
// =================================================================

// Server web minimalis untuk "health check" di Render.com
const express = require('express');
const app = express();
const port = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot WhatsApp is alive!'));
app.listen(port, () => console.log(`Server web berjalan di port ${port}`));

// Modul-modul utama untuk bot
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@sanity/client');

// =================================================================
// BAGIAN 2: KONFIGURASI CLIENT (SANITY & WHATSAPP)
// =================================================================

// Cek krusial untuk Sanity Token
if (!process.env.SANITY_TOKEN) {
    console.error('FATAL ERROR: SANITY_TOKEN tidak ditemukan! Atur di menu Environment Render atau file .env.');
}

// Konfigurasi koneksi ke Sanity.io
const clientSanity = createClient({
  projectId: 'dk0so8pj',
  dataset: 'production',
  apiVersion: '2025-08-13',
  token: process.env.SANITY_TOKEN,
  useCdn: false,
});

// Konfigurasi client WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Menggunakan LocalAuth untuk menyimpan sesi login
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

// State management untuk melacak percakapan pengguna
const userState = {};

// =================================================================
// BAGIAN 3: FUNGSI-FUNGSI PEMBANTU (HELPER FUNCTIONS)
// =================================================================

// --- AWAL FUNGSI: showMainMenu ---
/**
 * Fungsi untuk menampilkan MENU UTAMA.
 */
async function showMainMenu(message) {
    const contact = await message.getContact();
    const userName = contact.pushname || contact.name || 'Pengguna';
    const salamQuery = `*[_type == "botReply" && keyword == "salam_menu_utama"][0]`;
    
    // Mengambil menu dari Sanity dan mengurutkannya
    const menuQuery = `*[_type == "menuUtamaItem"] | order(urutanTampilan asc)`;

    // Menjalankan kedua query secara bersamaan
    const [salamData, menuItems] = await Promise.all([
        clientSanity.fetch(salamQuery),
        clientSanity.fetch(menuQuery)
    ]);

    const salamText = salamData ? salamData.jawaban.replace(/\n\n/g, '\n') : 'Berikut adalah menu yang tersedia:';

    if (!menuItems || menuItems.length === 0) {
        return message.reply('Maaf, menu utama belum diatur. Silakan hubungi admin.');
    }
    
    // Menyimpan data lengkap dari Sanity ke dalam state
    userState[message.from] = { type: 'menu_utama', list: menuItems };
    
    let menuMessage = `👋 Selamat datang *${userName}* di bot perencanaan.\n${salamText}\n\n`;
    menuItems.forEach((item) => {
        // Menggunakan nomor urut dari Sanity untuk tampilan
        menuMessage += `${item.urutanTampilan}. ${item.namaMenu}\n`;
    });
    
    return message.reply(menuMessage);
}
// --- AKHIR FUNGSI: showMainMenu ---


// --- AWAL FUNGSI: showPustakaMenu ---
/**
 * Fungsi untuk menampilkan menu PUSTAKA DATA secara dinamis.
 * @param {import('whatsapp-web.js').Message} message - Objek pesan dari whatsapp-web.js
 * @param {string | null} categoryId - ID kategori dari Sanity, atau null untuk level paling atas.
 */
async function showPustakaMenu(message, categoryId) {
    try {
        const breadcrumbPath = [];
        let currentCatId = categoryId;
        while (currentCatId) {
            const parent = await clientSanity.fetch(`*[_type == "kategoriPustaka" && _id == "${currentCatId}"][0]{namaKategori, "parentId": indukKategori._ref}`);
            if (parent) {
                breadcrumbPath.unshift(parent.namaKategori);
                currentCatId = parent.parentId;
            } else {
                currentCatId = null;
            }
        }
        const breadcrumb = breadcrumbPath.length > 0 ? `Pustaka Data > ${breadcrumbPath.join(' > ')}` : 'Pustaka Data';

        const queryFilter = categoryId ? `indukKategori._ref == "${categoryId}"` : '!defined(indukKategori)';
        const subKategoriQuery = `*[_type == "kategoriPustaka" && ${queryFilter}] | order(namaKategori asc)`;
        const dokumenQuery = `*[_type == "dokumenPustaka" && kategoriInduk._ref == "${categoryId}"] | order(namaDokumen asc)`;
        
        const [subKategoriList, dokumenList] = await Promise.all([
            clientSanity.fetch(subKategoriQuery),
            categoryId ? clientSanity.fetch(dokumenQuery) : Promise.resolve([])
        ]);

        const combinedList = [...subKategoriList, ...dokumenList];

        if (combinedList.length === 0) {
            message.reply(`Maaf, belum ada data di dalam kategori ini.\n\nBalas dengan *0* untuk kembali.`);
            userState[message.from] = { type: 'pustaka_data', currentCategoryId: categoryId, list: [] };
            return;
        }

        let menuMessage = `*${breadcrumb}*\n\nSilakan pilih salah satu:\n\n`;
        combinedList.forEach((item, index) => {
            const icon = item._type === 'dokumenPustaka' ? '📄' : '📁';
            const title = item.namaKategori || item.namaDokumen;
            menuMessage += `${index + 1}. ${icon} ${title}\n`;
        });
        menuMessage += `\nBalas dengan *0* untuk kembali.`;

        userState[message.from] = { type: 'pustaka_data', currentCategoryId: categoryId, list: combinedList };
        message.reply(menuMessage);

    } catch (error) {
        console.error("Error di showPustakaMenu:", error);
        message.reply("Maaf, terjadi kesalahan saat memuat Pustaka Data.");
    }
}
// --- AKHIR FUNGSI: showPustakaMenu ---


// =================================================================
// BAGIAN 4: EVENT HANDLER CLIENT WHATSAPP
// =================================================================

// --- AWAL EVENT: client.on('qr', ...) ---
// Event saat QR code perlu di-scan
client.on('qr', (qr) => {
    console.log('--- QR CODE UNTUK WHATSAPP ---');
    qrcode.generate(qr, { small: true });
});
// --- AKHIR EVENT: client.on('qr', ...) ---


// --- AWAL EVENT: client.on('ready', ...) ---
// Event saat bot berhasil terhubung
client.on('ready', () => {
    console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
});
// --- AKHIR EVENT: client.on('ready', ...) ---


        // --- AWAL EVENT UTAMA: client.on('message', ...) ---
        // Event utama saat ada pesan masuk
        client.on('message', async (message) => {
            try {

        const chat = await message.getChat();
        const userMessage = message.body.trim();
        const userLastState = userState[message.from];
        const isNumericChoice = !isNaN(parseInt(userMessage));

        // --- Logika untuk memproses balasan angka dari pengguna ---
        if (userLastState && isNumericChoice) {
            // Logika Tombol Kembali (0)
            if (userMessage === '0') {
                console.log('↩️  Pengguna memilih 0 untuk kembali.');
                if (userLastState.type === 'pustaka_data') {
                    if (userLastState.currentCategoryId) {
                        const parent = await clientSanity.fetch(`*[_type == "kategoriPustaka" && _id == "${userLastState.currentCategoryId}"][0]{"parentId": indukKategori._ref}`);
                        await showPustakaMenu(message, parent.parentId);
                    } else {
                        await showMainMenu(message);
                    }
                } else {
                    await showMainMenu(message);
                }
                return;
            }

            // Logika untuk pilihan nomor 1, 2, 3, dst.
            const index = parseInt(userMessage) - 1;
            if (index >= 0 && index < userLastState.list.length) {
                const selectedItem = userLastState.list[index];
                
                if (userLastState.type === 'pustaka_data') {
                    if (selectedItem._type === 'kategoriPustaka') {
                        await showPustakaMenu(message, selectedItem._id);
                    } else if (selectedItem._type === 'dokumenPustaka') {
                        let detailMessage = `📄 *Detail Dokumen*\n\n*Nama:* ${selectedItem.namaDokumen}\n*Tahun:* ${selectedItem.tahunDokumen || '-'}\n*Deskripsi:* ${selectedItem.deskripsi || '-'}\n\n*Link:* ${selectedItem.linkDokumen}`;
                        message.reply(detailMessage);
                        delete userState[message.from];
                    }
                  } else if (userLastState.type === 'menu_utama') {
                      // selectedItem sekarang adalah objek lengkap dari Sanity
                      if (selectedItem.tipeLink === 'kategori_pustaka') {
                          // Jika linknya adalah kategori, panggil showPustakaMenu
                          // 'linkKategori._ref' berisi ID kategori, atau null jika kosong
                          await showPustakaMenu(message, selectedItem.linkKategori?._ref || null);
                      
                      } else if (selectedItem.tipeLink === 'perintah_khusus') {
                        // Jika linknya adalah perintah khusus
                        if (selectedItem.perintahKhusus === 'tampilkan_petunjuk_user_sipd') {
                            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
                            if (result) {
                                // Tambahkan instruksi untuk kembali di akhir pesan
                                const replyMessage = result.jawaban + '\n\nBalas dengan *0* untuk kembali ke menu utama.';
                                message.reply(replyMessage);
                                
                                // Atur state agar bot tahu pengguna sedang di menu info
                                // dan bisa memproses tombol kembali. JANGAN DIHAPUS.
                                userState[message.from] = { type: 'info', list: [] };
                            }
                        }
                          // Tambahkan else if untuk perintah khusus lainnya di sini
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

        // --- Logika untuk memproses perintah baru ---
// --- Logika untuk memproses perintah baru ---
        const userMessageLower = userMessage.trim().toLowerCase();

        // --- Pemicu Menu Utama Baru ---
        if (userMessageLower === 'halo panda') {
            console.log(`▶️  Bot dipicu dengan perintah: "Halo Panda"`);
            await showMainMenu(message);
            return; // Hentikan proses setelah menampilkan menu
        }

        // --- Pemicu untuk Perintah Lainnya ---
        if (chat.isGroup && userMessage.startsWith('.')) {
            const keyword = userMessage.substring(1).trim().toLowerCase();
            
            // Logika perintah '.user [nama]'
            if (keyword.startsWith('user')) {
                console.log(`▶️  Bot dipicu dengan perintah: ".${keyword}"`);
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
        }
    
    } catch (error) {
        console.error('Terjadi error fatal:', error);
        // Kita tidak memakai message.reply di sini karena message bisa jadi penyebab error
        // Ini untuk mencegah crash berulang seperti yang pernah terjadi
    }
});
// --- AKHIR EVENT UTAMA: client.on('message', ...) ---


// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();