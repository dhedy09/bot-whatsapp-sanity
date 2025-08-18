//8e4ed76ff85ed87cb76ac3cace01a88d

// =================================================================
// BAGIAN 1: INISIALISASI & KONFIGURASI AWAL
// =================================================================

// ▼▼▼ GANTI KESELURUHAN BAGIAN ATAS KODE ANDA DENGAN INI ▼▼▼

// BAGIAN 1: INISIALISASI & KONFIGURASI AWAL
// =================================================================

require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); // MessageMedia ditambahkan
const { createClient } = require('@sanity/client');
const qrcode = require('qrcode');
const { google } = require('googleapis');
const stream = require('stream'); // Diperlukan untuk Google Drive
const { evaluate } = require('mathjs');
const axios = require('axios');
const app = express();
const path = require('path');


// --- INISIALISASI KLIEN GOOGLE (DRIVE, SEARCH, DLL) ---
const credentialsJsonString = process.env.GOOGLE_CREDENTIALS_JSON;
if (!credentialsJsonString) {
    console.error("FATAL ERROR: Variabel GOOGLE_CREDENTIALS_JSON tidak ditemukan!");
    process.exit(1); 
}
const credentials = JSON.parse(credentialsJsonString);

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
        'https://www.googleapis.com/auth/drive', // Izin penuh untuk Google Drive
    ],
});

const drive = google.drive({ version: 'v3', auth });
// --- AKHIR INISIALISASI KLIEN GOOGLE ---


// --- INISIALISASI KLIEN GEMINI AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });


// --- DEFINISI ALAT-ALAT UNTUK AI ---
const tools = [{
    functionDeclarations: [
        {
            name: "googleSearch",
            description: "Mencari informasi umum di internet menggunakan Google. Gunakan ini untuk pertanyaan tentang fakta, orang, tempat, peristiwa terkini, atau topik apa pun yang tidak tercakup oleh alat lain.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Pertanyaan atau kata kunci pencarian." } }, required: ["query"] },
        },
        {
            name: "getLatestNews",
            description: "Mendapatkan berita terkini berdasarkan topik atau kata kunci spesifik.",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING", description: "Topik berita." } }, required: ["query"] },
        },
        {
            name: "getCurrentWeather",
            description: "Mendapatkan data cuaca terkini untuk lokasi tertentu.",
            parameters: { type: "OBJECT", properties: { location: { type: "STRING", description: "Nama kota." } }, required: ["location"] },
        },
        {
            name: "getGempa",
            description: "Mendapatkan informasi gempa bumi terkini dari BMKG.",
        },
        {
            name: "calculate",
            description: "Mengevaluasi ekspresi matematika.",
            parameters: { type: "OBJECT", properties: { expression: { type: "STRING", description: "Ekspresi matematika." } }, required: ["expression"] },
        },
    ],
}];


// --- KONFIGURASI SERVER WEB (EXPRESS) ---
const port = process.env.PORT || 8080;
let qrCodeUrl = null;

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

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
    process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
    console.error('FATAL ERROR: GEMINI_API_KEY tidak ditemukan!');
    process.exit(1);
}

