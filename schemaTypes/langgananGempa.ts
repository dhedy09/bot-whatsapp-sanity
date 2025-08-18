export default {
  name: 'langgananGempa',
  type: 'document',
  title: 'Langganan Info Gempa',
  fields: [
    { name: 'userId', type: 'string', title: 'ID WhatsApp Pengguna' },
    { name: 'namaPengguna', type: 'string', title: 'Nama Pengguna' },
    { name: 'status', type: 'string', title: 'Status Langganan', options: { list: ['aktif', 'nonaktif'] }, initialValue: 'aktif' },
    { name: 'tanggalDaftar', type: 'datetime', title: 'Tanggal Daftar', initialValue: (new Date()).toISOString() }
  ]
}