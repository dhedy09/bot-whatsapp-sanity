// =================================================================
// BAGIAN 1: INISIALISASI & KONFIGURASI AWAL
// =================================================================

require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@sanity/client');
const qrcode = require('qrcode');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
const app = express();
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});
const port = process.env.PORT || 8080;

let qrCodeUrl = null;

app.get('/', (req, res) => {
    if (qrCodeUrl) {
        res.send(`
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family: Arial, sans-serif; background-color:#f0f2f5; color:#4a4a4a;">
                <h1 style="font-weight: 300; margin-bottom: 25px;">Scan untuk Menghubungkan WhatsApp Bot</h1>
                <img src="${qrCodeUrl}" alt="QR Code WhatsApp" style="width:300px; height:300px; border: 1px solid #d1d1d1; padding: 10px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <p style="margin-top: 25px; color:#666;">Setelah scan berhasil, halaman ini akan otomatis refresh.</p>
            </div>
        `);
    } else {
        res.send('<h1 style="font-family: Arial, sans-serif; text-align:center; padding-top: 40px;">Bot WhatsApp is alive!</h1><p style="font-family: Arial, sans-serif; text-align:center;">Sudah terhubung dan siap menerima pesan.</p>');
    }
});

app.listen(port, () => console.log(`Server web berjalan di port ${port}`));

// =================================================================
// BAGIAN 2: KONFIGURASI CLIENT (SANITY & WHATSAPP)
// =================================================================

if (!process.env.SANITY_TOKEN) {
    console.error('FATAL ERROR: SANITY_TOKEN tidak ditemukan!');
    // process.exit(1); // Sebaiknya hentikan aplikasi jika token krusial tidak ada
}
if (!process.env.GEMINI_API_KEY) {
    console.error('FATAL ERROR: GEMINI_API_KEY tidak ditemukan!');
}

const clientSanity = createClient({
    projectId: 'dk0so8pj',
    dataset: 'production',
    // ▼▼▼ PERBAIKAN KRUSIAL ▼▼▼
    apiVersion: '2024-01-01', // Ganti dengan tanggal valid di masa lalu
    token: process.env.SANITY_TOKEN,
    useCdn: false,
});

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/data/session' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

const userState = {};

// =================================================================
// BAGIAN 3: FUNGSI-FUNGSI PEMBANTU (HELPER FUNCTIONS)
// =================================================================
/**
 * Mengambil data cuaca terkini dari OpenWeatherMap API.
 * @param {string} location Nama kota untuk dicari cuacanya.
 * @returns {Promise<string>} String yang mendeskripsikan cuaca.
 */
async function getCurrentWeather(location) {
    try {
        console.log(`Mencari cuaca untuk: ${location}`);
        const apiKey = process.env.OPENWEATHER_API_KEY;
        if (!apiKey) throw new Error("OPENWEATHER_API_KEY tidak ditemukan");

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=metric&lang=id`;
        
        const response = await fetch(url);
        if (!response.ok) {
            return `Maaf, saya tidak bisa menemukan data cuaca untuk ${location}.`;
        }
        
        const data = await response.json();
        
        const weatherDescription = `Cuaca di ${data.name}: ${data.weather[0].description}, suhu ${data.main.temp}°C, terasa seperti ${data.main.feels_like}°C.`;
        return weatherDescription;

    } catch (error) {
        console.error("Error di getCurrentWeather:", error);
        return "Maaf, terjadi kesalahan saat mengambil data cuaca.";
    }
}

/**
 * Mengambil berita utama terkini dari NewsAPI.org.
 * @param {string} country Kode negara (misal: 'id' untuk Indonesia).
 * @returns {Promise<string>} String berisi daftar judul berita.
 */
async function getLatestNews(country = 'id') {
    try {
        console.log(`Mencari berita utama untuk negara: ${country}`);
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) throw new Error("NEWS_API_KEY tidak ditemukan");

        const url = `https://newsapi.org/v2/top-headlines?country=${country}&apiKey=${apiKey}&pageSize=5`;

        const response = await fetch(url);
        if (!response.ok) {
            return "Maaf, saya tidak bisa mengambil berita terkini.";
        }
        
        const data = await response.json();
        
        if (data.articles.length === 0) {
            return "Tidak ada berita utama yang ditemukan saat ini.";
        }

        let newsDescription = "Berikut 5 berita utama terkini:\n";
        data.articles.forEach((article, index) => {
            newsDescription += `${index + 1}. ${article.title}\n`;
        });
        return newsDescription;
        
    } catch (error) {
        console.error("Error di getLatestNews:", error);
        return "Maaf, terjadi kesalahan saat mengambil data berita.";
    }
}

