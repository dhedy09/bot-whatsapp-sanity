// file: schemas/memoriPengguna.js
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
      name: 'memori',
      title: 'Memori AI (Catatan Personal)',
      type: 'text',
    },
  ],
}