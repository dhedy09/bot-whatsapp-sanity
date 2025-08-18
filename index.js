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

// AWAL FUNGSI BARU MEMORI▼▼▼

/**
 * Menyimpan atau memperbarui memori untuk seorang pengguna di Sanity.
 * @param {string} userId ID unik pengguna WhatsApp.
 * @param {string} memoryText Teks yang ingin disimpan sebagai memori.
 * @param {object} contact Objek kontak dari whatsapp-web.js.
 */
async function saveUserMemory(userId, memoryText, contact) {
    try {
        console.log(`[Memori] Menyimpan memori untuk ${userId}...`);
        
        // Membuat ID dokumen yang aman untuk Sanity
        const docId = userId.replace(/[@.]/g, '-');
        
        // Menyiapkan dokumen yang akan disimpan
        const memoryDoc = {
            _type: 'memoriPengguna',
            _id: docId,
            userId: userId,
            namaPengguna: contact.pushname || contact.name || 'Tanpa Nama',
            ringkasanMemori: memoryText, // Langsung simpan teks dari pengguna
            terakhirUpdate: new Date().toISOString(),
        };

        // Menggunakan patch.set() untuk membuat dokumen jika belum ada, atau menimpanya jika sudah ada.
        // Ini adalah cara paling aman untuk 'upsert' (update or insert).
        await clientSanity.patch(docId).set(memoryDoc).commit({ autoGenerateArrayKeys: true });

        console.log(`[Memori] Berhasil menyimpan memori untuk ${userId}.`);
        return true; // Kembalikan true jika berhasil

    } catch (error) {
        console.error(`[Memori] Gagal menyimpan memori untuk ${userId}:`, error);
        return false; // Kembalikan false jika gagal
    }
}
// ▲▲▲ BATAS AKHIR FUNGSI BARU MEMORI ▲▲▲

// ▼▼▼ TAMBAHKAN FUNGSI BARU INI HAPUS FILE▼▼▼

/**
 * Menghapus file dari Google Drive berdasarkan ID-nya.
 * @param {string} fileId ID file di Google Drive.
 * @returns {Promise<boolean>} True jika berhasil, false jika gagal.
 */
async function hapusFileDiDrive(fileId) {
    try {
        // --- PERBAIKAN UTAMA ADA DI SINI ---
        // 1. Muat kredensial Google dari environment variable
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        
        // 2. Buat objek autentikasi
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive'], // Gunakan scope penuh untuk bisa menghapus
        });

        // 3. Buat koneksi ke Drive dengan autentikasi yang benar
        const drive = google.drive({ version: 'v3', auth });
        // --- AKHIR PERBAIKAN ---

        // 4. Jalankan perintah hapus
        await drive.files.delete({
            fileId: fileId,
            supportsAllDrives: true,
        });

        console.log(`[Drive] Berhasil menghapus file dengan ID: ${fileId}`);
        return true;

    } catch (error) {
        console.error(`[Drive] Gagal menghapus file dengan ID ${fileId}.`);
        console.error("================= DETAIL ERROR LENGKAP DARI GOOGLE =================\n", error, "\n==================================================================");
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
    setInterval(checkAndBroadcastGempa, 300000); // 300000 ms = 5 menit
});

// awal kode message
// ▼▼▼ GANTI SELURUH BLOK DARI client.on('message',...) SAMPAI AKHIR DENGAN INI ▼▼▼