async function showMainMenu(message) {
    // ... (Fungsi ini sudah benar, tidak ada perubahan)
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
    // ... (Fungsi ini sudah benar, tidak ada perubahan)
    try {
        const breadcrumbPath = [];
        let currentCatId = categoryId;
        let depth = 0;
        const maxDepth = 10;
        while (currentCatId && depth < maxDepth) {
            const parentQuery = `*[_type == "kategoriPustaka" && _id == "${currentCatId}"][0]{namaKategori, "parentId": indukKategori._ref}`;
            const parent = await clientSanity.fetch(parentQuery);
            if (parent) {
                breadcrumbPath.unshift(parent.namaKategori);
                currentCatId = parent.parentId;
            } else {
                currentCatId = null;
            }
            depth++;
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

/**
 * Mengirim prompt dan riwayat percakapan ke API Gemini dan mengembalikan responsnya.
 * @param {string} prompt Pesan baru dari pengguna.
 * @param {Array} history Riwayat percakapan sebelumnya.
 * @returns {string} Jawaban dari AI.
 */
client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        const userMessage = message.body.trim();
        const userMessageLower = userMessage.toLowerCase();
        const userLastState = userState[message.from] || userState[message.author];

        // BLOK 1: MENANGANI "MODE AI"
        if (userLastState && userLastState.type === 'ai_mode') {
            const exitCommands = ['selesai', 'stop', 'exit', 'keluar'];
            if (exitCommands.includes(userMessageLower)) {
                delete userState[message.from];
                message.reply('Sesi AI telah berakhir. Anda kembali ke mode normal.');
                await showMainMenu(message);
                return;
            }

            try {
                await chat.sendStateTyping();
                const aiResponse = await getGeminiResponse(userMessage, userLastState.history);

                message.reply(aiResponse);
                
                userLastState.history.push({ role: 'user', parts: [{ text: userMessage }] });
                userLastState.history.push({ role: 'model', parts: [{ text: aiResponse }] });
                
                const MAX_HISTORY = 10;
                if (userLastState.history.length > MAX_HISTORY) {
                    userLastState.history = userLastState.history.slice(-MAX_HISTORY);
                }
            } catch (error) {
                console.error("Error di dalam blok AI Mode:", error);
                message.reply("Maaf, terjadi gangguan. Coba ulangi pertanyaan Anda.");
            }
            return;
        }

        // BLOK 2: MENANGANI PERINTAH TEKS
        if (userMessageLower === 'halo panda') {
            await showMainMenu(message);
            return;
        }

        const rememberPrefix = 'ingat ini:';
        if (userMessage.toLowerCase().startsWith(rememberPrefix)) {
            const factToRemember = userMessage.substring(rememberPrefix.length).trim();
            if (!factToRemember) {
                return message.reply('Silakan berikan fakta yang harus diingat. Contoh: `ingat ini: nama kucing saya Miko`');
            }
            const userId = message.from;
            const contact = await message.getContact();
            const userName = contact.pushname || contact.name || 'Pengguna';
            try {
                await chat.sendStateTyping();
                const query = '*[_type == "memoriPengguna" && userId == $userId][0]';
                const existingMemoryDoc = await clientSanity.fetch(query, { userId });
                if (existingMemoryDoc) {
                    await clientSanity.patch(existingMemoryDoc._id).append('daftarMemori', [factToRemember]).commit({ autoGenerateArrayKeys: true });
                } else {
                    const newMemoryDoc = { _type: 'memoriPengguna', userId, namaPengguna: userName, daftarMemori: [factToRemember] };
                    await clientSanity.create(newMemoryDoc);
                }
                message.reply('👍 Baik, sudah saya ingat.');
            } catch (error) {
                console.error('Gagal menyimpan memori ke Sanity:', error);
                message.reply('Maaf, ada kesalahan. Saya gagal mengingat fakta tersebut.');
            }
            return; 
        }

        if (userMessageLower.startsWith('cari user ')) {
            const kataKunci = userMessage.substring('cari user '.length).trim();
            if (!kataKunci) {
                return message.reply('Silakan masukkan nama atau jabatan. Contoh: `cari user Kepala Bidang`');
            }
            const pegawaiQuery = `*[_type == "pegawai" && (nama match $kataKunci || jabatan match $kataKunci)]`;
            const pegawaiDitemukan = await clientSanity.fetch(pegawaiQuery, { kataKunci: `*${kataKunci}*` });
            if (!pegawaiDitemukan || pegawaiDitemukan.length === 0) return message.reply(`Maaf, data untuk "${kataKunci}" tidak ditemukan.`);
            if (pegawaiDitemukan.length === 1) {
                const pegawai = pegawaiDitemukan[0];
                let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}`;
                if (pegawai.tipePegawai === 'admin') {
                    detailMessage += `\n\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
                }
                return message.reply(detailMessage);
            }
            userState[message.from] = { type: 'pegawai', list: pegawaiDitemukan };
            let pilihanMessage = `Ditemukan beberapa hasil untuk "${kataKunci}". Balas dengan *nomor*:\n\n`;
            pegawaiDitemukan.forEach((p, i) => { pilihanMessage += `${i + 1}. ${p.nama} - *(${p.jabatan})*\n`; });
            return message.reply(pilihanMessage);
        }
        
        const aiTriggerCommands = ['tanya ai', 'mode ai', 'sesi ai', 'panda ai'];
        if (!chat.isGroup && aiTriggerCommands.includes(userMessageLower)) {
            await chat.sendStateTyping();
            const memoryQuery = '*[_type == "memoriPengguna" && userId == $userId][0]';
            const memoryDoc = await clientSanity.fetch(memoryQuery, { userId: message.from });
            const longTermMemories = memoryDoc ? memoryDoc.daftarMemori : [];

            let systemPromptText = "Anda adalah Panda, asisten AI yang membantu dan ramah.";
            if (longTermMemories.length > 0) {
                const memoryFacts = longTermMemories.join('; ');
                systemPromptText += `\n\nFakta penting yang harus kamu ingat tentang pengguna ini: ${memoryFacts}. Gunakan informasi ini untuk jawaban yang lebih personal.`;
            }

            const initialHistory = [{ role: 'user', parts: [{ text: `(System Prompt: ${systemPromptText})` }] }, { role: 'model', parts: [{ text: 'Tentu, saya siap.' }] }];
            userState[message.from] = { type: 'ai_mode', history: initialHistory };
            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "salam_sesi_ai"][0]`);
            const welcomeMessage = result ? result.jawaban : "Sesi AI dimulai. Silakan bertanya. Ketik 'selesai' untuk berhenti.";
            message.reply(welcomeMessage);
            return;
        }

        // BLOK 3: MENANGANI PILIHAN MENU NUMERIK
        const isNumericChoice = !isNaN(parseInt(userMessage));
        if (userLastState && isNumericChoice) {
            if (userMessage === '0') {
                if (userLastState.type === 'pustaka_data' && userLastState.currentCategoryId) {
                    const parent = await clientSanity.fetch(`*[_type == "kategoriPustaka" && _id == "${userLastState.currentCategoryId}"][0]{"parentId": indukKategori._ref}`);
                    await showPustakaMenu(message, parent ? parent.parentId : null);
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
                        let detailMessage = `📄 *Dokumen:* ${selectedItem.namaDokumen}\n\n*Link:* ${selectedItem.linkDokumen}`;
                        message.reply(detailMessage);
                        delete userState[message.from];
                    }
                } else if (userLastState.type === 'pegawai') {
                    const pegawai = selectedItem;
                    let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}`;
                    if (pegawai.tipePegawai === 'admin') {
                        detailMessage += `\n\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
                    }
                    message.reply(detailMessage);
                    delete userState[message.from];
                } else if (userLastState.type === 'menu_utama') {
                    if (selectedItem.tipeLink === 'kategori_pustaka') {
                        await showPustakaMenu(message, selectedItem.linkKategori?._ref || null);
                    } else if (selectedItem.tipeLink === 'perintah_khusus') {
                        if (selectedItem.perintahKhusus === 'mulai_sesi_ai') {
                            const linkWa = `https://s.id/AI-Panda`;
                            const replyMessage = `Klik link ini untuk memulai sesi privat dengan Asisten AI:\n\n${linkWa}`;
                            message.reply(replyMessage);
                        } else if (selectedItem.perintahKhusus === 'tampilkan_petunjuk_user_sipd') {
                            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
                            if (result) {
                                message.reply(result.jawaban + '\n\nBalas dengan *0* untuk kembali.');
                                userState[message.from] = { type: 'info', list: [] };
                            }
                        }
                    }
                }
                return;
            }
        }

    } catch (error) {
        console.error('Terjadi error fatal di event message:', error);
        message.reply('Maaf, terjadi kesalahan tak terduga. Silakan coba lagi.');
    }
});


