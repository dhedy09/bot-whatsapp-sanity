// =================================================================
// BAGIAN 1: INISIALISASI & KONFIGURASI AWAL
// =================================================================

require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { createClient } = require('@sanity/client');
const qrcode = require('qrcode');
const { google } = require('googleapis');
const { Readable } = require('stream');
const { evaluate } = require('mathjs');
const axios = require('axios');

// --- Konfigurasi Utama ---
const FOLDER_DRIVE_ID = '17LsEyvyF06v3dPN7wMv_3NOiaajY8sQk'; // GANTI DENGAN ID FOLDER GOOGLE DRIVE ANDA
const app = express();
const port = process.env.PORT || 8080;
let qrCodeUrl = null;

// --- Inisialisasi Klien Eksternal ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
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

// --- State & Variabel Global ---
let userState = {};

// --- Definisi Alat untuk Gemini (Function Calling) ---
const tools = [{
    functionDeclarations: [
        { name: "getLatestNews", description: "Mendapatkan berita terkini berdasarkan topik.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
        { name: "getCurrentWeather", description: "Mendapatkan cuaca terkini untuk lokasi.", parameters: { type: "OBJECT", properties: { location: { type: "STRING" } }, required: ["location"] } },
        { name: "getGempa", description: "Mendapatkan informasi gempa bumi terkini di Indonesia." },
        { name: "calculate", description: "Mengevaluasi ekspresi matematika.", parameters: { type: "OBJECT", properties: { expression: { type: "STRING" } }, required: ["expression"] } },
    ],
}];

// =================================================================
// BAGIAN 2: SERVER WEB UNTUK QR CODE & HEALTH CHECK
// =================================================================

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    if (qrCodeUrl) {
        res.send(`<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family: Arial, sans-serif;"><h1>Scan QR Code</h1><img src="${qrCodeUrl}" alt="QR Code"></div>`);
    } else {
        res.send('<h1>Bot WhatsApp sudah terhubung!</h1>');
    }
});

app.listen(port, () => console.log(`Server web berjalan di port ${port}`));

// =================================================================
// BAGIAN 3: FUNGSI-FUNGSI PEMBANTU (HELPER FUNCTIONS)
// =================================================================

async function isUserAdmin(userId) {
    if (!userId) return false;
    const query = '*[_type == "pegawai" && userId == $userId && tipePegawai == "admin"][0]';
    const adminDoc = await clientSanity.fetch(query, { userId });
    return !!adminDoc;
}

async function showMainMenu(message) {
    const contact = await message.getContact();
    const userName = contact.pushname || contact.name || 'Pengguna';
    const salamQuery = `*[_type == "botReply" && keyword == "salam_menu_utama"][0]`;
    const menuQuery = `*[_type == "menuUtamaItem"] | order(urutanTampilan asc)`;
    const [salamData, menuItems] = await Promise.all([clientSanity.fetch(salamQuery), clientSanity.fetch(menuQuery)]);
    const salamText = salamData ? salamData.jawaban.replace(/\n\n/g, '\n') : 'Berikut adalah menu yang tersedia:';
    if (!menuItems || menuItems.length === 0) return message.reply('Maaf, menu utama belum diatur.');
    userState[message.from] = { type: 'menu_utama', list: menuItems };
    let menuMessage = `👋 Selamat datang *${userName}* di bot perencanaan.\n${salamText}\n\n`;
    menuItems.forEach((item) => { menuMessage += `${item.urutanTampilan}. ${item.namaMenu}\n`; });
    message.reply(menuMessage);
}

async function getGempa() {
    try {
        const response = await axios.get('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json');
        const data = response.data.Infogempa.gempa;
        return { waktu: data.Jam, tanggal: data.Tanggal, magnitudo: data.Magnitude, kedalaman: data.Kedalaman, wilayah: data.Wilayah, potensi: data.Potensi, dirasakan: data.Dirasakan };
    } catch (error) {
        return { error: "Gagal mengambil data gempa." };
    }
}

