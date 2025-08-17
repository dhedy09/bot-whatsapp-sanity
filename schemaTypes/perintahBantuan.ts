// schemas/perintahBantuan.ts
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'perintahBantuan',
  title: 'Perintah Bantuan',
  type: 'document',
  fields: [
    defineField({
      name: 'perintah',
      title: 'Teks Perintah',
      type: 'string',
      description: 'Tulis perintahnya di sini (misal: cari user [nama])',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'deskripsi',
      title: 'Deskripsi Singkat',
      type: 'text',
      description: 'Jelaskan fungsi dari perintah ini.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'isAdminOnly',
      title: 'Hanya untuk Admin?',
      type: 'boolean',
      description: 'Aktifkan jika perintah ini hanya boleh dilihat oleh admin.',
      initialValue: false,
    }),
    defineField({
      name: 'urutan',
      title: 'Nomor Urut Tampilan',
      type: 'number',
      description: 'Perintah akan diurutkan dari angka terkecil.',
    }),
  ],
  preview: {
    select: {
      title: 'perintah',
      subtitle: 'deskripsi',
      isAdmin: 'isAdminOnly',
    },
    prepare({title, subtitle, isAdmin}) {
      // ▼▼▼ BAGIAN INI SUDAH DIPERBAIKI ▼▼▼
      return {
        title: title,
        subtitle: subtitle,
        // Baris 'media' yang menyebabkan error sudah dihapus
      }
    },
  },
})