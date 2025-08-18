import { defineType, defineField } from 'sanity';

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
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'namaPengguna',
      title: 'Nama Pengguna',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'ringkasanMemori',
      title: 'Ringkasan Memori',
      type: 'text',
      description: 'Ringkasan otomatis dari percakapan AI dengan pengguna.',
    }),
     defineField({
      name: 'terakhirUpdate',
      title: 'Terakhir Diperbarui',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'namaPengguna',
      subtitle: 'ringkasanMemori',
    },
  },
});