client.on('message', async (message) => {
    try {
        if (!message.body) return; // Penjaga untuk pesan tanpa teks

        const chat = await message.getChat();
        const userMessage = message.body.trim();
        const userMessageLower = userMessage.toLowerCase();
        const userLastState = userState[message.from];

        // PRIORITAS #0: Menangani Pesan Kontak (vCard) - Diambil dari referensi Anda
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

        // BLOK 1: Menangani Interaksi Berbasis State - Diambil dari referensi Anda
        if (userLastState) {
            if (userLastState.type === 'ai_mode') {
                const exitCommands = ['selesai', 'stop', 'exit', 'keluar'];
                if (exitCommands.includes(userMessageLower)) {
                    await summarizeAndSaveMemory(message.from, userLastState.history);
                    delete userState[message.from];
                    await showMainMenu(message);
                    return message.reply('Sesi AI telah berakhir.');
                }

                // --- PERBAIKAN LOGIKA GANDA ADA DI SINI ---
                // Perintah "ingat saya" sekarang hanya ditangani di dalam mode AI.
                const memoryTriggers = ['ingat ini:', 'ingat saya:'];
                const trigger = memoryTriggers.find(t => userMessageLower.startsWith(t));

                if (trigger) {
                    const memoryText = userMessage.substring(trigger.length).trim();
                    if (!memoryText) return message.reply('Silakan berikan informasi yang ingin saya ingat.');
                    
                    const contact = await message.getContact();
                    const success = await saveUserMemory(message.from, memoryText, contact);
                    return message.reply(success ? '✅ Baik, saya sudah menyimpannya.' : '❌ Gagal menyimpan memori.');
                }
                // --- AKHIR PERBAIKAN ---
                
                await chat.sendStateTyping();
                const aiResponse = await getGeminiResponse(userMessage, userLastState.history);
                message.reply(aiResponse);
                userLastState.history.push({ role: 'user', parts: [{ text: userMessage }] });
                userLastState.history.push({ role: 'model', parts: [{ text: aiResponse }] });
                return;
            }

           // Di dalam client.on('message', ...) -> di dalam if(userLastState)

// ▼▼▼ GANTI BLOK MENU NUMERIK ANDA DENGAN VERSI LENGKAP INI ▼▼▼

            if ((['menu_utama', 'pegawai', 'link_pegawai_selection', 'file_search_result'].includes(userLastState.type)) && !isNaN(parseInt(userMessage))) {
                
                // Kondisi di atas sudah memastikan bahwa userMessage adalah angka
                // Jadi kita bisa langsung proses logikanya

                if (userMessage === '0') {
                    delete userState[message.from];
                    await showMainMenu(message);
                    return;
                }
                const index = parseInt(userMessage) - 1;
                if (index >= 0 && index < userLastState.list.length) {
                    const selectedItem = userLastState.list[index];
                    
                    // Penting: Hapus state SETELAH mengambil item yang dipilih
                    delete userState[message.from];

                    if (userLastState.type === 'menu_utama') {
                        if (selectedItem.subMenuRef) {
                            const subMenuQuery = `*[_type == "pustakaDataItem" && category._ref == $categoryId] | order(judul asc)`;
                            const subMenuItems = await clientSanity.fetch(subMenuQuery, { categoryId: selectedItem.subMenuRef._ref });
                            if (subMenuItems && subMenuItems.length > 0) {
                                userState[message.from] = { type: 'pustaka_data', list: subMenuItems, parentMenu: selectedItem.namaMenu };
                                let subMenuMessage = `*${selectedItem.namaMenu}*\n\n`;
                                subMenuItems.forEach((item, i) => {
                                    subMenuMessage += `${i + 1}. ${item.judul}\n`;
                                });
                                subMenuMessage += '\nBalas dengan *nomor* untuk melihat detail. Balas *0* untuk kembali.';
                                message.reply(subMenuMessage);
                            } else {
                                message.reply(`Maaf, belum ada data untuk kategori "${selectedItem.namaMenu}".`);
                            }
                        } else if (selectedItem.perintahKhusus === 'mulai_sesi_ai') {
                            const nomorBot = client.info.wid._serialized.split('@')[0];
                            const teksOtomatis = encodeURIComponent("tanya ai");
                            const linkWa = `https://wa.me/${nomorBot}?text=${teksOtomatis}`;
                            const replyMessage = `Untuk memulai sesi privat dengan Asisten AI, silakan klik link di bawah ini. Anda akan diarahkan ke chat pribadi dengan saya.\n\n${linkWa}`;
                            message.reply(replyMessage);
                        } else if (selectedItem.perintahKhusus === 'tampilkan_petunjuk_user_sipd') {
                            const result = await clientSanity.fetch(`*[_type == "botReply" && keyword == "petunjuk_cari_user"][0]`);
                            if (result) {
                                message.reply(result.jawaban + '\n\nBalas dengan *0* untuk kembali.');
                                userState[message.from] = { type: 'menu_utama', list: userLastState.list }; // Mengatur ulang state agar bisa kembali
                            }
                        }
                    } else if (userLastState.type === 'pegawai') {
                        const pegawai = selectedItem;
                        let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* \`\`\`${pegawai.nip || '-'}\`\`\`\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}\n\n🔑 *Akun & Kredensial*\n*Username SIPD:* \`\`\`${pegawai.usernameSipd || '-'}\`\`\`\n*Password SIPD:* \`\`\`${pegawai.passwordSipd || '-'}\`\`\`\n*Password Penatausahaan:* \`\`\`${pegawai.passwordPenatausahaan || '-'}\`\`\`\n\n📝 *Keterangan*\n${pegawai.keterangan || '-'}`;
                        if (pegawai.tipePegawai === 'admin') {
                            detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* \`\`\`${pegawai.userRakortek || '-'}\`\`\`\n*User Renstra:* \`\`\`${pegawai.sipdRenstra || '-'}\`\`\`\n*Password Renstra:* \`\`\`${pegawai.passRenstra || '-'}\`\`\``;
                        }
                        message.reply(detailMessage);
                    } else if (userLastState.type === 'link_pegawai_selection') {
                        await clientSanity.patch(selectedItem._id).set({ userId: userLastState.targetUserId }).commit();
                        message.reply(`✅ Berhasil! *${selectedItem.nama}* sekarang terhubung ke @${userLastState.targetUserNumber}.`);
                    } else if (userLastState.type === 'file_search_result') {
                        message.reply(`Pilihan tidak valid. Gunakan perintah \`kirim file ${userMessage}\` atau \`hapus file ${userMessage}\`.`);
                    }
                }
            }
// ▲▲▲ BATAS AKHIR BLOK MENU NUMERIK ▲▲▲

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
        
        // BLOK 2: Menangani Perintah Teks Global - Diambil dari referensi Anda
        
        if (userMessageLower === 'halo panda') {
            await showMainMenu(message);
        
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
                const dataFile = { _type: 'fileArsip', namaFile, googleDriveId: driveId, diunggahOleh: contact.pushname, groupId: chat.isGroup ? chat.id._serialized : 'pribadi', tipeFile: media.mimetype };
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
            
            userState[message.from] = { type: 'file_search_result', list: hasil };
            let reply = `Ditemukan ${hasil.length} file:\n\n`;
            hasil.forEach((f, i) => { reply += `${i + 1}. 📄 *${f.namaFile}*\n`; });
            reply += `\nBalas dengan \`kirim file <nomor>\` atau \`hapus file <nomor>\`. Balas *0* untuk batal.`;
            message.reply(reply);
        
        } else if (userMessageLower.startsWith('hapus file ')) {
            const state = userState[message.from];
            if (!state || state.type !== 'file_search_result') {
                return message.reply('Sesi pencarian tidak ditemukan. Lakukan `cari file` dahulu.');
            }
            const nomorPilihanStr = userMessage.substring('hapus file '.length).trim();
            const nomorPilihan = parseInt(nomorPilihanStr);
            if (isNaN(nomorPilihan) || nomorPilihan < 1 || nomorPilihan > state.list.length) {
                return message.reply(`Nomor tidak valid. Harap masukkan nomor antara 1 dan ${state.list.length}.`);
            }
            
            const fileData = state.list[nomorPilihan - 1];
            message.reply(`⏳ Menghapus file *"${fileData.namaFile}"*...`);

            const driveSuccess = await hapusFileDiDrive(fileData.googleDriveId);
            if (!driveSuccess) {
                message.reply('⚠️ Gagal menghapus file dari Google Drive (mungkin sudah dihapus). Melanjutkan penghapusan dari katalog...');
            }
            await clientSanity.delete(fileData._id);
            delete userState[message.from];
            return message.reply(`✅ Berhasil! File *"${fileData.namaFile}"* telah dihapus dari arsip.`);

        } else if (userMessageLower.startsWith('kirim file ')) {
            const state = userState[message.from];
            if (!state || state.type !== 'file_search_result') {
                return message.reply('Sesi pencarian tidak ditemukan. Lakukan `cari file` dahulu.');
            }
            const nomorPilihanStr = userMessage.substring('kirim file '.length).trim();
            const nomorPilihan = parseInt(nomorPilihanStr);
            if (isNaN(nomorPilihan) || nomorPilihan < 1 || nomorPilihan > state.list.length) {
                return message.reply(`Nomor tidak valid. Harap masukkan nomor antara 1 dan ${state.list.length}.`);
            }
            
            const fileData = state.list[nomorPilihan - 1];
            message.reply(`⏳ Mengambil file *"${fileData.namaFile}"*...`);
            await kirimFileDariDrive(fileData.googleDriveId, fileData.namaFile, message.from);
            delete userState[message.from];
        
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
            const parts = userMessage.split(' tentang ');
            if (parts.length < 2) return message.reply("Format salah. Contoh: `ingatkan saya dalam 10 menit tentang rapat`");
            const timePart = parts[0].replace('ingatkan saya dalam ', '').trim();
            const messagePart = parts.slice(1).join(' tentang ').trim();
            const timeParts = timePart.split(' ');
            const amount = parseInt(timeParts[0]);
            const unit = timeParts[1];
            if (isNaN(amount)) return message.reply("Jumlah waktu tidak valid.");
            const now = new Date();
            if (unit.startsWith('menit')) now.setMinutes(now.getMinutes() + amount);
            else if (unit.startsWith('jam')) now.setHours(now.getHours() + amount);
            else if (unit.startsWith('hari')) now.setDate(now.getDate() + amount);
            else return message.reply("Unit waktu tidak dikenali. Gunakan 'menit', 'jam', atau 'hari'.");
            const reminderData = { _type: 'pengingat', pesan: messagePart, waktu: now.toISOString(), targetUserId: message.from, terkirim: false };
            await clientSanity.create(reminderData);
            message.reply(`✅ Baik, saya akan mengingatkan Anda tentang "${messagePart}" pada ${now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })}.`);
        
        } else if (userMessageLower === 'help' || userMessageLower === 'bantuan') {
            const query = `*[_type == "perintahBantuan"] | order(urutan asc)`;
            const semuaPerintah = await clientSanity.fetch(query);
            if (!semuaPerintah || semuaPerintah.length === 0) return message.reply("Daftar perintah bantuan belum diatur.");
            const isAdmin = await isUserAdmin(message.from);
            const perintahUmum = semuaPerintah.filter(p => !p.isAdminOnly);
            const perintahAdmin = semuaPerintah.filter(p => p.isAdminOnly);
            let helpMessage = `*MENU BANTUAN* 📚\n\n*✨ Perintah Umum*\n--------------------\n`;
            perintahUmum.forEach(cmd => { helpMessage += `• *${cmd.perintah}* - ${cmd.deskripsi}\n`; });
            if (isAdmin && perintahAdmin.length > 0) {
                helpMessage += `\n*🔑 Perintah Admin*\n--------------------\n`;
                perintahAdmin.forEach(cmd => { helpMessage += `• *${cmd.perintah}* - ${cmd.deskripsi}\n`; });
            }
            message.reply(helpMessage);
        
        } else if (userMessageLower.startsWith('tambah pegawai')) {
            if (!(await isUserAdmin(message.from))) return message.reply('❌ Perintah ini hanya untuk admin.');
            const mentions = await message.getMentions();
            if (!mentions || mentions.length === 0) return message.reply('Anda harus me-mention pengguna yang ingin ditambahkan.');
            const targetUser = mentions[0];
            const newPegawai = {
                _type: 'pegawai',
                nama: targetUser.pushname || targetUser.name || 'Nama Belum Diatur',
                userId: targetUser.id._serialized,
                tipePegawai: 'user' 
            };
            try {
                await clientSanity.create(newPegawai, { ifNotExists: `userId == "${targetUser.id._serialized}"` });
                message.reply(`✅ Pegawai baru *${newPegawai.nama}* telah ditambahkan.`);
            } catch (error) {
                message.reply('Gagal menambahkan pegawai. Mungkin sudah ada.');
            }
        
        } else if (userMessageLower.startsWith('update pegawai')) {
            if (!(await isUserAdmin(message.from))) return message.reply('❌ Perintah ini hanya untuk admin.');
            const mentions = await message.getMentions();
            if (!mentions || mentions.length === 0) return message.reply('Anda harus me-mention pengguna yang ingin di-update.');
            const targetUser = mentions[0];
            const commandBody = userMessage.split(' ').slice(2).join(' ');
            const [field, value] = commandBody.split('=').map(s => s.trim());
            if (!field || !value) return message.reply('Format salah. Contoh: `update pegawai @user tipePegawai = admin`');
            
            const query = `*[_type == "pegawai" && userId == "${targetUser.id._serialized}"][0]`;
            const pegawaiDoc = await clientSanity.fetch(query);
            if (!pegawaiDoc) return message.reply('Pegawai tidak ditemukan.');

            try {
                await clientSanity.patch(pegawaiDoc._id).set({ [field]: value }).commit();
                message.reply(`✅ Data pegawai *${pegawaiDoc.nama}* telah di-update: *${field}* sekarang menjadi *${value}*.`);
            } catch (error) {
                message.reply('Gagal meng-update data pegawai.');
            }
        
        } else if (userMessageLower === 'cuaca') {
            userState[message.from] = { type: 'menunggu_lokasi_cuaca' };
            await message.reply('Silakan ketik nama kota.');
        
        } else {
            // BLOK 3: Pemicu Mode AI (JIKA TIDAK ADA PERINTAH LAIN YANG COCOK)
            const aiTriggerCommands = ['tanya ai', 'mode ai', 'sesi ai', 'panda ai', 'info gempa'];
            if (!chat.isGroup && aiTriggerCommands.some(cmd => userMessageLower.startsWith(cmd))) {
                
                const memoryContext = await loadMemory(message.from);
                const initialHistory = [
                    { role: 'user', parts: [{ text: "Konteks tentang saya: " + memoryContext }] },
                    { role: 'model', parts: [{ text: "Baik, saya mengerti." }] }
                ];

                userState[message.from] = { type: 'ai_mode', history: initialHistory };
                
                await chat.sendStateTyping();
                const aiResponse = await getGeminiResponse(userMessage, userState[message.from].history);
                message.reply(aiResponse);

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
// ▲▲▲ AKHIR DARI BLOK message ▲▲▲
// akhir kode message


// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();