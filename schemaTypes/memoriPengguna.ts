export default {
  name: 'memoriPengguna',
  title: 'Memori Pengguna Bot',
  type: 'document',
  fields: [
    {
      name: 'userId',
      title: 'User ID (WhatsApp)',
      type: 'string',
      readOnly: true,
    },
    {
      name: 'namaPanggilan',
      title: 'Nama Panggilan',
      type: 'string',
    },
    {
      name: 'daftarMemori',
      title: 'Daftar Memori',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'List memori AI yang diingat untuk user ini',
    },
  ],
}
