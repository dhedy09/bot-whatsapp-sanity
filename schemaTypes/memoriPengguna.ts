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
    }),
    defineField({
      name: 'namaPengguna',
      title: 'Nama Pengguna',
      type: 'string',
    }),
    defineField({
      name: 'daftarMemori',
      title: 'Daftar Memori',
      type: 'array',
      of: [{type: 'text'}] // Array berisi teks panjang
    })
  ],
  preview: {
    select: {
      title: 'namaPengguna',
      subtitle: 'userId'
    }
  }
})