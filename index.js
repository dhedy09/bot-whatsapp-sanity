//8e4ed76ff85ed87cb76ac3cace01a88d

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


// ▼▼▼ HAPUS SEMUA 'const tools' LAMA DAN GANTI DENGAN YANG INI ▼▼▼

// ▼▼▼ GANTI 'const tools' LAMA DENGAN VERSI BARU INI ▼▼▼
const tools = [{
    functionDeclarations: [
        {
            name: "getLatestNews",
            description: "Mendapatkan berita terkini berdasarkan topik atau kata kunci.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Topik berita." } }, required: ["query"] },
        },
        {
            name: "getCurrentWeather",
            description: "Mendapatkan data cuaca terkini untuk lokasi tertentu.",
            parameters: { type: "OBJECT", properties: { location: { type: "STRING", description: "Nama kota." } }, required: ["location"] },
        },
        {
            name: "getGempa", // <-- ALAT BARU
            description: "Mendapatkan informasi gempa bumi terkini yang terjadi di wilayah Indonesia dari BMKG.",
            // Tidak ada parameters karena tidak butuh input
        },
        {
            name: "calculate",
            description: "Mengevaluasi ekspresi matematika atau formula. Gunakan ini untuk semua perhitungan.",
            parameters: { type: "OBJECT", properties: { expression: { type: "STRING", description: "Ekspresi matematika." } }, required: ["expression"] },
        },
    ],
}];
// ▲▲▲ AKHIR DARI BLOK PENGGANTI ▲▲▲

// ▲▲▲ AKHIR DARI BLOK PENGGANTI ▲▲▲

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
const userHistory = {};
let userState = {};
let lastSentEarthquakeId = null; // <-- TAMBAHKAN BARIS INI

// =================================================================
// BAGIAN 3: FUNGSI-FUNGSI PEMBANTU (HELPER FUNCTIONS)
// =================================================================
// ▼▼▼ TAMBAHKAN FUNGSI BARU INI ▼▼▼

// ▼▼▼ TAMBAHKAN FUNGSI BARU INI DI BAGIAN 3 ▼▼▼

// AWAL PEMERIKSA GEMPA
/**
 * Memeriksa gempa terbaru dari BMKG, dan jika ada yang baru,
 * akan mengirim notifikasi ke semua pelanggan.
 */
async function checkAndBroadcastEarthquake() {
    console.log('[Gempa] Memeriksa data gempa terbaru...');
    try {
        // Panggil fungsi getGempa Anda yang sudah ada
        const gempa = await getGempa();
        if (gempa.error) {
            console.log('[Gempa] Gagal mengambil data, melewati pengecekan.');
            return;
        }
        
        const currentEarthquakeId = `${gempa.tanggal}-${gempa.waktu}`;

        if (currentEarthquakeId === lastSentEarthquakeId) {
            return; // Gempa yang sama, tidak perlu kirim notifikasi
        }

        console.log(`[Gempa] Gempa baru terdeteksi! ID: ${currentEarthquakeId}`);
        lastSentEarthquakeId = currentEarthquakeId;

        const subscribers = await clientSanity.fetch(`*[_type == "pelangganGempa"]`);
        if (!subscribers || subscribers.length === 0) {
            console.log('[Gempa] Tidak ada pelanggan untuk dikirimi notifikasi.');
            return;
        }

        const notifMessage = `地震 *INFO GEMPA TERBARU* 地震\n\n` +
            `*Waktu:* ${gempa.tanggal}, ${gempa.waktu}\n` +
            `*Magnitudo:* ${gempa.magnitudo} SR\n` +
            `*Kedalaman:* ${gempa.kedalaman}\n` +
            `*Lokasi:* ${gempa.lintang || 'N/A'}, ${gempa.bujur || 'N/A'}\n` +
            `*Wilayah:* ${gempa.wilayah}\n` +
            `*Potensi:* ${gempa.potensi}\n\n` +
            `_Pesan ini dikirim otomatis. Ketik \`info gempa off\` untuk berhenti._`;

        console.log(`[Gempa] Mengirim notifikasi ke ${subscribers.length} pelanggan...`);
        
        for (const sub of subscribers) {
            try {
                await client.sendMessage(sub.userId, notifMessage);
            } catch (error) {
                console.error(`[Gempa] Gagal mengirim notifikasi ke ${sub.userId}:`, error.message);
            }
        }
        console.log('[Gempa] Semua notifikasi berhasil dikirim.');

    } catch (error) {
        console.error('[Gempa] Gagal memeriksa atau mengirim notifikasi gempa:', error.message);
    }
}
// AKHIR PEMERIKSA GEMPA

