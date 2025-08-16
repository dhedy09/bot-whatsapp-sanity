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
const { google } = require('googleapis');
const { Readable } = require('stream');
const { evaluate } = require('mathjs');
const FOLDER_DRIVE_ID = '17LsEyvyF06v3dPN7wMv_3NOiaajY8sQk'; // Ganti dengan ID folder Google Drive Anda
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
 * Mengevaluasi ekspresi matematika menggunakan math.js.
 * @param {string} expression Ekspresi yang akan dihitung, contoh: "5 * (2 + 3)".
 * @returns {string} Hasil perhitungan atau pesan error.
 */
function evaluateMathExpression(expression) {
    try {
        const result = evaluate(expression);
        
        // Memformat hasil agar tidak terlalu panjang (jika desimal)
        if (typeof result === 'number' && !Number.isInteger(result)) {
            return result.toFixed(4).toString();
        }
        
        return result.toString();
    } catch (error) {
        console.error("Math.js error:", error.message);
        return `Ekspresi '${expression}' tidak valid.`;
    }
}

/**
 * Mengambil file dari Google Drive dan mengirimkannya sebagai media.
 * @param {string} fileId ID file di Google Drive.
 * @param {string} fileName Nama file yang akan ditampilkan ke pengguna.
 * @param {string} userChatId ID chat tujuan.
 */
async function kirimFileDariDrive(fileId, fileName, userChatId) {
    try {
        // Otentikasi sama seperti saat upload
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });
        const drive = google.drive({ version: 'v3', auth });

        // Mengunduh file dari Drive sebagai stream
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' }
        );

        // Mengumpulkan data dari stream menjadi satu buffer
        const chunks = [];
        for await (const chunk of response.data) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const base64data = buffer.toString('base64');

        // Membuat objek MessageMedia dari data base64
        const { MessageMedia } = require('whatsapp-web.js');
        const media = new MessageMedia(
            response.headers['content-type'],
            base64data,
            fileName
        );

        // Mengirim file ke pengguna
        await client.sendMessage(userChatId, media, { caption: `Ini file yang Anda minta: *${fileName}*` });
        return true;

    } catch (error) {
        console.error("Error saat mengirim file dari Drive:", error);
        await client.sendMessage(userChatId, `Maaf, terjadi kesalahan saat mencoba mengambil file "${fileName}".`);
        return false;
    }
}

/**
 * Mencari file di Sanity berdasarkan kata kunci dan ID grup.
 * @param {string} kataKunci Kata kunci untuk pencarian.
 * @param {string} groupId ID grup saat ini.
 * @returns {Promise<Array>} Daftar file yang cocok.
 */
