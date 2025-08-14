// =================================================================
// BAGIAN 1: INISIALISASI & KONFIGURASI AWAL
// =================================================================

require('dotenv').config();

const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@sanity/client');
const qrcode = require('qrcode'); // <-- MODIFIKASI: Menggunakan library baru

const app = express();
const port = process.env.PORT || 8080;

// --- MODIFIKASI DIMULAI DI SINI ---
// Variabel untuk menyimpan URL gambar QR code
let qrCodeUrl = null;

// Halaman web utama untuk menampilkan status atau QR Code
app.get('/', (req, res) => {
    if (qrCodeUrl) {
        // Jika ada QR code, tampilkan sebagai gambar di halaman yang rapi
        res.send(`
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family: Arial, sans-serif; background-color:#f0f2f5; color:#4a4a4a;">
                <h1 style="font-weight: 300; margin-bottom: 25px;">Scan untuk Menghubungkan WhatsApp Bot</h1>
                <img src="${qrCodeUrl}" alt="QR Code WhatsApp" style="width:300px; height:300px; border: 1px solid #d1d1d1; padding: 10px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <p style="margin-top: 25px; color:#666;">Setelah scan berhasil, halaman ini akan otomatis refresh.</p>
            </div>
        `);
    } else {
        // Jika tidak ada QR code (artinya sudah login), tampilkan status "alive"
        res.send('<h1 style="font-family: Arial, sans-serif; text-align:center; padding-top: 40px;">Bot WhatsApp is alive!</h1><p style="font-family: Arial, sans-serif; text-align:center;">Sudah terhubung dan siap menerima pesan.</p>');
    }
});

app.listen(port, () => console.log(`Server web berjalan di port ${port}`));
// --- MODIFIKASI SELESAI DI SINI ---

// =================================================================
// BAGIAN 2: KONFIGURASI CLIENT (SANITY & WHATSAPP)
// =================================================================

if (!process.env.SANITY_TOKEN) {
    console.error('FATAL ERROR: SANITY_TOKEN tidak ditemukan!');
}

const clientSanity = createClient({
    projectId: 'dk0so8pj',
    dataset: 'production',
    apiVersion: '2025-08-13',
    token: process.env.SANITY_TOKEN,
    useCdn: false,
});

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/data/render' }) 
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

const userState = {};

// =================================================================
// BAGIAN 3: FUNGSI-FUNGSI PEMBANTU (HELPER FUNCTIONS)
// Ini adalah KODE ASLI ANDA, tidak ada yang diubah di sini
// =================================================================

async function showMainMenu(message) {
    const contact = await message.getContact();
    const userName = contact.pushname || contact.name || 'Pengguna';
    const salamQuery = `*[_type == "botReply" && keyword == "salam_menu_utama"][0]`;
    const menuQuery = `*[_type == "menuUtamaItem"] | order(urutanTampilan asc)`;
    const [salamData, menuItems] = await Promise.all([
        clientSanity.fetch(salamQuery),
        clientSanity.fetch(menuQuery)
    ]);
    const salamText = salamData ? salamData.jawaban.replace(/\n\n/g, '\n') : 'Berikut adalah menu yang tersedia:';
    if (!menuItems || menuItems.length === 0) {
        return message.reply('Maaf, menu utama belum diatur. Silakan hubungi admin.');
    }
    userState[message.from] = { type: 'menu_utama', list: menuItems };
    let menuMessage = `👋 Selamat datang *${userName}* di bot perencanaan.\n${salamText}\n\n`;
    menuItems.forEach((item) => {
        menuMessage += `${item.urutanTampilan}. ${item.namaMenu}\n`;
    });
    return message.reply(menuMessage);
}

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

// =================================================================
// BAGIAN 4: EVENT HANDLER CLIENT WHATSAPP
// =================================================================

// --- MODIFIKASI DIMULAI DI SINI ---
client.on('qr', async (qr) => {
    console.log('--- QR CODE DITERIMA, MEMBUAT GAMBAR ---');
    try {
        // Mengubah string QR menjadi gambar format Data URL agar bisa ditampilkan di tag <img>
        qrCodeUrl = await qrcode.toDataURL(qr, { scale: 8 });
        console.log('Gambar QR Code berhasil dibuat. Silakan buka link aplikasi Anda untuk scan.');
    } catch (err) {
        console.error('Gagal membuat gambar QR code:', err);
    }
});

client.on('ready', () => {
    console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
    qrCodeUrl = null; // Menghapus URL QR code karena sudah berhasil login
});
// --- MODIFIKASI SELESAI DI SINI ---

// --- KODE ASLI ANDA, TIDAK ADA PERUBAHAN DI EVENT 'message' ---
client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        const userMessage = message.body.trim();
        const userLastState = userState[message.from];
        const isNumericChoice = !isNaN(parseInt(userMessage));
        if (userLastState && isNumericChoice) {
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
                    if (selectedItem.tipeLink === 'kategori_pustaka') {
                        await showPustakaMenu(message, selectedItem.linkKategori?._ref || null);
                    } else if (selectedItem.tipeLink === 'perintah_khusus') {
                        if (selectedItem.perintahKhusus === 'tampilkan_petunjuk_user_sipd') {
                            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
                            if (result) {
                                const replyMessage = result.jawaban + '\n\nBalas dengan *0* untuk kembali ke menu utama.';
                                message.reply(replyMessage);
                                userState[message.from] = { type: 'info', list: [] };
                            }
                        }
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
        const userMessageLower = userMessage.trim().toLowerCase();
        if (userMessageLower === 'halo panda') {
            console.log(`▶️  Bot dipicu dengan perintah: "Halo Panda"`);
            await showMainMenu(message);
            return;
        }
        if (chat.isGroup && userMessage.startsWith('.')) {
            const keyword = userMessage.substring(1).trim().toLowerCase();
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
    }
});

// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();