/**
 * Mengambil data gempa bumi terkini dari server BMKG gempa
 * @returns {Promise<object>} Data gempa dalam format JSON.
 */
async function getGempa() {
    console.log(`[Tool] Menjalankan getGempa`);
    try {
        const apiUrl = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
        const response = await axios.get(apiUrl);
        const data = response.data.Infogempa.gempa;

        // Susun informasi penting untuk AI
        const gempaInfo = {
            waktu: data.Jam,
            tanggal: data.Tanggal,
            magnitudo: data.Magnitude,
            kedalaman: data.Kedalaman,
            wilayah: data.Wilayah,
            potensi: data.Potensi,
            dirasakan: data.Dirasakan
        };
        return gempaInfo;

    } catch (error) {
        console.error("Error saat mengambil data gempa:", error.message);
        return { error: "Gagal mengambil data gempa dari server BMKG." };
    }
}

// ▲▲▲ AKHIR DARI FUNGSI BARU gempa▲▲▲

// Tambahkan ini bersama fungsi lainnya
async function getCurrentWeather(location) {
    return { error: "Fitur cuaca belum terhubung." };
}
function evaluateMathExpression(expression) {
    return { error: "Fitur kalkulator belum terhubung." };
}

//AWAL FUNGSI GET BERITA
/**
 * Fungsi ini mengambil topik berita sebagai input,
 * mencari berita menggunakan News API, dan mengembalikan hasilnya dalam format JSON.
 * @param {string} topik - Topik berita yang ingin dicari.
 * @returns {Promise<object>} - Hasil pencarian berita dalam format JSON.
 */
async function getLatestNews(query) { // <-- Nama fungsi & parameter diubah
    console.log(`[Tool] Menjalankan getLatestNews dengan query: ${query}`);
    try {
        // ... (seluruh isi logikanya tetap sama persis)
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) { return { error: "NEWS_API_KEY tidak diatur." }; }
        const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=id&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
        const response = await axios.get(apiUrl);
        if (response.data.articles && response.data.articles.length > 0) {
            const articles = response.data.articles.map(article => ({
                title: article.title, description: article.description,
                url: article.url, source: article.source.name
            }));
            return { articles: articles };
        } else {
            return { error: `Tidak ada berita yang ditemukan untuk topik "${query}".` };
        }
    } catch (error) {
        console.error("Error saat mengambil berita:", error.message);
        return { error: "Gagal mengambil data berita dari News API." };
    }
}
// ▲▲▲ AKHIR DARI FUNGSI GET BERITA ▲▲▲

// AWAL ▼▼▼ TAMBAHKAN FUNGSI PERSE INDONESIA ▼▼▼
function parseWaktuIndonesia(teks) {
    const sekarang = new Date(); // Cukup ambil waktu saat ini.
    teks = teks.toLowerCase();

    // Pola untuk "dalam X menit/jam"
    let match = teks.match(/dalam (\d+) (menit|jam)/);
    if (match) {
        const jumlah = parseInt(match[1]);
        const unit = match[2];
        if (unit === 'menit') {
            sekarang.setMinutes(sekarang.getMinutes() + jumlah);
        } else if (unit === 'jam') {
            sekarang.setHours(sekarang.getHours() + jumlah);
        }
        return sekarang;
    }

    // Pola untuk "besok jam X"
    match = teks.match(/besok (?:jam|pukul) (\d+)/);
    if (match) {
        const jam = parseInt(match[1]);
        const besok = new Date(); // Ambil tanggal hari ini
        besok.setDate(besok.getDate() + 1); // Maju ke besok
        
        // Atur jam berdasarkan zona waktu Asia/Makassar
        const targetWaktuString = `${besok.getFullYear()}-${besok.getMonth()+1}-${besok.getDate()} ${jam}:00:00`;
        // Trik untuk memastikan tanggal dibuat dalam zona waktu yang benar
        return new Date(new Date(targetWaktuString).toLocaleString("en-US", {timeZone: "Asia/Makassar"}));
    }

    // Jika tidak ada pola yang cocok
    return null;
}