const clientSanity = createClient({
    projectId: 'dk0so8pj',
    dataset: 'production',
    apiVersion: '2024-01-01',
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
const userState = {};

// ▲▲▲ AKHIR DARI BLOK PENGGANTI ▲▲▲

// =================================================================
// BAGIAN 3: FUNGSI-FUNGSI PEMBANTU (HELPER FUNCTIONS)
// =================================================================
// ▼▼▼ TAMBAHKAN FUNGSI BARU INI ▼▼▼

// ▼▼▼ TAMBAHKAN FUNGSI BARU INI HAPUS FILE▼▼▼

/**
 * Menghapus file dari Google Drive berdasarkan ID-nya.
 * @param {string} fileId ID file di Google Drive.
 * @returns {Promise<boolean>} True jika berhasil, false jika gagal.
 */
async function hapusFileDiDrive(fileId) {
    try {
        await drive.files.delete({
            fileId: fileId,
            supportsAllDrives: true,
        });
        console.log(`[Drive] Berhasil menghapus file dengan ID: ${fileId}`);
        return true;
    } catch (error) {
        console.error(`[Drive] Gagal menghapus file dengan ID ${fileId}:`, error.message);
        return false;
    }
}

// ▲▲▲ AKHIR DARI FUNGSI BARU HAPUS FILE ▲▲▲

// AWAL FUNGSI GOOGLE SEARCH
/**
 * Melakukan pencarian di Google untuk mendapatkan jawaban atas pertanyaan umum.
 * @param {string} query Pertanyaan atau topik yang ingin dicari.
 * @returns {Promise<object>} Ringkasan hasil pencarian.
 */
async function googleSearch(query) {
    console.log(`[Tool] Menjalankan googleSearch untuk query: ${query}`);
    try {
        const customsearch = google.customsearch('v1');
        const response = await customsearch.cse.list({
            auth: process.env.GOOGLE_API_KEY,
            cx: process.env.SEARCH_ENGINE_ID,
            q: query,
            num: 3, // Ambil 3 hasil teratas
        });

        const items = response.data.items;
        if (!items || items.length === 0) {
            return { error: `Tidak ada hasil pencarian di Google untuk "${query}".` };
        }

        // Susun ringkasan dari hasil pencarian untuk diberikan ke AI
        const searchResults = items.map(item => ({
            judul: item.title,
            link: item.link,
            cuplikan: item.snippet,
        }));

        return { ringkasan: `Berikut adalah hasil pencarian teratas untuk "${query}"`, hasil: searchResults };

    } catch (error) {
        console.error("Error saat melakukan Google Search:", error.message);
        return { error: "Gagal melakukan pencarian di Google." };
    }
}
// ▲▲▲ AKHIR DARI FUNGSI GOOGLE SEARCH▲▲▲

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

    // AWAL BROADCAST GEMPA
            // Tambahkan setelah fungsi checkAndSendReminders()

        /**
         * Mengecek gempa terbaru dari BMKG dan broadcast ke semua pelanggan aktif jika ada gempa baru.
         */
        let lastGempaId = null; // Simpan ID gempa terakhir yang sudah dikirim

       // ...existing code...
        async function checkAndBroadcastGempa() {
            try {
                const gempa = await getGempa();
                if (
                    !gempa ||
                    gempa.error ||
                    !gempa.tanggal ||
                    !gempa.waktu ||
                    !gempa.magnitudo ||
                    !gempa.wilayah
                ) return;

                // Gunakan kombinasi waktu & magnitudo sebagai ID unik gempa
                const currentGempaId = `${gempa.tanggal}_${gempa.waktu}_${gempa.magnitudo}`;

                if (lastGempaId === currentGempaId) return; // Tidak ada gempa baru

                // Ambil semua pelanggan aktif
                const query = `*[_type == "langgananGempa" && status == "aktif"]`;
                const subscribers = await clientSanity.fetch(query);

                if (!subscribers || subscribers.length === 0) return;

                // Susun pesan broadcast
                const pesanGempa = 
        `⚠️ *Info Gempa Terkini BMKG* ⚠️
        Waktu: ${gempa.tanggal} ${gempa.waktu}
        Magnitudo: ${gempa.magnitudo}
        Kedalaman: ${gempa.kedalaman}
        Wilayah: ${gempa.wilayah}
        Potensi: ${gempa.potensi}
        Dirasakan: ${gempa.dirasakan || '-'}
        \n\nUntuk berhenti menerima info gempa, kirim: *berhenti gempa*`;

                // Kirim ke semua pelanggan
                for (const user of subscribers) {
                    await client.sendMessage(user.userId, pesanGempa);
                }

                lastGempaId = currentGempaId; // Update ID gempa terakhir
                console.log(`[Broadcast Gempa] Info gempa dikirim ke ${subscribers.length} pelanggan.`);
            } catch (error) {
                console.error("[Broadcast Gempa] Gagal broadcast info gempa:", error);
            }
        }
        // ...existing code...
// ▲▲▲ AKHIR DARI FUNGSI BROADCAST GEMPA ▲▲▲
        
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

// ▼▼▼ FUNGSI UNTUK MENGAMBIL & MENGIRIM FILE DARI DRIVE ▼▼▼

/**
 * Mengunduh file dari Google Drive dan mengirimkannya via WhatsApp.
 * @param {string} fileId ID file di Google Drive.
 * @param {string} namaFile Nama asli file.
 * @param {string} recipientId ID penerima (chat/grup) di WhatsApp.
 */
async function kirimFileDariDrive(fileId, namaFile, recipientId) {
    try {
        // Mengunduh file dari Drive sebagai buffer
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'arraybuffer' }
        );

        const fileBuffer = Buffer.from(response.data);

        // Mendapatkan tipe mime dari Sanity atau dari nama file jika perlu
        // Di sini kita asumsikan kita akan tahu tipe mime-nya
        const { default: mime } = await import('mime-types');
        const mimetype = mime.lookup(namaFile) || 'application/octet-stream';

        // Membuat objek MessageMedia dari buffer
        const media = new MessageMedia(mimetype, fileBuffer.toString('base64'), namaFile);

        // Mengirim file ke pengguna/grup
        await client.sendMessage(recipientId, media, { caption: `Berikut file yang Anda minta: *${namaFile}*` });
        console.log(`[Drive] Berhasil mengirim file "${namaFile}" ke ${recipientId}`);

    } catch (error) {
        console.error(`Error saat mengambil atau mengirim file dari Drive:`, error.message);
        client.sendMessage(recipientId, `Maaf, gagal mengambil file *"${namaFile}"* dari arsip. Mungkin file telah dihapus.`);
    }
}

