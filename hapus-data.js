// Nama file: hapus-data.js

const { createClient } = require('@sanity/client');

// PENTING: Gunakan konfigurasi yang sama persis dengan file index.js Anda
const client = createClient({
  projectId: 'dk0so8pj',
  dataset: 'production',
  apiVersion: '2025-08-13', // Gunakan tanggal hari ini
  token: 'sk3NotZCkggHNahNinFzq2SscUqQqUGhFhRvSTySkdXRYMfChy3ROnN1eotWSUieSKtZupsFYc2QfjVwCCJCu0lRsgBsLV2f6aFrV499i2hmXSPLbIoFYqk5vjkYa5vMEv5mGjbhDLVq05ZzIlnbNmN1R6tLBTIf7fMmtVIWxJ7tg3qF339P',
  useCdn: false,
});

// Query untuk menemukan semua dokumen dengan tipe 'pegawai'
const query = '*[_type == "pegawai"]._id';

async function hapusSemuaPegawai() {
  console.log('Mencari semua ID data pegawai untuk dihapus...');
  try {
    const ids = await client.fetch(query);
    
    if (!ids || ids.length === 0) {
      console.log('Tidak ada data pegawai yang ditemukan untuk dihapus. Selesai.');
      return;
    }

    console.log(`Ditemukan ${ids.length} data pegawai. Memulai proses penghapusan...`);
    
    // Membuat transaksi untuk menghapus semua dokumen berdasarkan ID
    let transaction = client.transaction();
    ids.forEach(id => {
      transaction.delete(id);
    });

    // Menjalankan (commit) transaksi
    await transaction.commit();
    console.log('✅ BERHASIL! Semua data pegawai duplikat telah dihapus.');

  } catch (err) {
    console.error('Terjadi error saat menghapus dokumen:', err.message);
  }
}

// Menjalankan fungsi utama
hapusSemuaPegawai();