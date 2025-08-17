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
const axios = require('axios');
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
 * Jika berhasil, mengembalikan string deskripsi cuaca.
 * Jika gagal, akan melempar (throw) sebuah error.
 * @param {string} location Nama kota untuk dicari cuacanya.
 * @returns {Promise<string>} String yang mendeskripsikan cuaca.
 */
async function getCurrentWeather(location) {
    try {
        console.log(`Mencari cuaca untuk: ${location}`);
        const apiKey = process.env.OPENWEATHER_API_KEY;
        if (!apiKey) {
            throw new Error("OPENWEATHER_API_KEY tidak ditemukan di environment variables.");
        }

        const url = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=metric&lang=id`;
        
        const response = await fetch(url);
        
        // Jika respons tidak sukses (misal: 404 Not Found, 401 Unauthorized)
        if (!response.ok) {
            // Lemparkan error agar ditangkap oleh blok catch di logika interaksi.
            // Ini akan mencegah masalah balasan ganda.
            throw new Error(`Lokasi tidak ditemukan atau terjadi kesalahan API (Status: ${response.status})`);
        }
        
        const data = await response.json();
        
        const weatherDescription = `Cuaca di ${data.name}: ${data.weather[0].description}, suhu ${data.main.temp}°C, terasa seperti ${data.main.feels_like}°C.`;
        return weatherDescription;

    } catch (error) {
        console.error("Error di dalam fungsi getCurrentWeather:", error.message);
        // Lemparkan kembali error tersebut agar bisa ditangani oleh kode yang memanggil fungsi ini.
        throw error;
    }
}

// ▼▼▼ FUNGSI BERITA ▼▼▼

/**
 * Mengambil berita utama terkini dari NewsAPI.org.
 * Jika berhasil, mengembalikan string daftar berita.
 * Jika gagal, akan melempar (throw) sebuah error.
 * @param {string} query Topik berita yang ingin dicari.
 * @returns {Promise<string>} String berisi daftar judul berita.
 */
async function getLatestNews(query) {
    try {
        console.log(`Mencari berita untuk query: ${query}`);
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            throw new Error("NEWS_API_KEY tidak ditemukan di environment variables.");
        }

        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${apiKey}&pageSize=5&sortBy=publishedAt&language=id`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Gagal mengambil data dari NewsAPI (Status: ${response.status})`);
        }
        
        const data = await response.json();
        
        if (data.articles.length === 0) {
            return `Maaf, tidak ada berita yang ditemukan untuk topik "${query}".`;
        }

        let newsDescription = `Berikut 5 berita teratas terkait "${query}":\n\n`;
        data.articles.forEach((article, index) => {
            newsDescription += `*${index + 1}. ${article.title}*\n`;
            newsDescription += `  - _Sumber: ${article.source.name}_\n`;
        });
        return newsDescription;
        
    } catch (error) {
        console.error("Error di dalam fungsi getLatestNews:", error.message);
        throw error;
    }
}

// ▼▼▼ TAMBAHKAN FUNGSI BARU INI admin ▼▼▼

/**
 * Memeriksa apakah seorang pengguna adalah admin berdasarkan datanya di Sanity.
 * @param {string} userId ID WhatsApp pengguna (misal: "62812...@c.us").
 * @returns {Promise<boolean>} Mengembalikan true jika admin, false jika bukan.
 */
async function isAdmin(userId) {
    try {
        const sanitizedId = userId.replace(/[@.]/g, '-');
        const query = `*[_type == "pegawai" && _id == $id][0]`;
        const user = await clientSanity.fetch(query, { id: sanitizedId });

        if (user && user.tipePegawai === 'admin') {
            return true;
        }
        return false;

    } catch (error) {
        console.error("Error saat memeriksa status admin:", error);
        return false;
    }
}

// ▲▲▲ AKHIR DARI FUNGSI BARU admin ▲▲▲

// ▼▼▼ TAMBAHKAN FUNGSI BARU INI ▼▼▼

/**
 * Mengambil data gempa bumi terkini dari API publik BMKG.
 * @returns {Promise<string>} String berisi informasi gempa terkini.
 */
async function getInfoGempa() {
    try {
        const url = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Gagal mengambil data dari BMKG (Status: ${response.status})`);
        }

        const data = await response.json();
        const gempa = data.Infogempa.gempa;

        const waktu = `${gempa.Tanggal}, ${gempa.Jam}`;
        const magnitudo = gempa.Magnitude;
        const kedalaman = gempa.Kedalaman;
        const lokasi = `${gempa.Wilayah} | Koordinat: ${gempa.Lintang}, ${gempa.Bujur}`;
        const potensi = gempa.Potensi;
        const arahan = gempa.Dirasakan;

        let gempaMessage = `⚠️ *Info Gempa Bumi Terkini (BMKG)*\n\n`;
        gempaMessage += `*Waktu:* ${waktu}\n`;
        gempaMessage += `*Magnitudo:* ${magnitudo} SR\n`;
        gempaMessage += `*Kedalaman:* ${kedalaman}\n`;
        gempaMessage += `*Lokasi:* ${lokasi}\n`;
        gempaMessage += `*Potensi:* ${potensi}\n\n`;
        gempaMessage += `*Arahan:* ${arahan}`;

        return gempaMessage;

    } catch (error) {
        console.error("Error di dalam fungsi getInfoGempa:", error.message);
        throw error; // Lemparkan error agar ditangani logika interaksi
    }
}