// ▲▲▲ AKHIR DARI FUNGSI KIRIM ▲▲▲

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
// ▲▲▲ AKHIR DARI KODE PENGGANTI ▲▲▲

// AWAL GEMINI RESPONSE
/**
 * Mengirim prompt ke API Gemini, menangani function calling, dan mengembalikan respons.
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
                // --- Kumpulan Alat AI ---
                if (call.name === 'googleSearch') { // <-- LOGIKA BARU UNTUK GOOGLE SEARCH
                    functionResponse = await googleSearch(call.args.query);
                } else if (call.name === 'getCurrentWeather') {
                    functionResponse = await getCurrentWeather(call.args.location);
                } else if (call.name === 'getLatestNews') {
                    functionResponse = await getLatestNews(call.args.query);
                } else if (call.name === 'getGempa') {
                    functionResponse = await getGempa();
                } else if (call.name === 'calculate') {
                    functionResponse = evaluateMathExpression(call.args.expression);
                } else {
                    console.error(`❌ Nama fungsi tidak dikenali: ${call.name}`);
                    functionResponse = { error: `Fungsi ${call.name} tidak ada.` };
                }

                // --- Perbaikan kecil pada format balasan ke AI ---
                const result2 = await chat.sendMessage([
                    { functionResponse: { name: call.name, response: functionResponse } }
                ]);
                return result2.response.text();
            
            } else {
                 // Jika tidak ada panggilan fungsi, langsung kembalikan respons teks
                return result.response.text();
            }

        } catch (error) {
            // --- Perbaikan pada penanganan error agar lebih kuat ---
            console.error(`Error pada percobaan ${attempt} saat memanggil API Gemini:`, error);

            if (attempt === maxRetries) {
                console.error("Gagal setelah percobaan maksimal.");
                if (error.message && error.message.includes('response was blocked')) {
                    return "Maaf, respons saya diblokir karena kebijakan keamanan. Mungkin pertanyaan Anda sensitif.";
                }
                return "Maaf, Asisten AI sedang mengalami gangguan. Silakan coba lagi beberapa saat lagi.";
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// AKHIR GEMINI RESPONSE

// ▼▼▼ FUNGSI UNTUK UPLOAD FILE KE DRIVE ▼▼▼

/**
 * Mengunggah file ke folder spesifik di Google Drive.
 * @param {object} media Objek media dari whatsapp-web.js.
 * @param {string} namaFile Nama yang akan diberikan untuk file di Drive.
 * @returns {Promise<string|null>} ID file di Google Drive atau null jika gagal.
 */
async function uploadKeDrive(media, namaFile) {
    try {
        const fileMetadata = {
            name: namaFile,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
        };
        const bufferStream = new stream.PassThrough();
        bufferStream.end(Buffer.from(media.data, 'base64'));

        const mediaData = {
            mimeType: media.mimetype,
            body: bufferStream
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: mediaData,
            fields: 'id',
            supportsAllDrives: true,
            convert: false // <-- WAJIB ADA: Mencegah konversi ke Google Sheets
        });

        console.log(`[Drive] File berhasil diunggah dengan ID: ${response.data.id}`);
        return response.data.id;

    } catch (error) {
        console.error("Error saat mengunggah ke Google Drive:", error.message);
        return null;
    }
}

// ▲▲▲ AKHIR DARI FUNGSI UPLOAD ▲▲▲

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

    // Menjalankan broadcast gempa setiap 5 menit
    console.log('[Gempa] Broadcast info gempa diaktifkan, akan memeriksa setiap 5 menit.');
    setInterval(checkAndBroadcastGempa, 300000); // 5 menit
});

