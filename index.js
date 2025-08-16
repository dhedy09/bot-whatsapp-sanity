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

        // =================================================================
        // PRIORITAS #1: PERINTAH-PERINTAH KHUSUS
        // =================================================================

        if (userMessageLower === 'halo panda') {
            await showMainMenu(message);
            return;
        }

        const commandKeywords = ['help', 'menu bantuan'];
        if (commandKeywords.includes(userMessageLower)) {
            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "daftar_perintah"][0]`);
            return message.reply(result ? result.jawaban : "Daftar perintah belum diatur.");
        }

        const rememberPrefix = 'ingat ini:';
        if (userMessageLower.startsWith(rememberPrefix)) {
            const factToRemember = userMessage.substring(rememberPrefix.length).trim();
            if (!factToRemember) return message.reply('Silakan berikan fakta yang harus diingat.');
            
            const userId = message.from;
            const contact = await message.getContact();
            const userName = contact.pushname || contact.name || 'Pengguna';
            try {
                const query = '*[_type == "memoriPengguna" && userId == $userId][0]';
                const existingDoc = await clientSanity.fetch(query, { userId });
                if (existingDoc) {
                    await clientSanity.patch(existingDoc._id).append('daftarMemori', [factToRemember]).commit({ autoGenerateArrayKeys: true });
                } else {
                    const newDoc = { _type: 'memoriPengguna', userId, namaPengguna: userName, daftarMemori: [factToRemember] };
                    await clientSanity.create(newDoc);
                }
                return message.reply('👍 Baik, sudah saya ingat.');
            } catch (error) {
                console.error('Gagal menyimpan memori ke Sanity:', error);
                return message.reply('Maaf, ada kesalahan. Saya gagal mengingat fakta tersebut.');
            }
        }

        const simpanPrefix = 'panda simpan ';
        if (userMessageLower.startsWith(simpanPrefix)) {
            if (!message.hasQuotedMsg) return message.reply('❌ Perintah ini hanya berfungsi jika Anda membalas file yang ingin disimpan.');
            const quotedMsg = await message.getQuotedMessage();
            if (!quotedMsg.hasMedia) return message.reply('❌ Anda harus membalas sebuah file, bukan pesan teks.');
            const namaFile = userMessage.substring(simpanPrefix.length).trim();
            if (!namaFile) return message.reply('❌ Silakan berikan nama untuk file Anda.');
            
            try {
                message.reply('⏳ Sedang memproses, mohon tunggu...');
                const media = await quotedMsg.downloadMedia();
                const driveId = await uploadKeDrive(media, namaFile);
                if (!driveId) return message.reply(' Gagal mengunggah file ke Google Drive.');
                
                const contact = await message.getContact();
                const dataFile = {
                    namaFile: namaFile,
                    googleDriveId: driveId,
                    diunggahOleh: contact.pushname || message.author,
                    groupId: chat.isGroup ? chat.id._serialized : 'pribadi',
                    tipeFile: media.mimetype,
                };
                await simpanDataFileKeSanity(dataFile);
                return message.reply(`✅ Berhasil! File *"${namaFile}"* telah diarsipkan.`);
            } catch (error) {
                console.error("Error di blok simpan file:", error);
                return message.reply(' Gagal memproses file.');
            }
        }
        
        const cariPrefix = 'cari file ';
        if (userMessageLower.startsWith(cariPrefix)) {
            const kataKunci = userMessage.substring(cariPrefix.length).trim();
            if (!kataKunci) return message.reply('Silakan masukkan kata kunci.');
            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            const hasilPencarian = await cariFileDiSanity(kataKunci, groupId);
            if (hasilPencarian.length === 0) return message.reply(`Tidak ada file ditemukan dengan kata kunci "${kataKunci}".`);
            
            let replyMessage = `Ditemukan ${hasilPencarian.length} file:\n\n`;
            hasilPencarian.forEach(file => { replyMessage += `📄 *${file.namaFile}*\n`; });
            replyMessage += `\nUntuk mengambil, balas:\n\`kirim file <nama file lengkap>\``;
            return message.reply(replyMessage);
        }

        const kirimPrefix = 'kirim file ';
        if (userMessageLower.startsWith(kirimPrefix)) {
            const namaFile = userMessage.substring(kirimPrefix.length).trim();
            if (!namaFile) return message.reply('Silakan masukkan nama file lengkap.');
            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            const query = `*[_type == "fileArsip" && namaFile == $namaFile && groupId == $groupId][0]`;
            const fileData = await clientSanity.fetch(query, { namaFile, groupId });
            if (!fileData) return message.reply(`File dengan nama persis "${namaFile}" tidak ditemukan.`);
            
            message.reply(`⏳ Mengambil file *"${namaFile}"*...`);
            await kirimFileDariDrive(fileData.googleDriveId, fileData.namaFile, message.from);
            return;
        }

        if (userMessageLower.startsWith('cari user ')) {
            const kataKunci = userMessage.substring('cari user '.length).trim();
            if (!kataKunci) return message.reply('Silakan masukkan nama atau jabatan.');
            const pegawaiQuery = `*[_type == "pegawai" && (nama match $kataKunci || jabatan match $kataKunci)]`;
            const pegawaiDitemukan = await clientSanity.fetch(pegawaiQuery, { kataKunci: `*${kataKunci}*` });
            if (!pegawaiDitemukan || pegawaiDitemukan.length === 0) return message.reply(`Data untuk "${kataKunci}" tidak ditemukan.`);
            
            if (pegawaiDitemukan.length === 1) {
                const pegawai = pegawaiDitemukan[0];
                let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*Jabatan:* ${pegawai.jabatan || '-'}`;
                if (pegawai.usernameSipd) detailMessage += `\n*Username SIPD:* ${pegawai.usernameSipd}`;
                if (pegawai.tipePegawai === 'admin') {
                    if (pegawai.passwordSipd) detailMessage += `\n*Password SIPD:* ${pegawai.passwordSipd}`;
                    if (pegawai.passwordPenatausahaan) detailMessage += `\n*Pass Penatausahaan:* ${pegawai.passwordPenatausahaan}`;
                    if (pegawai.userRakortek) detailMessage += `\n*User Rakortek:* ${pegawai.userRakortek}`;
                    if (pegawai.sipdRenstra) detailMessage += `\n*User Renstra:* ${pegawai.sipdRenstra}`;
                    if (pegawai.passRenstra) detailMessage += `\n*Password Renstra:* ${pegawai.passRenstra}`;
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
            const memoryQuery = '*[_type == "memoriPengguna" && userId == $userId][0]';
            const memoryDoc = await clientSanity.fetch(memoryQuery, { userId: message.from });
            const longTermMemories = memoryDoc ? memoryDoc.daftarMemori : [];
            let systemPromptText = "Anda adalah Panda, asisten AI yang membantu dan ramah..."; // Isi prompt lengkap Anda
            if (longTermMemories.length > 0) {
                systemPromptText += `\n\nIngat fakta ini tentang pengguna: ${longTermMemories.join('; ')}.`;
            }
            const initialHistory = [{ role: 'user', parts: [{ text: `(System Prompt: ${systemPromptText})` }] }, { role: 'model', parts: [{ text: 'Tentu, saya siap.' }] }];
            
            userState[message.from] = { type: 'ai_mode', history: initialHistory };
            
            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "salam_sesi_ai"][0]`);
            const welcomeMessage = result ? result.jawaban : "Sesi AI dimulai. Ketik 'selesai' untuk berhenti.";
            
            message.reply(welcomeMessage);
            return;
        }


        // =================================================================
        // PRIORITAS #2: PENANGANAN BERBASIS STATE (AI & MENU)
        // =================================================================

        if (userLastState) {
            if (userLastState.type === 'ai_mode') {
                const exitCommands = ['selesai', 'stop', 'exit', 'keluar'];
                if (exitCommands.includes(userMessageLower)) {
                    delete userState[message.from];
                    await showMainMenu(message);
                    return message.reply('Sesi AI telah berakhir.');
                }
                const aiResponse = await getGeminiResponse(userMessage, userLastState.history);
                userLastState.history.push({ role: 'user', parts: [{ text: userMessage }] });
                userLastState.history.push({ role: 'model', parts: [{ text: aiResponse }] });
                return message.reply(aiResponse);
            }

            if (['menu_utama', 'pustaka_data', 'pegawai'].includes(userLastState.type)) {
                if (message.hasMedia) return;
                const isNumericChoice = !isNaN(parseInt(userMessage));
                if (!isNumericChoice) return;

                if (userMessage === '0') {
                    if (userLastState.type === 'pustaka_data' && userLastState.currentCategoryId) {
                        const parent = await clientSanity.fetch(`*[_type == "kategoriPustaka" && _id == "${userLastState.currentCategoryId}"][0]{"parentId": indukKategori._ref}`);
                        await showPustakaMenu(message, parent ? parent.parentId : null);
                    } else {
                        delete userState[message.from];
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
                        if (pegawai.usernameSipd) detailMessage += `\n*Username SIPD:* ${pegawai.usernameSipd}`;
                        if (pegawai.tipePegawai === 'admin') {
                            if (pegawai.passwordSipd) detailMessage += `\n*Password SIPD:* ${pegawai.passwordSipd}`;
                            if (pegawai.passwordPenatausahaan) detailMessage += `\n*Pass Penatausahaan:* ${pegawai.passwordPenatausahaan}`;
                            if (pegawai.userRakortek) detailMessage += `\n*User Rakortek:* ${pegawai.userRakortek}`;
                            if (pegawai.sipdRenstra) detailMessage += `\n*User Renstra:* ${pegawai.sipdRenstra}`;
                            if (pegawai.passRenstra) detailMessage += `\n*Password Renstra:* ${pegawai.passRenstra}`;
                        }
                        message.reply(detailMessage);
                        delete userState[message.from];
                    } else if (userLastState.type === 'menu_utama') {
                        if (selectedItem.tipeLink === 'kategori_pustaka') {
                            await showPustakaMenu(message, selectedItem.linkKategori?._ref || null);
                        } else if (selectedItem.tipeLink === 'perintah_khusus') {
                           if (selectedItem.perintahKhusus === 'mulai_sesi_ai') {
                                const nomorBot = '6287849305181'; // Ganti dengan nomor bot Anda
                                const teksOtomatis = encodeURIComponent("tanya ai");
                                const linkWa = `https://wa.me/${nomorBot}?text=${teksOtomatis}`;
                                message.reply(`Untuk memulai sesi privat, silakan klik link di bawah ini:\n\n${linkWa}`);
                           } else if (selectedItem.perintahKhusus === 'tampilkan_petunjuk_user_sipd') {
                                const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
                                if (result) {
                                    message.reply(result.jawaban + '\n\nBalas *0* untuk kembali.');
                                    userState[message.from] = { type: 'info', list: [] };
                                }
                           }
                        }
                    }
                    return;
                }
            }
        }
    } catch (error) {
        console.error('Terjadi error fatal di event message:', error);
        message.reply('Maaf, terjadi kesalahan tak terduga.');
    }
});
// akhir kode message


// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();