// ▲▲▲ AKHIR DARI FUNGSI BARU ▲▲▲

// ▲▲▲ AKHIR DARI KODE PENGGANTI ▲▲▲

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

            // ▼▼▼ PASTE BLOK BARU INI DI TEMPAT YANG SAMA ▼▼▼
            // BLOK BARU: MENYIMPAN MEMORI JANGKA PANJANG (VERSI PERBAIKAN)
            const memoryTriggers = ['ingat ini:', 'ingat saya:'];
            const trigger = memoryTriggers.find(t => userMessageLower.startsWith(t));

            if (trigger) {
                const memoryToSave = userMessage.substring(trigger.length).trim();

                if (!memoryToSave) {
                    message.reply("Silakan berikan informasi yang ingin saya ingat.\nContoh: `ingat ini: saya suka kopi hitam`");
                    return;
                }

                try {
                    const userId = message.from;
                    const sanitizedId = userId.replace(/[@.]/g, '-');
                    const contact = await message.getContact();
                    const userName = contact.pushname || userId;

                    // LANGKAH 1: Pastikan dokumen untuk user ini sudah ada.
                    await clientSanity.createIfNotExists({
                        _id: sanitizedId,
                        _type: 'memoriPengguna',
                        userId: userId,
                        namaPengguna: userName,
                        daftarMemori: []
                    });

                    // LANGKAH 2: Setelah dokumen dijamin ada, tambahkan memori baru.
                    await clientSanity
                        .patch(sanitizedId)
                        .append('daftarMemori', [memoryToSave])
                        .commit({ autoGenerateArrayKeys: true });

                    message.reply("Baik, saya akan mengingatnya.");
                    console.log(`Memori baru disimpan untuk user ${userName}: "${memoryToSave}"`);

                } catch (error) {
                    console.error("Gagal menyimpan memori ke Sanity:", error);
                    message.reply("Maaf, terjadi kesalahan saat saya mencoba mengingat informasi ini.");
                }
                return; // Hentikan proses agar tidak dikirim ke AI
            }
            // ▲▲▲ AKHIR BLOK BARU ▲▲▲

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

                let detailMessage = `👤 *Profil Pegawai*\n\n`;
                detailMessage += `*Nama:* ${pegawai.nama || '-'}\n`;
                detailMessage += `*NIP:* \`\`\`${pegawai.nip || '-'}\`\`\`\n`;
                detailMessage += `*Jabatan:* ${pegawai.jabatan || '-'}\n`;
                detailMessage += `*Level:* ${pegawai.tipePegawai || 'user'}\n\n`;

                detailMessage += `🔑 *Akun & Kredensial*\n`;
                detailMessage += `*Username SIPD:* \`\`\`${pegawai.usernameSipd || '-'}\`\`\`\n`;
                detailMessage += `*Password SIPD:* \`\`\`${pegawai.passwordSipd || '-'}\`\`\`\n`;
                detailMessage += `*Password Penatausahaan:* \`\`\`${pegawai.passwordPenatausahaan || '-'}\`\`\`\n\n`;

                detailMessage += `📝 *Keterangan*\n${pegawai.keterangan || '-'}`;

                if (pegawai.tipePegawai === 'admin') {
                    detailMessage += `\n\n🛡️ *Data Khusus Admin*\n`;
                    detailMessage += `*User Rakortek:* \`\`\`${pegawai.userRakortek || '-'}\`\`\`\n`;
                    detailMessage += `*User Renstra:* \`\`\`${pegawai.sipdRenstra || '-'}\`\`\`\n`;
                    detailMessage += `*Password Renstra:* \`\`\`${pegawai.passRenstra || '-'}\`\`\``;
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
// GANTI BLOK aiTriggerCommands ANDA DENGAN YANG INI SECARA KESELURUHAN
if (!chat.isGroup && aiTriggerCommands.includes(userMessageLower)) {
    await chat.sendStateTyping();

    // ▼▼▼ BAGIAN BARU: MENGAMBIL MEMORI JANGKA PANJANG ▼▼▼
    let initialHistory = [];
    try {
        const userId = message.from;
        const sanitizedId = userId.replace(/[@.]/g, '-');
        const memoryQuery = `*[_type == "memoriPengguna" && _id == $id][0]`;
        const memoryDoc = await clientSanity.fetch(memoryQuery, { id: sanitizedId });

        if (memoryDoc && memoryDoc.daftarMemori && memoryDoc.daftarMemori.length > 0) {
            const longTermMemories = memoryDoc.daftarMemori;
            
            let memoryContext = "Ini adalah beberapa fakta penting tentang saya (pengguna) yang harus selalu kamu ingat di sepanjang percakapan ini:\n";
            longTermMemories.forEach(fact => {
                memoryContext += `- ${fact}\n`;
            });

            // Masukkan konteks ini sebagai "instruksi sistem" di awal sejarah percakapan
            initialHistory.push({ role: "user", parts: [{ text: memoryContext }] });
            initialHistory.push({ role: "model", parts: [{ text: "Baik, saya telah menerima dan mengingat semua fakta tersebut. Saya siap untuk memulai percakapan." }] });
            
            console.log(`INFO: Memuat ${longTermMemories.length} memori untuk user ${userId}`);
        }
    } catch (error) {
        console.error("Gagal mengambil memori jangka panjang:", error);
    }
    // ▲▲▲ AKHIR BAGIAN BARU ▲▲▲

    // Inisialisasi state dengan history yang mungkin sudah berisi memori
    userState[message.from] = { type: 'ai_mode', history: initialHistory };
    
    const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "salam_sesi_ai"][0]`);
    const welcomeMessage = result ? result.jawaban : "Sesi AI dimulai. Silakan bertanya. Ketik 'selesai' untuk berhenti.";
    message.reply(welcomeMessage);
    
    return;
}

        // BLOK 3: MENANGANI PILIHAN MENU NUMERIK

        // BLOK BARU: MENAMBAH PEGAWAI DENGAN PANDUAN OTOMATIS
        if (userMessageLower.startsWith('tambah pegawai')) {
            // BAGIAN INI SENGAJA DINONAKTIFKAN SEMENTARA UNTUK MENDAFTARKAN ADMIN PERTAMA
            const isUserAdmin = await isAdmin(message.from);
            if (!isUserAdmin) {
                message.reply('🔒 Maaf, hanya admin yang dapat menggunakan perintah ini.');
                return;
            }

            const argsString = userMessage.substring('tambah pegawai'.length).trim();
            if (!argsString) {
                // ... (bagian panduan tetap sama, tidak perlu diubah) ...
                let panduanMessage = `📝 *Panduan Menambah Pegawai Baru*\n\n`;
                panduanMessage += `Gunakan format berikut dengan data dipisahkan oleh koma:\n`;
                panduanMessage += `\`\`\`tambah pegawai <Nama>, <NIP>, <Jabatan>, <Level>\`\`\`\n\n`;
                panduanMessage += `*Contoh Penggunaan:*\n`;
                panduanMessage += `\`\`\`tambah pegawai Budi Santoso, 199001012020121001, Analis Data, user\`\`\`\n\n`;
                panduanMessage += `*Keterangan:*\n`;
                panduanMessage += `• *Nama:* Nama lengkap pegawai.\n`;
                panduanMessage += `• *NIP:* Jika tidak ada, isi dengan \`-\` atau \`0\`.\n`;
                panduanMessage += `• *Jabatan:* Posisi pegawai.\n`;
                panduanMessage += `• *Level:* Hak akses, harus \`user\` atau \`admin\`.`;
                message.reply(panduanMessage);
                return;
            }

            message.reply('⏳ Memproses data, mohon tunggu...');
            try {
                const args = argsString.split(',').map(arg => arg.trim());
                if (args.length !== 4) {
                    message.reply('Format salah. Jumlah argumen tidak sesuai. Ketik `tambah pegawai` untuk melihat panduan.');
                    return;
                }

                const [nama, nip, jabatan, level] = args;
                const levelLower = level.toLowerCase();
                if (levelLower !== 'user' && levelLower !== 'admin') {
                    message.reply('Format salah. Nilai <Level> harus `user` atau `admin`.');
                    return;
                }

                // --- PERBAIKAN UTAMA ADA DI SINI ---
                // Membuat ID Dokumen dari nomor HP pengirim
                const sanitizedId = message.from.replace(/[@.]/g, '-');

                const newPegawaiDoc = {
                    _id: sanitizedId, // Secara eksplisit mengatur ID Dokumen
                    _type: 'pegawai',
                    nama: nama,
                    nip: nip,
                    jabatan: jabatan,
                    tipePegawai: levelLower
                };

                // Menggunakan createOrReplace untuk memastikan data dibuat atau diperbarui dengan ID yang benar
                await clientSanity.createOrReplace(newPegawaiDoc);
                message.reply(`✅ Pegawai baru dengan nama *${nama}* berhasil ditambahkan/diperbarui.`);

            } catch (error) {
                console.error("Gagal menambah pegawai baru:", error);
                message.reply("Maaf, terjadi kesalahan di server saat mencoba menambah pegawai.");
            }
            return;
        }

        // ▲▲▲ AKHIR DARI KODE PENGGANTI  admin▲▲▲