async function cariFileDiSanity(kataKunci, groupId) {
    try {
        // Query untuk mencari file yang namanya cocok DAN berada di grup yang sama
        const query = `*[_type == "fileArsip" && namaFile match $kataKunci && groupId == $groupId]`;
        const params = { kataKunci: `*${kataKunci}*`, groupId: groupId };
        const files = await clientSanity.fetch(query, params);
        return files || [];
    } catch (error) {
        console.error("Error saat mencari file di Sanity:", error);
        return [];
    }
}


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
async function getLatestNews(query) {
    try {
        console.log(`Mencari berita untuk query: ${query}`);
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) throw new Error("NEWS_API_KEY tidak ditemukan");

        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${apiKey}&pageSize=5&sortBy=relevancy`;

        const response = await fetch(url);
        if (!response.ok) {
            return `Maaf, saya tidak bisa mengambil berita terkait ${query}.`;
        }
        
        const data = await response.json();
        
        if (data.articles.length === 0) {
            return `Tidak ada berita yang ditemukan untuk topik "${query}".`;
        }

        let newsDescription = `Berikut 5 berita teratas terkait "${query}":\n`;
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
// ▼▼▼ GANTI FUNGSI LAMA ANDA DENGAN SEMUA KODE DI BAWAH INI ▼▼▼

// 1. Definisikan "alat" yang bisa digunakan oleh AI
const tools = {
  functionDeclarations: [
    {
      name: "getCurrentWeather",
      description: "Mendapatkan data cuaca terkini untuk lokasi tertentu.",
      parameters: {
        type: "OBJECT",
        properties: { location: { type: "STRING", description: "Nama kota." } },
        required: ["location"],
      },
    },
    {
      name: "getLatestNews",
      description: "Mendapatkan berita terkini berdasarkan topik atau kata kunci.",
      parameters: {
        type: "OBJECT",
        properties: { query: { type: "STRING", description: "Topik berita." } },
        required: ["query"],
      },
    },
    { 
      name: "calculate",
      description: "Mengevaluasi ekspresi matematika atau formula Excel. Gunakan ini untuk semua perhitungan, konversi, atau operasi matematika.",
      parameters: {
        type: "OBJECT",
        properties: {
          expression: {
            type: "STRING",
            description: "Ekspresi matematika yang akan dihitung. Contoh: '100 / (5 * 2)' atau 'sqrt(16) + 2^3'.",
          },
        },
        required: ["expression"],
      },
    },
  ],
};

/**
 * Mengirim prompt ke API Gemini, menangani function calling, dan mengembalikan respons.
 * @param {string} prompt Pesan baru dari pengguna.
 * @param {Array} history Riwayat percakapan sebelumnya.
 * @returns {string} Jawaban dari AI.
 */
async function getGeminiResponse(prompt, history) {
    const maxRetries = 3; // Coba panggil API maksimal 3 kali
    const delay = 2000;   // Jeda 2 detik antar percobaan

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const chat = model.startChat({
                history: history,
                tools: tools,
            });

            const result = await chat.sendMessage(prompt);
            const call = result.response.functionCalls()?.[0];

            if (call) {
                // LOGGING BARU: Untuk melihat apa yang diminta AI
                console.log("▶️ AI meminta pemanggilan fungsi:", JSON.stringify(call, null, 2));
                
                let functionResponse;
                if (call.name === 'getCurrentWeather') {
                    functionResponse = await getCurrentWeather(call.args.location);
                } else if (call.name === 'getLatestNews') {
                    functionResponse = await getLatestNews(call.args.query);
                } else if (call.name === 'calculate') {
                    functionResponse = evaluateMathExpression(call.args.expression);
                } else {
                    // Jika nama fungsi tidak ada dalam daftar kita
                    console.error(`❌ Nama fungsi tidak dikenali: ${call.name}`);
                    // Kita sengaja set null agar memicu pesan error yang kita buat
                    functionResponse = null; 
                }

                if (functionResponse) {
                    const result2 = await chat.sendMessage([
                        { functionResponse: { name: call.name, response: { content: functionResponse } } }
                    ]);
                    return result2.response.text();
                } else {
                     return "Maaf, saya tidak mengenali alat yang diminta.";
                }
            }
            
            // Jika berhasil, langsung kembalikan hasil dan keluar dari loop
            return result.response.text();

        } catch (error) {
            // Periksa apakah ini eror 'Service Unavailable' (503) yang bisa dicoba lagi
            if (error.status === 503) {
                console.log(`Attempt ${attempt}: Gagal (503), server sibuk. Mencoba lagi dalam ${delay / 1000} detik...`);
                
                if (attempt === maxRetries) {
                    console.error("Gagal setelah percobaan maksimal karena server terus sibuk.");
                    return "Maaf, Asisten AI sedang sangat sibuk saat ini. Silakan coba lagi beberapa saat lagi.";
                }
                
                // Tunggu sebentar sebelum mencoba lagi
                await new Promise(resolve => setTimeout(resolve, delay));

            } else {
                // Untuk eror lain (misal: API key salah), langsung hentikan dan laporkan
                console.error("Error saat memanggil API Gemini (bukan 503):", error);
                return "Maaf, terjadi kesalahan yang tidak terduga saat menghubungi Asisten AI.";
            }
        }
    }
}

/**
 * Mengunggah file media ke folder Google Drive yang ditentukan.
 * @param {MessageMedia} media Objek media dari whatsapp-web.js (berisi data base64, mimetype, dll).
 * @param {string} namaFileKustom Nama file yang akan digunakan saat menyimpan di Drive.
 * @returns {Promise<string|null>} Mengembalikan ID file di Google Drive jika berhasil, atau null jika gagal.
 */
async function uploadKeDrive(media, namaFileKustom) {
    try {
        // Mengambil kredensial dari environment variable
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);

        const auth = new google.auth.GoogleAuth({
            credentials, // Gunakan kredensial yang sudah di-parse
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const drive = google.drive({ version: 'v3', auth });

        // Ubah data base64 dari media menjadi buffer, lalu stream
        const buffer = Buffer.from(media.data, 'base64');
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);

        const response = await drive.files.create({
            requestBody: {
                name: namaFileKustom,
                parents: [FOLDER_DRIVE_ID]
            },
            media: {
                mimeType: media.mimetype,
                body: stream,
            },
            fields: 'id',
            supportsAllDrives: true, // <-- BARIS PENTING INI DITAMBAHKAN
        });

        console.log(`✅ File berhasil diunggah ke Drive. ID: ${response.data.id}`);
        return response.data.id; // Kembalikan ID file di Drive

    } catch (error) {
        console.error("Error saat mengunggah ke Google Drive:", error);
        return null;
    }
}

/**
 * Menyimpan metadata file ke Sanity.io.
 * @param {object} dataFile Informasi file yang akan disimpan.
 * @returns {Promise<boolean>} True jika berhasil, false jika gagal.
 */
async function simpanDataFileKeSanity(dataFile) {
    try {
        const doc = {
            _type: 'fileArsip',
            namaFile: dataFile.namaFile,
            googleDriveId: dataFile.googleDriveId,
            diunggahOleh: dataFile.diunggahOleh,
            groupId: dataFile.groupId,
            tipeFile: dataFile.tipeFile,
            tanggalUnggah: new Date().toISOString(),
        };
        await clientSanity.create(doc);
        console.log(`✅ Info file "${dataFile.namaFile}" berhasil disimpan ke Sanity.`);
        return true;
    } catch (error) {
        console.error("Error saat menyimpan info file ke Sanity:", error);
        return false;
    }
}


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

            // ▼▼▼ TAMBAHKAN BLOK BARU PENGINGAT DI SINI ▼▼▼
            // BLOK BARU: MENYIMPAN MEMORI JANGKA PANJANG
            const memoryTrigger = 'ingat ini:';
            if (userMessageLower.startsWith(memoryTrigger)) {
                // Ambil teks yang ingin disimpan
                const memoryToSave = userMessage.substring(memoryTrigger.length).trim();

                // Pastikan ada sesuatu untuk disimpan
                if (!memoryToSave) {
                    message.reply("Silakan berikan informasi yang ingin saya ingat setelah 'ingat ini:'.\nContoh: `ingat ini: saya suka kopi hitam`");
                    return;
                }

                const userId = message.from;
                const sanitizedId = userId.replace(/[@.]/g, '-'); // <-- TAMBAHKAN BARIS INI
                const contact = await message.getContact();
                const userName = contact.pushname || userId;

                try {
                    // LANGKAH 1: Pastikan dokumen untuk user ini sudah ada.
                    // createIfNotExists akan membuat dokumen HANYA jika belum ada.
                    await clientSanity.createIfNotExists({
                        _id: sanitizedId,
                        _type: 'memoriPengguna',
                        userId: userId,
                        namaPengguna: userName,
                        daftarMemori: []
                    });

                    // LANGKAH 2: Setelah dokumen dijamin ada, tambahkan memori baru.
                    // Perintah .patch().append() sekarang akan selalu berhasil.
                    await clientSanity
                        .patch(sanitizedId)
                        .append('daftarMemori', [memoryToSave])
                        .commit({ autoGenerateArrayKeys: true });

                    message.reply("Baik, saya akan mengingatnya.");
                    console.log(`Memori baru disimpan untuk user ${userName}: "${memoryToSave}"`);
                }
                return; // Hentikan proses agar perintah "ingat ini:" tidak dikirim ke AI
            }
            // ▲▲▲ AKHIR BLOK BARU PENGINGAT▲▲▲

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

        // ▼▼▼ BLOK BARU UNTUK MENAMPILKAN DAFTAR PERINTAH ▼▼▼
        const commandKeywords = ['help', 'menu bantuan'];
        if (commandKeywords.includes(userMessageLower)) {
            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "daftar_perintah"][0]`);
            if (result && result.jawaban) {
                return message.reply(result.jawaban);
            } else {
                return message.reply("Maaf, daftar perintah belum diatur di Sanity.");
            }
        }
        // ▲▲▲ BATAS AKHIR BLOK BARU ▲▲▲

        // ▼▼▼ TAMBAHKAN BLOK BARU UNTUK SIMPAN FILE DI SINI ▼▼▼
        const simpanPrefix = 'panda simpan ';
        if (userMessageLower.startsWith(simpanPrefix)) {
            // Pemeriksaan 1: Apakah ini sebuah balasan?
            if (!message.hasQuotedMsg) {
                return message.reply('❌ Perintah ini hanya berfungsi jika Anda membalas file yang ingin disimpan.');
            }

            const quotedMsg = await message.getQuotedMessage();

            // Pemeriksaan 2: Apakah yang dibalas adalah file?
            if (!quotedMsg.hasMedia) {
                return message.reply('❌ Anda harus membalas sebuah file (PDF, Dokumen, Gambar), bukan pesan teks.');
            }

            const namaFile = userMessage.substring(simpanPrefix.length).trim();

            // Pemeriksaan 3: Apakah nama file diberikan?
            if (!namaFile) {
                return message.reply('❌ Silakan berikan nama untuk file Anda.\nContoh: `panda simpan Laporan Keuangan`');
            }

            try {
                message.reply('⏳ Sedang memproses, mohon tunggu...');
                const media = await quotedMsg.downloadMedia();
                
                // Langkah 1: Upload ke Google Drive
                const driveId = await uploadKeDrive(media, namaFile);
                if (!driveId) {
                    return message.reply(' Gagal mengunggah file ke Google Drive.');
                }

                // Langkah 2: Simpan informasi ke Sanity
                const contact = await message.getContact();
                const dataFile = {
                    namaFile: namaFile,
                    googleDriveId: driveId,
                    diunggahOleh: contact.pushname || message.author,
                    groupId: chat.isGroup ? chat.id._serialized : 'pribadi',
                    tipeFile: media.mimetype,
                };
                await simpanDataFileKeSanity(dataFile);

                return message.reply(`✅ Berhasil! File dengan nama *"${namaFile}"* telah diarsipkan.`);

            } catch (error) {
                console.error("Error di blok simpan file:", error);
                return message.reply(' Gagal memproses file. Terjadi kesalahan tak terduga.');
            }

        }
        // ▲▲▲ BATAS AKHIR BLOK BARU SIMPAN FILE▲▲▲

