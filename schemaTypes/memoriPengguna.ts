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
      readOnly: true, // Sebaiknya read-only agar tidak diubah manual
    }),
    defineField({
      name: 'namaPengguna',
      title: 'Nama Pengguna',
      type: 'string',
      readOnly: true, // Sebaiknya read-only
    }),
    defineField({
      name: 'daftarMemori',
      title: 'Daftar Memori',
      type: 'array',
      // ▼▼▼ SATU-SATUNYA PERUBAHAN ADA DI SINI ▼▼▼
      of: [{type: 'string'}] // Ganti 'text' menjadi 'string'
      // ▲▲▲ BATAS AKHIR PERUBAHAN ▲▲▲
    })
  ],
  preview: {
    select: {
      title: 'namaPengguna',
      subtitle: 'userId'
    }
  }
})