// awal kode message
client.on('message', async (message) => {
    const chat = await message.getChat();
    try {
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

// ▼▼▼ TAMBAHKAN BLOK TES DIAGNOSTIK INI ▼▼▼

if (userMessageLower === 'cek pesan') {
    let debugInfo = '--- Info Pesan ---\n\n';
    debugInfo += `Memiliki Balasan (hasQuotedMsg): *${message.hasQuotedMsg}*\n`;

    if (message.hasQuotedMsg) {
        try {
            const quotedMsg = await message.getQuotedMessage();
            debugInfo += `\n--- Info Pesan yang Dibalas ---\n`;
            debugInfo += `Punya Media (quoted.hasMedia): *${quotedMsg.hasMedia}*\n`;
            debugInfo += `Nama File (quoted.filename): *${quotedMsg.filename || 'Tidak ada'}*\n`;
        } catch (e) {
            debugInfo += `\nGagal mendapatkan info pesan balasan: ${e.message}`;
        }
    }

    return message.reply(debugInfo);
}

// ▲▲▲ AKHIR DARI BLOK TES ▲▲▲

        // ▼▼▼ TAMBAHKAN BLOK BARU UNTUK SIMPAN FILE DI SINI ▼▼▼
const simpanPrefix = 'panda simpan ';
if (userMessageLower.startsWith(simpanPrefix)) {
    if (!message.hasQuotedMsg) {
        return message.reply('❌ Perintah ini hanya berfungsi jika Anda membalas file yang ingin disimpan.');
    }

    const quotedMsg = await message.getQuotedMessage();
    if (!quotedMsg.hasMedia) {
        return message.reply('❌ Anda harus membalas sebuah file (bukan teks).');
    }
    
    try {
        const originalFilename = quotedMsg.filename;
        let namaKustom = userMessage.substring(simpanPrefix.length).trim();
        let namaFileFinal;
        
        // Menggunakan dynamic import untuk library mime-types
        const { default: mime } = await import('mime-types');

        if (originalFilename) {
            // --- ALUR CERDAS (JIKA NAMA FILE ASLI TERDETEKSI) ---
            const extension = path.extname(originalFilename);
            namaFileFinal = namaKustom ? namaKustom + extension : originalFilename;

        } else {
            // --- ALUR SUPER CERDAS (JIKA NAMA FILE ASLI TIDAK ADA) ---
            if (!namaKustom) {
                return message.reply('❌ Bot tidak bisa mendeteksi nama file asli.\n\nMohon berikan nama yang Anda inginkan (tanpa perlu ekstensi). Contoh:\n`panda simpan Laporan Penting`');
            }
            
            const mimetype = quotedMsg.mimetype;
            const extension = mime.extension(mimetype); // Mendeteksi ekstensi dari tipe file

            if (!extension) {
                return message.reply(`❌ Gagal mendeteksi ekstensi untuk tipe file: ${mimetype}.`);
            }

            namaFileFinal = `${namaKustom}.${extension}`; // Menambahkan ekstensi secara otomatis
        }

        message.reply(`⏳ Sedang memproses *"${namaFileFinal}"*, mohon tunggu...`);
        const media = await quotedMsg.downloadMedia();
        
        const driveId = await uploadKeDrive(media, namaFileFinal);
        if (!driveId) { return message.reply(' Gagal mengunggah file ke Google Drive.'); }

        const contact = await message.getContact();
        const pengunggah = contact.pushname || contact.name || message.author;

        const dataFile = {
            namaFile: namaFileFinal,
            googleDriveId: driveId,
            diunggahOleh: pengunggah,
            groupId: chat.isGroup ? chat.id._serialized : 'pribadi',
            tipeFile: media.mimetype,
        };
        await simpanDataFileKeSanity(dataFile);

        return message.reply(`✅ Berhasil! File telah diarsipkan dengan nama *"${namaFileFinal}"*.`);

    } catch (error) {
        console.error("Error di blok simpan file:", error);
        return message.reply(' Gagal memproses file. Terjadi kesalahan tak terduga.');
    }
}
        // ▲▲▲ BATAS AKHIR BLOK BARU SIMPAN FILE▲▲▲

        // Tambahkan setelah blok "BLOK 2: MENANGANI PERINTAH TEKS"

        // BLOK LANGGANAN INFO GEMPA
        if (userMessageLower === 'langganan gempa') {
            const contact = await message.getContact();
            const userId = contact.id._serialized;
            const userName = contact.pushname || contact.name || userId;

            // Cek apakah sudah langganan
            const query = `*[_type == "langgananGempa" && userId == $userId][0]`;
            const existing = await clientSanity.fetch(query, { userId });

            if (existing && existing.status === 'aktif') {
                return message.reply('Anda sudah terdaftar sebagai penerima info gempa.');
            }

            if (existing) {
                // Update status ke aktif
                await clientSanity.patch(existing._id).set({ status: 'aktif' }).commit();
            } else {
                // Buat dokumen baru
                await clientSanity.create({
                    _type: 'langgananGempa',
                    userId,
                    namaPengguna: userName,
                    status: 'aktif',
                    tanggalDaftar: new Date().toISOString()
                });
            }
            return message.reply('✅ Anda berhasil berlangganan info gempa. Jika ada gempa baru, Anda akan menerima notifikasi otomatis.');
        }

        if (userMessageLower === 'berhenti gempa') {
            const contact = await message.getContact();
            const userId = contact.id._serialized;

            const query = `*[_type == "langgananGempa" && userId == $userId][0]`;
            const existing = await clientSanity.fetch(query, { userId });

            if (!existing || existing.status !== 'aktif') {
                return message.reply('Anda belum berlangganan info gempa.');
            }

            await clientSanity.patch(existing._id).set({ status: 'nonaktif' }).commit();
            return message.reply('🚫 Anda telah berhenti berlangganan info gempa.');
        }
        // AKHIR BLOK LANGGANAN INFO GEMPA

// ▼▼▼ BLOK BARU UNTUK MENCARI & MENGIRIM FILE ▼▼▼
// ▼▼▼ GANTI BLOK 'cari file' LAMA ANDA DENGAN VERSI BARU INI ▼▼▼

const cariPrefix = 'cari file ';
if (userMessageLower.startsWith(cariPrefix)) {
    const kataKunci = userMessage.substring(cariPrefix.length).trim();
    if (!kataKunci) {
        return message.reply('Silakan masukkan kata kunci. Contoh: `cari file laporan`');
    }

    try {
        message.reply(`⏳ Mencari file dengan kata kunci *"${kataKunci}"*...`);
        const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
        
        // Logika pencarian sekarang ada di sini, tidak di fungsi terpisah
        const query = `*[_type == "fileArsip" && groupId == $groupId && namaFile match $kataKunci] | order(_createdAt desc)`;
        const hasilPencarian = await clientSanity.fetch(query, { 
            groupId: groupId, 
            kataKunci: `*${kataKunci}*` 
        });

        if (hasilPencarian.length === 0) {
            return message.reply(`Tidak ada file yang ditemukan dengan kata kunci *"${kataKunci}"* di arsip ini.`);
        }

        // Simpan hasil pencarian ke memori sementara (userState)
        userState[message.from] = {
            type: 'file_search_result',
            list: hasilPencarian
        };

        // Buat pesan balasan dengan daftar bernomor
        let replyMessage = `✅ Ditemukan ${hasilPencarian.length} file:\n\n`;
        hasilPencarian.forEach((file, index) => {
            replyMessage += `*${index + 1}.* ${file.namaFile}\n`;
        });
        replyMessage += `\nUntuk mengambil, balas dengan:\n\`kirim file <nomor>\``;
        
        return message.reply(replyMessage);

    } catch (error) {
        console.error("Error di blok cari file:", error);
        return message.reply("Maaf, terjadi kesalahan saat mencari file.");
    }
}


// AWAL BLOK KIRIM
const kirimPrefix = 'kirim file ';
if (userMessageLower.startsWith(kirimPrefix)) {
    // --- LOGIKA DIUBAH TOTAL UNTUK MEMBACA NOMOR ---
    const userLastState = userState[message.from];

    // Cek apakah pengguna sudah melakukan pencarian sebelumnya
    if (!userLastState || userLastState.type !== 'file_search_result') {
        return message.reply('Sesi pencarian tidak ditemukan. Silakan lakukan `cari file` terlebih dahulu sebelum mengirim file.');
    }

    const nomorPilihanStr = userMessage.substring(kirimPrefix.length).trim();
    const nomorPilihan = parseInt(nomorPilihanStr);

    // Validasi input nomor
    if (isNaN(nomorPilihan) || nomorPilihan < 1 || nomorPilihan > userLastState.list.length) {
        return message.reply(`Nomor tidak valid. Harap masukkan nomor antara 1 dan ${userLastState.list.length}.`);
    }

    try {
        const fileData = userLastState.list[nomorPilihan - 1]; // Ambil data file dari memori

        message.reply(`⏳ Sedang mengambil file *"${fileData.namaFile}"* dari arsip, mohon tunggu...`);
        await kirimFileDariDrive(fileData.googleDriveId, fileData.namaFile, message.from);
        
        // Hapus state setelah file berhasil dikirim
        delete userState[message.from];
        return;

    } catch (error) {
        console.error("Error di blok kirim file:", error);
        return message.reply("Maaf, terjadi kesalahan saat mencoba mengirim file.");
    }
}

// ▼▼▼ AWAL BLOK HAPUS ▼▼▼

else if (userMessageLower.startsWith('hapus file ')) {
    const userLastState = userState[message.from];

    // Cek apakah pengguna sudah melakukan pencarian sebelumnya
    if (!userLastState || userLastState.type !== 'file_search_result') {
        return message.reply('Sesi pencarian tidak ditemukan. Silakan lakukan `cari file` terlebih dahulu sebelum menghapus file.');
    }

    const nomorPilihanStr = userMessage.substring('hapus file '.length).trim();
    const nomorPilihan = parseInt(nomorPilihanStr);

    // Validasi input nomor
    if (isNaN(nomorPilihan) || nomorPilihan < 1 || nomorPilihan > userLastState.list.length) {
        return message.reply(`Nomor tidak valid. Harap masukkan nomor antara 1 dan ${userLastState.list.length}.`);
    }

    try {
        const fileData = userLastState.list[nomorPilihan - 1]; // Ambil data file dari memori
        message.reply(`⏳ Menghapus file *"${fileData.namaFile}"* dari arsip...`);

        // Langkah 1: Hapus dari Google Drive
        const driveSuccess = await hapusFileDiDrive(fileData.googleDriveId);
        if (!driveSuccess) {
            // Kita tetap lanjutkan meski gagal di drive, mungkin file sudah dihapus manual
            message.reply('⚠️ Gagal menghapus file dari Google Drive (mungkin sudah dihapus sebelumnya). Melanjutkan penghapusan dari katalog...');
        }

        // Langkah 2: Hapus dari Sanity (katalog)
        await clientSanity.delete(fileData._id);

        // Hapus state setelah selesai agar tidak bisa dihapus dua kali
        delete userState[message.from];
        
        return message.reply(`✅ Berhasil! File *"${fileData.namaFile}"* telah dihapus dari arsip.`);

    } catch (error) {
        console.error("Error di blok hapus file:", error);
        return message.reply("Maaf, terjadi kesalahan saat mencoba menghapus file.");
    }
}

// ▲▲▲ AKHIR DARI BLOK PERINTAH HAPUS ▲▲▲

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
        // ▼▼▼ TAMBAHKAN BLOK BARU INI ▼▼▼

        // ▼▼▼ TAMBAHKAN BLOK BARU INI ▼▼▼

        // AWAL BLOK: MEMBUAT PENGINGAT PRIBADI (HANYA ADMIN)
if (userMessageLower.startsWith('ingatkan')) {
    // Dapatkan info kontak pengirim untuk mendapatkan ID asli (selalu 628...@c.us)
    const contact = await message.getContact();
    const authorId = contact.id._serialized;

    const isUserAdmin = await isAdmin(authorId);
    if (!isUserAdmin) {
        message.reply('🔒 Maaf, hanya admin yang dapat menggunakan perintah ini.');
        return;
    }

    const argsString = userMessage.substring('ingatkan'.length).trim();
    // const reminderRegex = /^(.*?)\s(.*?)\stentang\s"(.*?)"$/i;
    const reminderRegex = /^(.+?)\s(.+?)\stentang\s"(.+)"$/i;
    const match = argsString.match(reminderRegex);

    if (!match) {
        message.reply(
            'Format salah. Gunakan:\n`ingatkan <Nama> <Waktu> tentang "<Pesan>"`\n\n' +
            '*Contoh:*\n`ingatkan Budi besok jam 9 tentang "Rapat evaluasi"`'
        );
        return;
    }

    const [, namaTarget, waktuString, pesan] = match.map(s => s.trim());
    message.reply(`⏳ Mencari pegawai dengan nama *${namaTarget}*...`);

    try {
        const query = `*[_type == "pegawai" && lower(nama) match lower($namaTarget)]`;
        let pegawaiDitemukan = await clientSanity.fetch(query, { namaTarget });

        if (pegawaiDitemukan.length === 0 && namaTarget.toLowerCase() === 'saya') {
            // --- PERBAIKAN UTAMA: Menggunakan Parameterized Query ---
            const idToSearch = authorId.replace('@c.us', '-c-us');
            const selfQuery = `*[_type == "pegawai" && _id == $idToSearch][0]`;
            const selfData = await clientSanity.fetch(selfQuery, { idToSearch: idToSearch });
            
            if (selfData) {
                pegawaiDitemukan = [selfData];
            }
        }

        if (pegawaiDitemukan.length === 0) {
            message.reply(`Maaf, pegawai dengan nama "${namaTarget}" tidak ditemukan.`);
            return;
        }
        if (pegawaiDitemukan.length > 1) {
            message.reply(`Ditemukan ${pegawaiDitemukan.length} pegawai dengan nama mirip "${namaTarget}". Mohon gunakan nama yang lebih spesifik.`);
            return;
        }

        const target = pegawaiDitemukan[0];
        const targetNomorHp = target._id.replace('-c-us', '@c.us');
        const targetNama = target.nama;
        const waktuKirim = parseWaktuIndonesia(waktuString);

        if (!waktuKirim) {
            message.reply(`Maaf, saya tidak mengerti format waktu "${waktuString}".\nGunakan format seperti "besok jam 10" atau "dalam 5 menit".`);
            return;
        }

        const newPengingat = {
            _type: 'pengingat', pesan, targetNomorHp, targetNama,
            waktuKirim: waktuKirim.toISOString(), status: 'menunggu',
        };
        await clientSanity.create(newPengingat);

        const waktuLokal = waktuKirim.toLocaleString('id-ID', {
            timeZone: 'Asia/Makassar',
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        message.reply(`✅ Pengingat berhasil dibuat!\n\n*Untuk:* ${targetNama}\n*Pesan:* ${pesan}\n*Waktu:* ${waktuLokal}`);

    } catch (error) {
        console.error("Gagal membuat pengingat:", error);
        message.reply("Maaf, terjadi kesalahan di server saat mencoba membuat pengingat.");
    }
    return;
}


        // ▲▲▲ AKHIR DARI BLOK PENGINGAT ▲▲▲

        // AWAL BLOK  MENU BANTUAN (HELP)
        if (userMessageLower === 'help' || userMessageLower === 'bantuan') {
            try {
                const isUserAdmin = await isAdmin(message.from);
                
                // 1. Ambil semua data perintah dari Sanity, diurutkan
                const query = `*[_type == "perintahBantuan"] | order(urutan asc)`;
                const semuaPerintah = await clientSanity.fetch(query);

                if (!semuaPerintah || semuaPerintah.length === 0) {
                    message.reply("Maaf, daftar perintah bantuan belum diatur di Sanity.");
                    return;
                }

                // 2. Pisahkan perintah umum dan perintah admin
                const perintahUmum = semuaPerintah.filter(p => !p.isAdminOnly);
                const perintahAdmin = semuaPerintah.filter(p => p.isAdminOnly);

                // 3. Bangun pesan bantuan (tampilan tetap sama)
                let helpMessage = `*MENU BANTUAN* 📚\n\n`;
                helpMessage += `Berikut adalah daftar perintah yang bisa Anda gunakan:\n\n`;
                
                // Tampilkan Perintah Umum
                helpMessage += `*✨ Perintah Umum*\n`;
                helpMessage += `--------------------\n`;
                perintahUmum.forEach(cmd => {
                    helpMessage += `• *${cmd.perintah}* - ${cmd.deskripsi}\n`;
                });
                
                // Jika pengguna adalah admin dan ada perintah admin, tampilkan
                if (isUserAdmin && perintahAdmin.length > 0) {
                    helpMessage += `\n*🔑 Perintah Admin*\n`;
                    helpMessage += `--------------------\n`;
                    perintahAdmin.forEach(cmd => {
                        helpMessage += `• *${cmd.perintah}* - ${cmd.deskripsi}\n`;
                    });
                }
                
                message.reply(helpMessage);

            } catch (error) {
                console.error("Gagal mengambil data bantuan dari Sanity:", error);
                message.reply("Maaf, terjadi kesalahan saat memuat menu bantuan.");
            }
            return;
        }

        // ▲▲▲ AKHIR DARI BLOK PANDUAN▲▲▲

        // AWAL MENAMBAH PEGAWAI DENGAN PANDUAN OTOMATIS ADMIN
        if (userMessageLower.startsWith('tambah pegawai')) {
            const isUserAdmin = await isAdmin(message.from);
            if (!isUserAdmin) {
                message.reply('🔒 Maaf, hanya admin yang dapat menggunakan perintah ini.');
                return;
            }

            const argsString = userMessage.substring('tambah pegawai'.length).trim();

            if (!argsString) {
                let panduanMessage = `📝 *Panduan Menambah Pegawai Baru*\n\n`;
                panduanMessage += `Salin salah satu template di bawah ini, tempelkan, lalu ganti isinya.\n\n`;
                panduanMessage += `*Template untuk Pegawai Biasa (User):*\n`;
                panduanMessage += `\`\`\`tambah pegawai NAMA_LENGKAP, NIP, JABATAN, user\`\`\`\n\n`;
                panduanMessage += `*Template untuk Admin:*\n`;
                panduanMessage += `\`\`\`tambah pegawai NAMA_LENGKAP, NIP, JABATAN, admin\`\`\``;
                
                message.reply(panduanMessage);
                return;
            }
            
            // ... (sisa logika prosesnya tetap sama)
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
                const sanitizedId = message.from.replace(/[@.]/g, '-');
                const newPegawaiDoc = {
                    _id: sanitizedId,
                    _type: 'pegawai',
                    nama: nama,
                    nip: nip,
                    jabatan: jabatan,
                    tipePegawai: levelLower
                };
                await clientSanity.createOrReplace(newPegawaiDoc);
                message.reply(`✅ Pegawai baru dengan nama *${nama}* berhasil ditambahkan/diperbarui.`);
            } catch (error) {
                console.error("Gagal menambah pegawai baru:", error);
                message.reply("Maaf, terjadi kesalahan di server saat mencoba menambah pegawai.");
            }
            return;
        }

        // ▲▲▲ AKHIR DARI KODE PENGGANTI  admin▲▲▲

                // ▼▼▼ TAMBAHKAN BLOK BARU INI update admin▼▼▼

        // BLOK BARU: UPDATE DATA PEGAWAI (HANYA ADMIN)
        if (userMessageLower.startsWith('update')) {
            const isUserAdmin = await isAdmin(message.from);
            if (!isUserAdmin) {
                message.reply('🔒 Maaf, hanya admin yang dapat menggunakan perintah ini.');
                return;
            }

            const argsString = userMessage.substring('update'.length).trim();
            
            // Daftar field yang diizinkan untuk diubah via bot
            const allowedFields = {
                'nama': 'Nama Lengkap', 'nip': 'NIP', 'jabatan': 'Jabatan', 'level': 'Level Akses',
                'usernamesipd': 'Username SIPD', 'passwordsipd': 'Password SIPD',
                'passwordpenatausahaan': 'Password Penatausahaan', 'keterangan': 'Keterangan',
                'userrakortek': 'User Rakortek', 'sipdrenstra': 'User SIPD Renstra', 'passrenstra': 'Password SIPD Renstra'
            };

            if (!argsString) {
                let panduanMessage = `📝 *Panduan Mengubah Data Pegawai*\n\n`;
                panduanMessage += `Gunakan format berikut:\n`;
                panduanMessage += `\`\`\`update <Nama Target> <Nama Field> menjadi <Nilai Baru>\`\`\`\n\n`;
                panduanMessage += `*Contoh Penggunaan:*\n`;
                panduanMessage += `\`\`\`update Budi Santoso jabatan menjadi Analis Senior\`\`\`\n\n`;
                panduanMessage += `*Field yang bisa diubah:*\n`;
                panduanMessage += `\`\`\`${Object.keys(allowedFields).join(', ')}\`\`\`\n\n`;
                panduanMessage += `*💡 Tips:* Jika Anda tidak yakin dengan nama lengkap target, gunakan perintah \`cari user <nama>\` terlebih dahulu untuk memastikan.`;
                
                message.reply(panduanMessage);
                return;
            }

            const updateRegex = /^(.*?)\s(.*?)\smenjadi\s(.*)$/i;
            const match = argsString.match(updateRegex);

            if (!match) {
                message.reply('Format salah. Ketik `update` untuk melihat panduan.');
                return;
            }
            
            const [, namaTarget, fieldToUpdate, nilaiBaru] = match.map(s => s.trim());
            const fieldKey = fieldToUpdate.toLowerCase().replace(/\s/g, '');

            if (!allowedFields[fieldKey]) {
                message.reply(`Maaf, field "${fieldToUpdate}" tidak valid. Ketik \`update\` untuk melihat daftar field yang bisa diubah.`);
                return;
            }

            const finalFieldKey = fieldKey === 'level' ? 'tipePegawai' : fieldToUpdate;

            message.reply(`⏳ Mencari *${namaTarget}* untuk memperbarui *${allowedFields[fieldKey]}*...`);

            try {
                const query = `*[_type == "pegawai" && lower(nama) == lower($namaTarget)]`;
                const pegawaiDitemukan = await clientSanity.fetch(query, { namaTarget });

                if (pegawaiDitemukan.length === 0) {
                    message.reply(`Maaf, pegawai dengan nama "${namaTarget}" tidak ditemukan. Pastikan penulisan nama sudah benar.`);
                    return;
                }

                if (pegawaiDitemukan.length > 1) {
                    message.reply(`Ditemukan ${pegawaiDitemukan.length} pegawai dengan nama "${namaTarget}". Mohon gunakan nama yang lebih spesifik.`);
                    return;
                }

                const pegawaiId = pegawaiDitemukan[0]._id;
                await clientSanity.patch(pegawaiId).set({ [finalFieldKey]: nilaiBaru }).commit();

                message.reply(`✅ Data *${namaTarget}* berhasil diperbarui:\n*${allowedFields[fieldKey]}* sekarang menjadi *${nilaiBaru}*`);

            } catch (error) {
                console.error("Gagal mengupdate pegawai:", error);
                message.reply("Maaf, terjadi kesalahan di server saat mencoba mengupdate data.");
            }

            return;
        }

        // ▲▲▲ AKHIR DARI BLOK BARU update admin ▲▲▲

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

// JIKA TIDAK ADA PERINTAH YANG COCOK, PANGGIL FUNGSI PUSAT KENDALI AI
// ▼▼▼ GANTI BLOK AI LAMA DENGAN INI ▼▼▼
if (!chat.isGroup) {
    const responseText = await getGeminiResponse(userMessage, userHistory[message.from] || []);
    message.reply(responseText);
}
// ▲▲▲ AKHIR DARI BLOK PENGGANTI ▲▲▲

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