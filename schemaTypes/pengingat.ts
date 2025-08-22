// file: schemas/pengingat.js
export default {
  name: 'pengingat',
  title: 'Data Pengingat Pengguna',
  type: 'document',
  fields: [
    {
      name: 'userId',
      title: 'User ID (WhatsApp)',
      type: 'string',
    },
    {
      name: 'pesan',
      title: 'Pesan Pengingat',
      type: 'string',
    },
    {
      name: 'waktuJatuhTempo',
      title: 'Waktu Jatuh Tempo',
      type: 'datetime', // Tipe datetime untuk menyimpan tanggal dan waktu
    },
    {
      name: 'sudahDikirim',
      title: 'Status Terkirim?',
      type: 'boolean',
      initialValue: false, // Defaultnya belum terkirim
    },
  ],
}