// ▼▼▼ TAMBAHKAN BLOK BARU INI ▼▼▼

        // BLOK BARU: FITUR INFO GEMPA BMKG
        // BLOK BARU: FITUR INFO GEMPA BMKG (PERBAIKAN URUTAN)
        if (userMessageLower === 'gempa' || userMessageLower === 'info gempa') {
            // LANGKAH 1: Kirim pesan "sedang mencari" terlebih dahulu.
            message.reply('⏳ Sedang mengambil data gempa terkini dari BMKG, mohon tunggu...');
            
            // LANGKAH 2: Baru ambil datanya dan kirim hasilnya.
            try {
                const gempaResult = await getInfoGempa(); 
                message.reply(gempaResult);
            } catch (error) {
                console.error("Gagal mengambil data gempa di blok interaksi:", error.message);
                message.reply("Maaf, terjadi kesalahan saat mengambil data gempa dari BMKG.");
            }
            return;
        }

        // ▲▲▲ AKHIR DARI BLOK GEMPA ▲▲▲

        // ▼▼▼ TAMBAHKAN BLOK BERITA ▼▼▼

        // BLOK BARU: FITUR BERITA INTERAKTIF
        // Bagian 1: Memicu permintaan berita
        if (userMessageLower === 'berita') {
            userState[message.from] = { type: 'menunggu_topik_berita' };
            message.reply('Tentu. Anda ingin mencari berita tentang topik apa?');
            return;
        }

        // Bagian 2: Menangkap topik, lalu bertanya lokasi
        if (userLastState && userLastState.type === 'menunggu_topik_berita') {
            const topik = userMessage;
            userState[message.from] = { type: 'menunggu_lokasi_berita', topik: topik };
            message.reply(`Baik, topik "${topik}". Apakah ada lokasi spesifik (kota/daerah) yang ingin disertakan? Balas dengan nama lokasi, atau ketik "nasional" untuk berita umum.`);
            return;
        }

        // Bagian 3: Menangkap lokasi, menggabungkan query, dan mencari berita
        if (userLastState && userLastState.type === 'menunggu_lokasi_berita') {
            const lokasi = userMessage.toLowerCase();
            const topik = userLastState.topik;
            
            let finalQuery = topik;
            if (lokasi !== 'nasional') {
                finalQuery = `${topik} AND ${lokasi}`;
            }

            message.reply(`⏳ Sedang mencari berita tentang *"${topik}"* ${lokasi !== 'nasional' ? `di *${lokasi}*` : ''}, mohon tunggu...`);
            
            try {
                const newsResult = await getLatestNews(finalQuery); 
                message.reply(newsResult);
            } catch (error) {
                console.error("Gagal mengambil data berita di blok interaksi:", error.message);
                message.reply("Maaf, terjadi kesalahan saat mengambil data berita. Pastikan API Key sudah benar.");
            }
            
            delete userState[message.from];
            return;
        }

        // ▲▲▲ AKHIR DARI BLOK BERITA ▲▲▲

        // ▼▼▼ TAMBAHKAN BLOK BARU INI ▼▼▼

        // BLOK BARU: FITUR CUACA INTERAKTIF
        // Bagian 1: Memicu permintaan cuaca
        if (userMessageLower === 'cuaca') {
            userState[message.from] = { type: 'menunggu_lokasi_cuaca' };
            message.reply('Tentu, ingin tahu prakiraan cuaca di kota atau daerah mana?');
            return;
        }

        // Bagian 2: Menangani jawaban lokasi dari pengguna dan MEMANGGIL FUNGSI ANDA
        if (userLastState && userLastState.type === 'menunggu_lokasi_cuaca') {
            const lokasi = userMessage;
            message.reply(`⏳ Sedang mencari prakiraan cuaca untuk *${lokasi}*, mohon tunggu...`);

            // Memanggil fungsi `getCurrentWeather` Anda yang sudah ada!
            const weatherResult = await getCurrentWeather(lokasi); 

            message.reply(weatherResult);

            delete userState[message.from]; // Hapus state setelah selesai
            return;
        }

        // ▲▲▲ AKHIR DARI BLOK BARU  CUACA▲▲▲



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

                        let detailMessage = `👤 *Profil Pegawai*\n\n`;
                        detailMessage += `*Nama:* ${pegawai.nama || '-'}\n`;
                        detailMessage += `*NIP:* \`\`\`${pegawai.nip || '-'}\`\`\`\n`;
                        detailMessage += `*Jabatan:* ${pegawai.jabatan || '-'}\n`;
                        detailMessage += `*Level:* ${pegawai.tipePegawai || 'user'}\n\n`;

                        detailMessage += `🔑 *Akun & Kredensial*\n`;
                        detailMessage += `*Username SIPD:* \`\`\`${pegawai.usernameSipd || '-'}\`\`\`\n`;
                        detailMessage += `*Password SIPD:* \`\`\`${pegawai.passwordSipd || '-'}\`\`\`\n`;
                        detailMessage += `*Password Penatausahaan:* \`\`\`${pegawai.passwordPenatausahaan || '-'}\`\`\`\n\n`;

                        detailMessage += `📝 *Keterangan*\n${pegawai.keterangan || '-'}`;

                        if (pegawai.tipePegawai === 'admin') {
                            detailMessage += `\n\n🛡️ *Data Khusus Admin*\n`;
                            detailMessage += `*User Rakortek:* \`\`\`${pegawai.userRakortek || '-'}\`\`\`\n`;
                            detailMessage += `*User Renstra:* \`\`\`${pegawai.sipdRenstra || '-'}\`\`\`\n`;
                            detailMessage += `*Password Renstra:* \`\`\`${pegawai.passRenstra || '-'}\`\`\``;
                        }

                        message.reply(detailMessage);
                        delete userState[message.from];
                        return;
                    }else if (userLastState.type === 'menu_utama') {
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