// ▼▼▼ BLOK BARU UNTUK MENCARI & MENGIRIM FILE ▼▼▼
        const cariPrefix = 'cari file ';
        if (userMessageLower.startsWith(cariPrefix)) {
            const kataKunci = userMessage.substring(cariPrefix.length).trim();
            if (!kataKunci) {
                return message.reply('Silakan masukkan kata kunci. Contoh: `cari file laporan`');
            }

            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            const hasilPencarian = await cariFileDiSanity(kataKunci, groupId);

            if (hasilPencarian.length === 0) {
                return message.reply(`Tidak ada file yang ditemukan dengan kata kunci "${kataKunci}" di arsip grup ini.`);
            }

            let replyMessage = `Ditemukan ${hasilPencarian.length} file:\n\n`;
            hasilPencarian.forEach(file => {
                replyMessage += `📄 *${file.namaFile}*\n`;
            });
            replyMessage += `\nUntuk mengambil, balas dengan:\n\`kirim file <nama file lengkap>\``;
            return message.reply(replyMessage);
        }

        const kirimPrefix = 'kirim file ';
        if (userMessageLower.startsWith(kirimPrefix)) {
            const namaFile = userMessage.substring(kirimPrefix.length).trim();
            if (!namaFile) {
                return message.reply('Silakan masukkan nama file lengkap. Contoh: `kirim file Laporan Keuangan 2025`');
            }

            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            
            // Query untuk mencari nama file yang persis
            const query = `*[_type == "fileArsip" && namaFile == $namaFile && groupId == $groupId][0]`;
            const fileData = await clientSanity.fetch(query, { namaFile, groupId });

            if (!fileData) {
                return message.reply(`File dengan nama persis "${namaFile}" tidak ditemukan di arsip grup ini.`);
            }
            
            message.reply(`⏳ Sedang mengambil file *"${namaFile}"* dari arsip, mohon tunggu...`);
            await kirimFileDariDrive(fileData.googleDriveId, fileData.namaFile, message.from);
            return;
        }
        // ▲▲▲ BATAS AKHIR BLOK BARU  PEMANGGIL FILE▲▲▲

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
                let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* ${pegawai.nip || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}`;
                if (pegawai.tipePegawai === 'admin') {
                    detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* ${pegawai.userRakortek || '-'}\n*User Renstra:* ${pegawai.sipdRenstra || '-'}\n*Password Renstra:* ${pegawai.passRenstra || '-'}`;
                }
                return message.reply(detailMessage);
            }
            userState[message.from] = { type: 'pegawai', list: pegawaiDitemukan };
            let pilihanMessage = `Ditemukan beberapa hasil untuk "${kataKunci}". Balas dengan *nomor*:\n\n`;
            pegawaiDitemukan.forEach((p, i) => { pilihanMessage += `${i + 1}. ${p.nama} - *(${p.jabatan})*\n`; });
            return message.reply(pilihanMessage);
        }
        
        const aiTriggerCommands = [
            'tanya ai', 
            'mode ai', 
            'sesi ai', 
            'panda ai',
            'halo panda ai',
            'mulai sesi ai',
            'halo, saya ingin memulai sesi ai' // Pastikan ini diketik bersih
        ];
