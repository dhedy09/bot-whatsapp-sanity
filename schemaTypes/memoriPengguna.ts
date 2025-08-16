// schemas/memoriPengguna.ts
import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'memoriPengguna',
  title: 'Memori Pengguna',
  type: 'document',
  fields: [
    defineField({
      name: 'userId',
      title: 'User ID (WhatsApp)',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'namaPengguna',
      title: 'Nama Pengguna',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'daftarMemori',
      title: 'Daftar Memori',
      type: 'array',
      of: [{type: 'string'}], // Ini sudah benar
    })
  ],
  preview: {
    select: {
      title: 'namaPengguna',
      subtitle: 'userId'
    }
  }
})