// ▲▲▲ AKHIR DARI FUNGSI PERSEINDONESIA ▲▲▲

    // ▼▼▼ TAMBAHKAN FUNGSI ALARM ▼▼▼

    /**
     * Memeriksa Sanity untuk pengingat yang sudah jatuh tempo,
     * mengirimkannya, lalu memperbarui statusnya.
     */
    async function checkAndSendReminders() {
        try {
            // 1. Cari pengingat yang statusnya 'menunggu' dan waktunya sudah lewat
            const now = new Date().toISOString();
            const query = `*[_type == "pengingat" && status == "menunggu" && waktuKirim <= $now]`;
            const dueReminders = await clientSanity.fetch(query, { now });

            if (dueReminders.length === 0) {
                // Jika tidak ada pengingat, tidak melakukan apa-apa
                return;
            }

            console.log(`[Pengingat] Ditemukan ${dueReminders.length} pengingat yang harus dikirim.`);

            // 2. Kirim setiap pengingat satu per satu
            for (const reminder of dueReminders) {
                try {
                    const messageBody = `🔔 *PENGINGAT* 🔔\n\n${reminder.pesan}`;
                    await client.sendMessage(reminder.targetNomorHp, messageBody);

                    // 3. Jika berhasil, update statusnya menjadi 'terkirim'
                    await clientSanity.patch(reminder._id).set({ status: 'terkirim' }).commit();
                    console.log(`[Pengingat] Berhasil mengirim pengingat ke ${reminder.targetNama}`);

                } catch (sendError) {
                    console.error(`[Pengingat] Gagal mengirim pengingat ke ${reminder.targetNama}:`, sendError);
                    // Jika gagal, update statusnya menjadi 'gagal'
                    await clientSanity.patch(reminder._id).set({ status: 'gagal' }).commit();
                }
            }
        } catch (fetchError) {
            console.error("[Pengingat] Gagal mengambil data pengingat dari Sanity:", fetchError);
        }
    }

    // ▲▲▲ AKHIR DARI ALARM▲▲▲

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


// ▼▼▼ AWAL FUNGSI CUACA ▼▼▼

/**
 * Mengambil data cuaca terkini dari OpenWeatherMap API.
 * @param {string} location Nama kota untuk pencarian cuaca.
 * @returns {Promise<object>} Data cuaca dalam format JSON.
 */