if (!chat.isGroup && aiTriggerCommands.includes(userMessageLower)) {
    await chat.sendStateTyping();

    // ▼▼▼ BAGIAN BARU: MENGAMBIL MEMORI JANGKA PANJANG ▼▼▼
    let initialHistory = []; // Siapkan history kosong
    try {
        const userId = message.from;
        const sanitizedId = userId.replace(/[@.]/g, '-'); // <-- TAMBAHKAN BARIS INI
        const memoryQuery = `*[_type == "memoriPengguna" && _id == $id][0]`; // <-- UBAH QUERY-NYA
        const memoryDoc = await clientSanity.fetch(memoryQuery, { id: sanitizedId }); // <-- GUNAKAN ID BERSIH
        
        // Cek jika ada memori yang tersimpan untuk user ini
        if (memoryDoc && memoryDoc.daftarMemori && memoryDoc.daftarMemori.length > 0) {
            const longTermMemories = memoryDoc.daftarMemori;
            
            // Buat 'contekan' awal untuk AI dari memori yang ada
            let memoryContext = "Berikut adalah beberapa fakta penting yang harus kamu ingat tentang pengguna ini:\n";
            longTermMemories.forEach(fact => {
                memoryContext += `- ${fact}\n`;
            });

            // Masukkan contekan ini sebagai pesan pertama dalam sejarah percakapan
            initialHistory.push({ role: "user", parts: [{ text: `(Sistem: Kamu harus mengingat konteks berikut tentang saya: ${memoryContext})` }] });
            initialHistory.push({ role: "model", parts: [{ text: "Tentu, saya sudah mengingatnya. Siap untuk memulai percakapan." }] });
            
            console.log(`INFO: Memuat ${longTermMemories.length} memori untuk user ${message.from}`);
        }
        } catch (error) {
            console.error("Gagal mengambil memori jangka panjang:", error);
            // Jika gagal, tidak apa-apa, sesi akan dimulai tanpa memori
        }
        // ▲▲▲ AKHIR BAGIAN BARU ▲▲▲

        // Inisialisasi state dengan history yang mungkin sudah berisi memori
        userState[message.from] = { type: 'ai_mode', history: initialHistory };
        
        // Kirim pesan selamat datang seperti biasa
        const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "salam_sesi_ai"][0]`);
        const welcomeMessage = result ? result.jawaban : "Sesi AI dimulai. Silakan bertanya. Ketik 'selesai' untuk berhenti.";
        message.reply(welcomeMessage);
        
        return;
    }

// BLOK 3: MENANGANI PILIHAN MENU NUMERIK

        // ▼▼▼ TAMBAHKAN BLOK PENJAGA INI ▼▼▼
        if (userLastState && (userLastState.type === 'menu_utama' || userLastState.type === 'pustaka_data' || userLastState.type === 'pegawai')) {
            if (message.hasMedia) {
                // Pengguna mengirim file saat bot sedang dalam mode menu. Abaikan saja.
                return;
            }
        }
        // ▲▲▲ BATAS AKHIR BLOK PENJAGA ▲▲▲

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
                        let detailMessage = `📄 *Detail Dokumen*\n\n*Nama:* ${selectedItem.namaDokumen}\n*Tahun:* ${selectedItem.tahunDokumen || '-'}\n*Deskripsi:* ${selectedItem.deskripsi || '-'}\n\n*Link:* ${selectedItem.linkDokumen}`;
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
                            const nomorBot = '6287849305181'; // <-- GANTI DENGAN NOMOR BOT ANDA YANG BENAR
                            const teksOtomatis = encodeURIComponent("Halo, saya ingin memulai sesi AI");
                            const linkWa = `https://wa.me/${nomorBot}?text=${teksOtomatis}`;
                            const replyMessage = `Untuk memulai sesi privat dengan Asisten AI, silakan klik link di bawah ini. Anda akan diarahkan ke chat pribadi dengan saya.\n\n${linkWa}`;
                            message.reply(replyMessage);
                        }else if (selectedItem.perintahKhusus === 'tampilkan_petunjuk_user_sipd') {
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
// akhir kode message


// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();