// =================================================================
// BAGIAN 4: EVENT HANDLER CLIENT WHATSAPP
// =================================================================

client.on('qr', async (qr) => {
    console.log('--- QR CODE DITERIMA, MEMBUAT GAMBAR ---');
    try {
        qrCodeUrl = await qrcode.toDataURL(qr, { scale: 8 });
        console.log('Gambar QR Code berhasil dibuat. Silakan buka link aplikasi Anda untuk scan.');
    } catch (err) {
        console.error('Gagal membuat gambar QR code:', err);
    }
});

client.on('ready', () => {
    console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
    qrCodeUrl = null;
});

// awal kode message
client.on('message', async (message) => {
    // PERBAIKAN: Struktur try/catch dan urutan logika sudah diperbaiki
    try {
        const chat = await message.getChat();
        const userMessage = message.body.trim();
        const userMessageLower = userMessage.toLowerCase();
        const userLastState = userState[message.from] || userState[message.author];

        // BLOK 1: MENANGANI "MODE AI"
        // BLOK 1: MENANGANI "MODE AI" - VERSI FINAL DENGAN PENGELOLA MEMORI
        if (userLastState && userLastState.type === 'ai_mode') {
            const exitCommands = ['selesai', 'stop', 'exit', 'keluar'];
            if (exitCommands.includes(userMessageLower)) {
                delete userState[message.from];
                message.reply('Sesi AI telah berakhir. Anda kembali ke mode normal.');
                await showMainMenu(message);
                return;
            }

            try {
                await chat.sendStateTyping();
                const aiResponse = await getGeminiResponse(userMessage, userLastState.history);

                // Kirim balasan dari AI ke pengguna
                message.reply(aiResponse);
                
                // Simpan percakapan ini ke dalam memori (history)
                userLastState.history.push({ role: 'user', parts: [{ text: userMessage }] });
                userLastState.history.push({ role: 'model', parts: [{ text: aiResponse }] });
                
                // ▼▼▼ PENYEMPURNAAN PENGELOLA MEMORI ▼▼▼
                const MAX_HISTORY = 10; // Atur batas: simpan 5 percakapan (5 user + 5 model)
                if (userLastState.history.length > MAX_HISTORY) {
                    // Ambil 10 item terakhir dari array, buang yang lebih lama
                    userLastState.history = userLastState.history.slice(-MAX_HISTORY);
                    console.log(`Memori dipangkas menjadi ${userLastState.history.length} item.`); // Log untuk debug
                }
                // ▲▲▲ PENYEMPURNAAN SELESAI ▲▲▲

            } catch (error) {
                console.error("Error di dalam blok AI Mode:", error);
                message.reply("Maaf, terjadi gangguan. Coba ulangi pertanyaan Anda.");
            }
            return;
        }

        // BLOK 2: MENANGANI PERINTAH TEKS
        if (userMessageLower === 'halo panda') {
            console.log(`▶️  Bot dipicu dengan perintah: "Halo Panda"`);
            await showMainMenu(message);
            return;
        }

            // BLOK KODE UNTUK MENGINGAT FAKTA
        const rememberPrefix = 'ingat ini:';
        if (userMessage.toLowerCase().startsWith(rememberPrefix)) {
            console.log('▶️ Bot dipicu dengan perintah "ingat ini:"');
            
            const factToRemember = userMessage.substring(rememberPrefix.length).trim();
            
            if (!factToRemember) {
                return message.reply('Silakan berikan fakta yang harus diingat. Contoh: `ingat ini: nama kucing saya Miko`');
            }

            const userId = message.from;
            const contact = await message.getContact();
            const userName = contact.pushname || contact.name || 'Pengguna';

            try {
                await chat.sendStateTyping();
                const query = '*[_type == "memoriPengguna" && userId == $userId][0]';
                const existingMemoryDoc = await clientSanity.fetch(query, { userId });

                if (existingMemoryDoc) {
                    // Jika dokumen ada, tambahkan memori baru
                    await clientSanity
                        .patch(existingMemoryDoc._id)
                        .append('daftarMemori', [factToRemember])
                        .commit({ autoGenerateArrayKeys: true });
                } else {
                    // Jika tidak ada, buat dokumen baru
                    const newMemoryDoc = {
                        _type: 'memoriPengguna',
                        userId: userId,
                        namaPengguna: userName,
                        daftarMemori: [factToRemember]
                    };
                    await clientSanity.create(newMemoryDoc);
                }
                message.reply('👍 Baik, sudah saya ingat.');
            } catch (error) {
                console.error('Gagal menyimpan memori ke Sanity:', error);
                message.reply('Maaf, ada kesalahan. Saya gagal mengingat fakta tersebut.');
            }
            return; 
        }

        if (userMessageLower.startsWith('cari user ')) {
            console.log(`▶️  Bot dipicu dengan perintah: "cari user"`);
            const kataKunci = userMessage.substring('cari user '.length).trim();
            
            if (!kataKunci) {
                return message.reply('Silakan masukkan nama atau jabatan yang ingin dicari.\nContoh: `cari user Kepala Bidang`');
            }

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
            pegawaiDitemukan.forEach((pegawai, index) => {
                pilihanMessage += `${index + 1}. ${pegawai.nama} - *(${pegawai.jabatan})*\n`;
            });
            return message.reply(pilihanMessage);
        }
        // Pemicu baru untuk mengaktifkan Mode AI dari chat pribadi
        const aiTriggerCommands = [
            'tanya ai', 
            'mode ai', 
            'sesi ai', 
            'panda ai',
            'halo panda ai',
            'mulai sesi ai',
            'halo, saya ingin memulai sesi ai'
        ];

    // DENGAN KODE BARU INI
        if (!chat.isGroup && aiTriggerCommands.includes(userMessageLower)) {
            console.log('▶️ Memulai Sesi AI dengan pengecekan memori jangka panjang...');
            await chat.sendStateTyping();

            // 1. Ambil memori jangka panjang dari Sanity
            const memoryQuery = '*[_type == "memoriPengguna" && userId == $userId][0]';
            const memoryDoc = await clientSanity.fetch(memoryQuery, { userId: message.from });
            
            const longTermMemories = memoryDoc ? memoryDoc.daftarMemori : [];

            // 2. Buat "contekan" atau system prompt untuk AI
            let systemPromptText = "Anda adalah Panda, asisten AI yang membantu dan ramah.";
            if (longTermMemories.length > 0) {
                const memoryFacts = longTermMemories.join('; ');
                systemPromptText += `\n\nBerikut adalah beberapa fakta penting yang harus kamu ingat tentang pengguna ini: ${memoryFacts}. Gunakan informasi ini untuk memberikan jawaban yang lebih personal.`;
            }

            // 3. Siapkan riwayat percakapan dengan "contekan" di paling awal
            const initialHistory = [{
                role: 'user',
                parts: [{ text: `(System Prompt: ${systemPromptText}) Mulai percakapan.` }]
            }, {
                role: 'model',
                parts: [{ text: 'Tentu, saya siap.' }]
            }];

            userState[message.from] = { type: 'ai_mode', history: initialHistory };

            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "salam_sesi_ai"][0]`);
            const welcomeMessage = result ? result.jawaban : "Silakan mulai bertanya. Ketik 'selesai' untuk berhenti.";
            
            message.reply(welcomeMessage);
            return;
        }
         // akhir Pemicu baru untuk mengaktifkan Mode AI dari chat pribadi

        // BLOK 3: MENANGANI PILIHAN MENU NUMERIK
        const isNumericChoice = !isNaN(parseInt(userMessage));
        if (userLastState && isNumericChoice) {
            if (userMessage === '0') {
                console.log('↩️  Pengguna memilih 0 untuk kembali.');
                if (userLastState.type === 'pustaka_data' && userLastState.currentCategoryId) {
                    const parent = await clientSanity.fetch(`*[_type == "kategoriPustaka" && _id == "${userLastState.currentCategoryId}"][0]{"parentId": indukKategori._ref}`);
                    await showPustakaMenu(message, parent ? parent.parentId : null);
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
                } else if (userLastState.type === 'pegawai') {
                    const pegawai = selectedItem;
                    let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}`;
                    if (pegawai.tipePegawai === 'admin') {
                        detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* ${pegawai.userRakortek || '-'}\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
                    }
                    detailMessage += `\n\n*Keterangan:* ${pegawai.keterangan || '-'}`;
                    message.reply(detailMessage);
                    delete userState[message.from];
                } else if (userLastState.type === 'menu_utama') {
                    if (selectedItem.tipeLink === 'kategori_pustaka') {
                        await showPustakaMenu(message, selectedItem.linkKategori?._ref || null);
                    } else if (selectedItem.tipeLink === 'perintah_khusus') {
                        if (selectedItem.perintahKhusus === 'mulai_sesi_ai') {
                            const nomorBot = '6283870365038';
                            const teksOtomatis = encodeURIComponent("Halo, saya ingin memulai sesi AI");
                            // const linkWa = `https://wa.me/${nomorBot}?text=${teksOtomatis}`;
                            const linkWa = `https://s.id/AI-Panda`;
                            const replyMessage = `Untuk memulai sesi privat dengan Asisten AI, silakan klik link di bawah ini. Anda akan diarahkan ke chat pribadi dengan saya.\n\n${linkWa}`;
                            message.reply(replyMessage);
                        } else if (selectedItem.perintahKhusus === 'tampilkan_petunjuk_user_sipd') {
                            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
                            if (result) {
                                message.reply(result.jawaban + '\n\nBalas dengan *0* untuk kembali ke menu utama.');
                                userState[message.from] = { type: 'info', list: [] };
                            }
                        }
                    }
                }
                return;
            }
        }

    } catch (error) {
        console.error('Terjadi error fatal di event message:', error);
        message.reply('Maaf, terjadi kesalahan tak terduga. Silakan coba lagi.');
    }
});
// akhir kode message


// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();