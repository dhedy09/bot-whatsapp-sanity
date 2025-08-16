const { google } = require('googleapis');

async function testDriveConnection() {
  console.log("Mencoba melakukan otentikasi dari file credentials.json...");

  try {
    // Melakukan otentikasi LANGSUNG dari file
    const auth = new google.auth.GoogleAuth({
      keyFile: './credentials.json', // Langsung menunjuk ke file Anda
      scopes: ['https://www.googleapis.com/auth/drive.readonly'], // Hanya izin baca untuk tes
    });

    const drive = google.drive({ version: 'v3', auth });

    // Mencoba mengambil daftar 1 file (tes koneksi)
    console.log("Mencoba mengambil daftar file...");
    await drive.files.list({
      pageSize: 1,
      fields: 'files(id, name)',
    });

    console.log("✅ SELAMAT! Koneksi dan otentikasi dari file credentials.json berhasil.");

  } catch (error) {
    console.error("\n❌ GAGAL! Terjadi eror saat tes koneksi ke Google Drive:");
    // Mencetak hanya bagian penting dari eror
    if (error.response && error.response.data) {
        console.error("   Error:", error.response.data);
    } else {
        console.error("   Error:", error.message);
    }
  }
}

testDriveConnection();