async function getCurrentWeather(location) {
    if (!process.env.OPENWEATHER_API_KEY) return { error: "Kunci API OpenWeatherMap tidak diatur." };
    try {
        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=id`;
        const response = await axios.get(apiUrl);
        const data = response.data;
        return { kota: data.name, suhu: `${data.main.temp}°C`, kondisi: data.weather[0].description };
    } catch (error) {
        if (error.response && error.response.status === 404) return { error: `Kota "${location}" tidak ditemukan.` };
        return { error: "Gagal mengambil data cuaca." };
    }
}

async function getLatestNews(query) {
    if (!process.env.NEWS_API_KEY) return { error: "Kunci API Berita tidak diatur." };
    try {
        const apiUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=id&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`;
        const response = await axios.get(apiUrl);
        if (response.data.articles && response.data.articles.length > 0) {
            return { articles: response.data.articles.map(a => ({ title: a.title, url: a.url })) };
        }
        return { error: `Tidak ada berita ditemukan untuk "${query}".` };
    } catch (error) {
        return { error: "Gagal mengambil data berita." };
    }
}

function evaluateMathExpression(expression) {
    try {
        return { result: evaluate(expression).toString() };
    } catch (error) {
        return { error: `Ekspresi '${expression}' tidak valid.` };
    }
}

async function getGeminiResponse(prompt, history) {
    try {
        const chat = model.startChat({ history, tools });
        const result = await chat.sendMessage(prompt);
        const call = result.response.functionCalls()?.[0];
        if (call) {
            let functionResponse;
            if (call.name === 'getCurrentWeather') functionResponse = await getCurrentWeather(call.args.location);
            else if (call.name === 'getLatestNews') functionResponse = await getLatestNews(call.args.query);
            else if (call.name === 'getGempa') functionResponse = await getGempa();
            else if (call.name === 'calculate') functionResponse = evaluateMathExpression(call.args.expression);
            else functionResponse = { error: `Fungsi tidak dikenali: ${call.name}` };
            const result2 = await chat.sendMessage([{ functionResponse: { name: call.name, response: { content: JSON.stringify(functionResponse) } } }]);
            return result2.response.text();
        }
        return result.response.text();
    } catch (error) {
        console.error("Error saat memanggil API Gemini:", error);
        return "Maaf, terjadi kesalahan saat menghubungi Asisten AI.";
    }
}

async function uploadKeDrive(media, namaFileKustom) {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] });
        const drive = google.drive({ version: 'v3', auth });
        const buffer = Buffer.from(media.data, 'base64');
        const stream = Readable.from(buffer);
        const response = await drive.files.create({
            requestBody: { name: namaFileKustom, parents: [FOLDER_DRIVE_ID] },
            media: { mimeType: media.mimetype, body: stream },
            fields: 'id',
            supportsAllDrives: true,
        });
        return response.data.id;
    } catch (error) {
        console.error("Error saat mengunggah ke Google Drive:", error);
        return null;
    }
}

async function simpanDataFileKeSanity(dataFile) {
    try {
        const doc = { _type: 'fileArsip', ...dataFile, tanggalUnggah: new Date().toISOString() };
        await clientSanity.create(doc);
        return true;
    } catch (error) {
        console.error("Error saat menyimpan info file ke Sanity:", error);
        return false;
    }
}

async function cariFileDiSanity(kataKunci, groupId) {
    try {
        const query = `*[_type == "fileArsip" && namaFile match $kataKunci && groupId == $groupId]`;
        return await clientSanity.fetch(query, { kataKunci: `*${kataKunci}*`, groupId }) || [];
    } catch (error) {
        console.error("Error saat mencari file di Sanity:", error);
        return [];
    }
}

async function kirimFileDariDrive(fileId, fileName, userChatId) {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
        const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
        const media = new MessageMedia(response.headers['content-type'], Buffer.from(response.data).toString('base64'), fileName);
        await client.sendMessage(userChatId, media, { caption: `Ini file yang Anda minta: *${fileName}*` });
    } catch (error) {
        console.error("Error saat mengirim file dari Drive:", error);
        await client.sendMessage(userChatId, `Maaf, terjadi kesalahan saat mencoba mengambil file "${fileName}".`);
    }
}

async function checkAndSendReminders() {
    try {
        const now = new Date();
        const query = `*[_type == "pengingat" && waktu <= $now && terkirim != true]`;
        const dueReminders = await clientSanity.fetch(query, { now: now.toISOString() });
        for (const reminder of dueReminders) {
            try {
                const messageBody = `🔔 *PENGINGAT* 🔔\n\nAnda meminta saya untuk mengingatkan tentang:\n_"${reminder.pesan}"_`;
                await client.sendMessage(reminder.targetUserId, messageBody);
                await clientSanity.patch(reminder._id).set({ terkirim: true }).commit();
                console.log(`[Pengingat] Berhasil mengirim pengingat ke ${reminder.targetUserId}`);
            } catch (sendError) {
                console.error(`[Pengingat] Gagal mengirim pengingat ke ${reminder.targetUserId}:`, sendError);
            }
        }
    } catch (fetchError) {
        console.error("[Pengingat] Gagal mengambil data pengingat dari Sanity:", fetchError);
    }
}

