// schemas/pengingat.ts
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'pengingat',
  title: 'Jadwal Pengingat',
  type: 'document',
  fields: [
    defineField({
      name: 'pesan',
      title: 'Isi Pesan Pengingat',
      type: 'text',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'targetNomorHp',
      title: 'Nomor HP Target',
      type: 'string',
      description: 'Nomor HP pengguna yang akan dikirimi pengingat (format: 628...-c-us).',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'targetNama',
      title: 'Nama Target',
      type: 'string',
      description: 'Nama pengguna yang akan dikirimi pengingat.',
    }),
    defineField({
      name: 'waktuKirim',
      title: 'Waktu Kirim',
      type: 'datetime',
      description: 'Tanggal dan waktu pengingat akan dikirim.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Menunggu', value: 'menunggu'},
          {title: 'Terkirim', value: 'terkirim'},
          {title: 'Gagal', value: 'gagal'},
        ],
        layout: 'radio',
      },
      initialValue: 'menunggu',
      validation: Rule => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'pesan',
      subtitle: 'targetNama',
      waktu: 'waktuKirim',
      status: 'status',
    },
    prepare({title, subtitle, waktu, status}) {
      const waktuLokal = new Date(waktu).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      // ▼▼▼ BAGIAN INI SUDAH DIPERBAIKI ▼▼▼
      return {
        title: title,
        subtitle: `Untuk: ${subtitle || 'Tidak Diketahui'} | ${waktuLokal} | Status: ${status}`,
        // Baris 'media' yang menyebabkan error sudah dihapus
      }
    },
  },
})