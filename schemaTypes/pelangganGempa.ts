import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'pelangganGempa',
  title: 'Pelanggan Info Gempa',
  type: 'document',
  fields: [
    defineField({
      name: 'userId',
      title: 'User ID (WhatsApp)',
      type: 'string',
      description: 'Nomor WhatsApp unik pelanggan (628...@c.us)',
      readOnly: true, // Sebaiknya read-only agar tidak salah edit manual
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'namaPengguna',
      title: 'Nama Pengguna',
      type: 'string',
      description: 'Nama pushname dari kontak WhatsApp saat mendaftar.',
      readOnly: true,
    }),
    defineField({
      name: 'tanggalDaftar',
      title: 'Tanggal Daftar',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  // Tampilan preview agar mudah dibaca di Sanity Studio
  preview: {
    select: {
      title: 'namaPengguna',
      subtitle: 'userId',
    },
  },
});