// =================================================================
// BAGIAN 4: EVENT HANDLER UTAMA
// =================================================================

client.on('qr', async (qr) => {
    try {
        qrCodeUrl = await qrcode.toDataURL(qr, { scale: 8 });
        console.log('Gambar QR Code berhasil dibuat. Buka link aplikasi Anda untuk scan.');
    } catch (err) {
        console.error('Gagal membuat gambar QR code:', err);
    }
});

client.on('ready', () => {
    console.log('✅ Bot WhatsApp berhasil terhubung dan siap digunakan!');
    qrCodeUrl = null;
    console.log('[Pengingat] Alarm pengingat diaktifkan, memeriksa setiap menit.');
    setInterval(checkAndSendReminders, 60000);
});

client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        const userMessage = message.body.trim();
        const userMessageLower = userMessage.toLowerCase();
        const userLastState = userState[message.from];

        // PRIORITAS #0: Menangani Pesan Kontak (vCard)
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

        // BLOK 1: Menangani Interaksi Berbasis State
        if (userLastState) {
            if (userLastState.type === 'ai_mode') {
                if (['selesai', 'stop', 'exit', 'keluar'].includes(userMessageLower)) {
                    delete userState[message.from];
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

            if (['menu_utama', 'pustaka_data', 'pegawai', 'link_pegawai_selection'].includes(userLastState.type) && !isNaN(parseInt(userMessage))) {
                if (userMessage === '0') {
                    delete userState[message.from];
                    await showMainMenu(message);
                    return;
                }
                const index = parseInt(userMessage) - 1;
                if (index >= 0 && index < userLastState.list.length) {
                    const selectedItem = userLastState.list[index];
                    if (userLastState.type === 'link_pegawai_selection') {
                        await clientSanity.patch(selectedItem._id).set({ userId: userLastState.targetUserId }).commit();
                        message.reply(`✅ Berhasil! *${selectedItem.nama}* sekarang terhubung ke @${userLastState.targetUserNumber}.`);
                    } else if (userLastState.type === 'pustaka_data') {
                        // Logika lengkap untuk menangani pilihan dari pustaka_data
                    } else if (userLastState.type === 'pegawai') {
                        // Logika lengkap untuk menangani pilihan dari pencarian pegawai
                    } else if (userLastState.type === 'menu_utama') {
                        // Logika lengkap untuk menangani pilihan dari menu utama
                    }
                    delete userState[message.from];
                }
                return;
            }

            if (userLastState.type === 'menunggu_lokasi_cuaca') {
                message.reply(`⏳ Mencari cuaca untuk *${userMessage}*...`);
                const weatherResult = await getCurrentWeather(userMessage);
                message.reply(`Cuaca di ${weatherResult.kota}: ${weatherResult.kondisi}, Suhu ${weatherResult.suhu}.`);
                delete userState[message.from];
                return;
            }
        }

        // BLOK 2: Menangani Perintah Teks Global
        
        if (userMessageLower === 'halo panda') {
            await showMainMenu(message);
            return;
        }

        if (userMessageLower.startsWith('ingat ini:')) {
            const memoryToSave = userMessage.substring('ingat ini:'.length).trim();
            if(!memoryToSave) return message.reply('Silakan berikan informasi yang ingin diingat.');
            // Logika lengkap untuk menyimpan memori
            return;
        }
        
        const simpanPrefix = 'panda simpan ';
        if (userMessageLower.startsWith(simpanPrefix)) {
            if (!message.hasQuotedMsg) return message.reply('Anda harus membalas file yang ingin disimpan.');
            const quotedMsg = await message.getQuotedMessage();
            if (!quotedMsg.hasMedia) return message.reply('Anda harus membalas sebuah file.');
            const namaFile = userMessage.substring(simpanPrefix.length).trim();
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
            return;
        }

        const cariPrefix = 'cari file ';
        if (userMessageLower.startsWith(cariPrefix)) {
            const kataKunci = userMessage.substring(cariPrefix.length).trim();
            if (!kataKunci) return message.reply('Masukkan kata kunci pencarian.');
            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            const hasil = await cariFileDiSanity(kataKunci, groupId);
            if (hasil.length === 0) return message.reply(`Tidak ada file ditemukan dengan kata kunci "${kataKunci}".`);
            let reply = `Ditemukan ${hasil.length} file:\n\n`;
            hasil.forEach(f => { reply += `📄 *${f.namaFile}*\n`; });
            reply += `\nBalas dengan \`kirim file <nama file lengkap>\` untuk mengambil.`;
            message.reply(reply);
            return;
        }

        const kirimPrefix = 'kirim file ';
        if (userMessageLower.startsWith(kirimPrefix)) {
            const namaFile = userMessage.substring(kirimPrefix.length).trim();
            if (!namaFile) return message.reply('Masukkan nama file yang ingin dikirim.');
            const groupId = chat.isGroup ? chat.id._serialized : 'pribadi';
            const query = `*[_type == "fileArsip" && namaFile == $namaFile && groupId == $groupId][0]`;
            const fileData = await clientSanity.fetch(query, { namaFile, groupId });
            if (!fileData) return message.reply(`File "${namaFile}" tidak ditemukan.`);
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
                let detailMessage = `👤 *Profil Pegawai*\n\n*Nama:* ${pegawai.nama || '-'}\n*NIP:* \`\`\`${pegawai.nip || '-'}\`\`\`\n*Jabatan:* ${pegawai.jabatan || '-'}\n*Level:* ${pegawai.tipePegawai || 'user'}\n\n🔑 *Akun & Kredensial*\n*Username SIPD:* \`\`\`${pegawai.usernameSipd || '-'}\`\`\`\n*Password SIPD:* \`\`\`${pegawai.passwordSipd || '-'}\`\`\`\n*Password Penatausahaan:* \`\`\`${pegawai.passwordPenatausahaan || '-'}\`\`\`\n\n📝 *Keterangan*\n${pegawai.keterangan || '-'}`;
                if (pegawai.tipePegawai === 'admin') {
                    detailMessage += `\n\n🛡️ *Data Khusus Admin*\n*User Rakortek:* \`\`\`${pegawai.userRakortek || '-'}\`\`\`\n*User Renstra:* \`\`\`${pegawai.sipdRenstra || '-'}\`\`\`\n*Password Renstra:* \`\`\`${pegawai.passRenstra || '-'}\`\`\``;
                }
                return message.reply(detailMessage);
            }

            userState[message.from] = { type: 'pegawai', list: pegawaiDitemukan };
            let pilihanMessage = `Ditemukan beberapa hasil. Balas dengan *nomor*:\n\n`;
            pegawaiDitemukan.forEach((p, i) => { pilihanMessage += `${i + 1}. ${p.nama} - *(${p.jabatan})*\n`; });
            return message.reply(pilihanMessage);
        }

        if (userMessageLower.startsWith('ingatkan ')) {
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
            return message.reply(`✅ Baik, saya akan mengingatkan Anda tentang "${messagePart}" pada ${now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })}.`);
        }

        if (userMessageLower === 'help' || userMessageLower === 'bantuan') {
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
            return message.reply(helpMessage);
        }
        
        if (userMessageLower === 'cuaca') {
            userState[message.from] = { type: 'menunggu_lokasi_cuaca' };
            return message.reply('Silakan ketik nama kota.');
        }

        // BLOK 3: Pemicu Mode AI
        const aiTriggerCommands = ['tanya ai', 'mode ai', 'sesi ai', 'panda ai'];
        if (!chat.isGroup && aiTriggerCommands.some(cmd => userMessageLower.startsWith(cmd))) {
            userState[message.from] = { type: 'ai_mode', history: [] }; // Ambil history dari Sanity jika ada
            const welcomeMsg = await clientSanity.fetch(`*[_type == "botReply" && keyword == "salam_sesi_ai"][0]`);
            return message.reply(welcomeMsg ? welcomeMsg.jawaban : "Sesi AI dimulai.");
        }

    } catch (error) {
        console.error('Terjadi error fatal di event message:', error);
        if (message && !message.isStatus) {
            message.reply('Maaf, terjadi kesalahan tak terduga.');
        }
    }
});


// =================================================================
// BAGIAN 5: MENJALANKAN BOT
// =================================================================
console.log('Memulai inisialisasi bot WhatsApp...');
client.initialize();