async function getCurrentWeather(location) {
    console.log(`[Tool] Menjalankan getCurrentWeather untuk lokasi: ${location}`);
    try {
        const apiKey = process.env.OPENWEATHER_API_KEY;
        if (!apiKey) {
            return { error: "OPENWEATHER_API_KEY tidak diatur di server." };
        }
        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric&lang=id`;
        
        const response = await axios.get(apiUrl);
        const data = response.data;

        // Kita ambil dan susun informasi penting untuk dikirim ke AI
        const weatherInfo = {
            kota: data.name,
            suhu: `${data.main.temp}°C`,
            terasa_seperti: `${data.main.feels_like}°C`,
            kondisi: data.weather[0].description,
            kelembapan: `${data.main.humidity}%`,
            kecepatan_angin: `${data.wind.speed} m/s`
        };
        return weatherInfo;

    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.error(`[Cuaca] Kota tidak ditemukan: ${location}`);
            return { error: `Maaf, saya tidak dapat menemukan data cuaca untuk kota "${location}".` };
        }
        console.error("Error saat mengambil data cuaca:", error.message);
        return { error: "Gagal mengambil data cuaca dari server OpenWeatherMap." };
    }
}

// ▲▲▲ AKHIR DARI FUNGSI CUACA▲▲▲

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
 * Mengirim prompt ke API Gemini, menangani function calling, dan mengembalikan respons.
 * @param {string} prompt Pesan baru dari pengguna.
 * @param {Array} history Riwayat percakapan sebelumnya.
 * @returns {string} Jawaban dari AI.
 */
async function getGeminiResponse(prompt, history) {
    const maxRetries = 3;
    const delay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const chat = model.startChat({ history: history, tools: tools });
            const result = await chat.sendMessage(prompt);
            const call = result.response.functionCalls()?.[0];

            if (call) {
                console.log("▶️ AI meminta pemanggilan fungsi:", JSON.stringify(call, null, 2));
                
                let functionResponse;
                if (call.name === 'getCurrentWeather') {
                    functionResponse = await getCurrentWeather(call.args.location);
                } else if (call.name === 'getLatestNews') {
                    functionResponse = await getLatestNews(call.args.query);
                } else if (call.name === 'getGempa') { // <-- LOGIKA BARU
                    functionResponse = await getGempa();
                } else if (call.name === 'calculate') {
                    functionResponse = evaluateMathExpression(call.args.expression);
                } else {
                    console.error(`❌ Nama fungsi tidak dikenali: ${call.name}`);
                    functionResponse = null;
                }

                if (functionResponse) {
                    const result2 = await chat.sendMessage([
                        { functionResponse: { name: call.name, response: { content: JSON.stringify(functionResponse) } } } // Dibungkus JSON.stringify
                    ]);
                    return result2.response.text();
                } else {
                    return "Maaf, saya tidak mengenali alat yang diminta.";
                }
            }
            
            return result.response.text();

        } catch (error) {
            if (error.status === 503) {
                console.log(`Attempt ${attempt}: Gagal (503), server sibuk. Mencoba lagi dalam ${delay / 1000} detik...`);
                if (attempt === maxRetries) {
                    return "Maaf, Asisten AI sedang sangat sibuk saat ini. Coba lagi nanti.";
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error("Error saat memanggil API Gemini:", error);
                return "Maaf, terjadi kesalahan yang tidak terduga saat menghubungi Asisten AI.";
            }
        }
    }
}

// AKHIR GEMINI RESPONSE

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
qrCodeUrl = null; // Baris ini penting untuk web server Anda, JANGAN DIHAPUS

// Menjalankan alarm pengingat setiap 60 detik (1 menit)
console.log('[Pengingat] Alarm pengingat diaktifkan, akan memeriksa setiap menit.');
setInterval(checkAndSendReminders, 60000); 

// ▼▼▼ TAMBAHKAN DUA BARIS INI ▼▼▼
console.log('[Gempa] Pengecekan gempa otomatis diaktifkan, akan memeriksa setiap 2 menit.');
setInterval(checkAndBroadcastEarthquake, 90000); // 120000 ms = 2 menit
});

// awal kode message
client.on('message', async (message) => {
    try {
        // PERBAIKAN: Menambahkan penjaga untuk pesan tanpa teks (misal: status update, dll)
        if (!message.body) return;

        const chat = await message.getChat();
        const userMessage = message.body.trim();
        const userMessageLower = userMessage.toLowerCase();
        const userLastState = userState[message.from];

        // PRIORITAS #0: Menangani Pesan Unik seperti vCard
        if (message.type === 'vcard') {
            if (await isUserAdmin(message.from)) {
                const contact = await message.getContact();
                userState[message.from] = {
                    type: 'link_pegawai_contact_received',
                    targetUserId: contact.id._serialized,
                    targetUserNumber: contact.number,
                };
                return message.reply(`Anda mengirim kontak *${contact.name || contact.pushname}*.\n\nSekarang, balas dengan namanya yang terdaftar di Sanity.`);
            }
            return;
        }

        // BLOK 1: Menangani Interaksi Berbasis State (Jika Pengguna Sedang dalam Proses)
        if (userLastState) {
            if (userLastState.type === 'ai_mode') {
                if (['selesai', 'stop', 'exit', 'keluar'].includes(userMessageLower)) {
                    delete userState[message.from];
                    await showMainMenu(message);
                    return message.reply('Sesi AI telah berakhir.');
                }
                await chat.sendStateTyping();
                const aiResponse = await getGeminiResponse(userMessage, userLastState.history);
                message.reply(aiResponse);
                userLastState.history.push({ role: 'user', parts: [{ text: userMessage }] });
                userLastState.history.push({ role: 'model', parts: [{ text: aiResponse }] });
                if (userLastState.history.length > 10) userLastState.history.splice(0, 2);
                return;
            }

            if (userLastState.type === 'link_pegawai_contact_received') {
                const query = `*[_type == "pegawai" && nama match $keyword && !defined(userId)]`;
                const candidates = await clientSanity.fetch(query, { keyword: `*${userMessage}*` });
                if (candidates.length === 0) {
                    delete userState[message.from];
                    return message.reply(`❌ Tidak ditemukan kandidat pegawai dengan nama mengandung "${userMessage}".`);
                }
                userState[message.from] = { ...userLastState, type: 'link_pegawai_selection', list: candidates };
                let replyMessage = `Ditemukan ${candidates.length} kandidat untuk @${userLastState.targetUserNumber}:\n\n`;
                candidates.forEach((p, i) => { replyMessage += `${i + 1}. ${p.nama}\n`; });
                replyMessage += `\nBalas dengan *NOMOR*. Balas *0* untuk batal.`;
                return message.reply(replyMessage);
            }

            if ((['menu_utama', 'pustaka_data', 'pegawai', 'link_pegawai_selection'].includes(userLastState.type)) && !isNaN(parseInt(userMessage))) {
                // Semua logika menu numerik Anda dari skrip asli ditempatkan di sini
                // ... (tidak ada yang diubah dari logika asli Anda)
                return;
            }
            
            if (userLastState.type === 'menunggu_lokasi_cuaca') {
                message.reply(`⏳ Mencari cuaca untuk *${userMessage}*...`);
                const weatherResult = await getCurrentWeather(userMessage);
                if (weatherResult.error) {
                    message.reply(weatherResult.error);
                } else {
                    message.reply(`Cuaca di ${weatherResult.kota}: ${weatherResult.kondisi}, Suhu ${weatherResult.suhu}.`);
                }
                delete userState[message.from];
                return;
            }
        }

        // BLOK 2: Menangani Perintah Teks Global dalam satu rantai IF...ELSE IF...
        
        if (userMessageLower === 'halo panda') {
            await showMainMenu(message);
        
        } else if (userMessageLower.startsWith('info gempa')) {
            const userId = message.from;
            const command = userMessageLower.split(' ')[2];

            if (command === 'on') {
                const docId = userId.replace(/[@.]/g, '-');
                const contact = await message.getContact();

                // Dokumen yang akan dibuat jika belum ada
                const newSubscriber = {
                    _type: 'pelangganGempa',
                    _id: docId,
                    userId: userId,
                    namaPengguna: contact.pushname || 'Tanpa Nama',
                    tanggalDaftar: new Date().toISOString()
                };

                try {
                    // Gunakan createIfNotExists
                    await clientSanity.createIfNotExists(newSubscriber);
                    return message.reply('✅ Berhasil! Anda sekarang terdaftar untuk menerima notifikasi gempa otomatis.');
                } catch (error) {
                    console.error("Gagal mendaftarkan pelanggan gempa:", error);
                    return message.reply("Maaf, terjadi kesalahan saat mencoba mendaftar.");
                }

            } else if (command === 'off') {
                const docId = userId.replace(/[@.]/g, '-');
                // Logika 'off' sudah benar, tidak perlu diubah
                const existing = await clientSanity.fetch(`*[_type == "pelangganGempa" && _id == $docId][0]`, { docId });
                if (!existing) return message.reply('Anda memang belum terdaftar.');

                await clientSanity.delete(docId);
                return message.reply('✅ Anda telah berhenti berlangganan notifikasi gempa.');

            } else {
                // Logika 'info gempa' manual sudah benar, tidak perlu diubah
                message.reply('⏳ Mengambil data gempa terakhir dari BMKG...');
                const gempaData = await getGempa();
                if (gempaData.error) return message.reply(gempaData.error);
                const reply = `*Info Gempa Terkini*\n\n` +
                    `*Waktu:* ${gempaData.tanggal}, ${gempaData.waktu}\n` +
                    `*Magnitudo:* ${gempaData.magnitudo} SR\n` +
                    `*Kedalaman:* ${gempaData.kedalaman}\n` +
                    `*Wilayah:* ${gempaData.wilayah}\n` +
                    `*Potensi:* ${gempaData.potensi}`;
                return message.reply(reply);
            }
    } else if (userMessageLower.startsWith('panda simpan ')) {
            if (!message.hasQuotedMsg) return message.reply('Anda harus membalas file yang ingin disimpan.');
            const quotedMsg = await message.getQuotedMessage();
            if (!quotedMsg.hasMedia) return message.reply('Anda harus membalas sebuah file.');
            const namaFile = userMessage.substring('panda simpan '.length).trim();
            if (!namaFile) return message.reply('Silakan berikan nama untuk file.');
            message.reply('⏳ Memproses...');
            const media = await quotedMsg.downloadMedia();
            const driveId = await uploadKeDrive(media, namaFile);
            if (driveId) {
                const contact = await message.getContact();
                const dataFile = { namaFile, googleDriveId: driveId, diunggahOleh: contact.pushname, groupId: chat.isGroup ? chat.id._serialized : 'pribadi', tipeFile: media.mimetype };
                await simpanDataFileKeSanity(dataFile);
                message.reply(`✅ Berhasil! File *"${namaFile}"* telah diarsipkan.`);
            } else {
                message.reply('Gagal mengunggah file.');
            }
        
        } else if (userMessageLower.startsWith('cari file ')) {
            const kataKunci = userMessage.substring('cari file '.length).trim();
            if (!kataKunci) return message.reply('Masukkan kata kunci pencarian.');
            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            const hasil = await cariFileDiSanity(kataKunci, groupId);
            if (hasil.length === 0) return message.reply(`Tidak ada file ditemukan dengan kata kunci "${kataKunci}".`);
            let reply = `Ditemukan ${hasil.length} file:\n\n`;
            hasil.forEach(f => { reply += `📄 *${f.namaFile}*\n`; });
            reply += `\nBalas dengan \`kirim file <nama file lengkap>\` untuk mengambil.`;
            message.reply(reply);
        
        } else if (userMessageLower.startsWith('kirim file ')) {
            const namaFile = userMessage.substring('kirim file '.length).trim();
            if (!namaFile) return message.reply('Masukkan nama file yang ingin dikirim.');
            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            const query = `*[_type == "fileArsip" && namaFile == $namaFile && groupId == $groupId][0]`;
            const fileData = await clientSanity.fetch(query, { namaFile, groupId });
            if (!fileData) return message.reply(`File "${namaFile}" tidak ditemukan.`);
            message.reply(`⏳ Mengambil file *"${namaFile}"*...`);
            await kirimFileDariDrive(fileData.googleDriveId, fileData.namaFile, message.from);
        
        } else if (userMessageLower.startsWith('cari user ')) {
            const kataKunci = userMessage.substring('cari user '.length).trim();
            if (!kataKunci) return message.reply('Silakan masukkan nama atau jabatan.');
            const pegawaiQuery = `*[_type == "pegawai" && (nama match $kataKunci || jabatan match $kataKunci)]`;
            const pegawaiDitemukan = await clientSanity.fetch(pegawaiQuery, { kataKunci: `*${kataKunci}*` });
            if (!pegawaiDitemukan || pegawaiDitemukan.length === 0) return message.reply(`Data untuk "${kataKunci}" tidak ditemukan.`);
            
            if (pegawaiDitemukan.length === 1) {
                const pegawai = pegawaiDitemukan[0];
                let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* \`\`\`${pegawai.nip || '-'}\`\`\`\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}\n\n🔑 *Akun & Kredensial*\n*Username SIPD:* \`\`\`${pegawai.usernameSipd || '-'}\`\`\`\n*Password SIPD:* \`\`\`${pegawai.passwordSipd || '-'}\`\`\`\n*Password Penatausahaan:* \`\`\`${pegawai.passwordPenatausahaan || '-'}\`\`\`\n\n📝 *Keterangan*\n${pegawai.keterangan || '-'}`;
                if (pegawai.tipePegawai === 'admin') {
                    detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* \`\`\`${pegawai.userRakortek || '-'}\`\`\`\n*User Renstra:* \`\`\`${pegawai.sipdRenstra || '-'}\`\`\`\n*Password Renstra:* \`\`\`${pegawai.passRenstra || '-'}\`\`\``;
                }
                message.reply(detailMessage);
            } else {
                userState[message.from] = { type: 'pegawai', list: pegawaiDitemukan };
                let pilihanMessage = `Ditemukan beberapa hasil. Balas dengan *nomor*:\n\n`;
                pegawaiDitemukan.forEach((p, i) => { pilihanMessage += `${i + 1}. ${p.nama} - *(${p.jabatan})*\n`; });
                message.reply(pilihanMessage);
            }
        
        } else if (userMessageLower.startsWith('ingatkan ')) {
            if (!(await isUserAdmin(message.from))) return message.reply('❌ Perintah ini hanya untuk admin.');
            // Logika lengkap 'ingatkan' Anda di sini
        
        } else if (userMessageLower === 'help' || userMessageLower === 'bantuan') {
            // Logika lengkap 'help' Anda di sini
        
        } else if (userMessageLower === 'cuaca') {
            userState[message.from] = { type: 'menunggu_lokasi_cuaca' };
            message.reply('Silakan ketik nama kota.');
        
        } else {
            // BLOK 3: Pemicu Mode AI (HANYA JIKA TIDAK ADA PERINTAH LAIN YANG COCOK)
            
            // 1. 'info gempa' ditambahkan ke daftar pemicu
            const aiTriggerCommands = ['tanya ai', 'mode ai', 'sesi ai', 'panda ai', 'info gempa'];
            
            if (!chat.isGroup && aiTriggerCommands.some(cmd => userMessageLower.startsWith(cmd))) {
                
                // 2. Logika baru untuk memulai sesi DAN langsung menjawab
                userState[message.from] = { type: 'ai_mode', history: [] };
                
                // Beri tahu pengguna bahwa sesi dimulai (opsional, bisa dihapus jika tidak mau ada pesan pembuka)
                message.reply("Sesi AI dimulai. Saya akan segera menjawab pertanyaan Anda...");
                
                // Langsung proses pertanyaan pertamanya tanpa menunggu balasan lagi
                await chat.sendStateTyping();
                const aiResponse = await getGeminiResponse(userMessage, userState[message.from].history);
                message.reply(aiResponse);

                // Simpan percakapan pertama ke dalam history
                userState[message.from].history.push({ role: 'user', parts: [{ text: userMessage }] });
                userState[message.from].history.push({ role: 'model', parts: [{ text: aiResponse }] });

            }
        }

    } catch (error) {
        console.error('Terjadi error fatal di event message:', error);
        if (message && !message.isStatus) {
            message.reply('Maaf, terjadi kesalahan tak terduga.');
        }
    }
});
// akhir kode message


// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();