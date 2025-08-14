// schemas/nomorTerdaftar.ts
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'nomorTerdaftar',
  title: 'Nomor WhatsApp Terdaftar',
  type: 'document',
  fields: [
    defineField({
      name: 'namaPengguna',
      title: 'Nama Pengguna',
      type: 'string',
      description: 'Nama pemilik nomor WhatsApp.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'nomorWhatsapp',
      title: 'Nomor WhatsApp',
      type: 'string',
      description: 'Masukkan nomor dengan format 628... (contoh: 6281234567890)',
      validation: (Rule) =>
        Rule.required().regex(/^62\d{9,15}$/, {
          name: 'format-nomor',
          invert: false,
        }),
    }),
    defineField({
        name: 'keterangan',
        title: 'Keterangan',
        type: 'text',
        description: 'Catatan tambahan (opsional).'
    })
  ],
  preview: {
    select: {
      title: 'namaPengguna',
      subtitle: 'nomorWhatsapp',
    },
  },
})