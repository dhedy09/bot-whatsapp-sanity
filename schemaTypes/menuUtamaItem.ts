// schemas/menuUtamaItem.ts
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'menuUtamaItem',
  title: 'Item Menu Utama',
  type: 'document',
  fields: [
    defineField({
      name: 'namaMenu',
      title: 'Nama Menu',
      type: 'string',
      description: 'Teks yang akan muncul di tombol menu WhatsApp.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'urutanTampilan',
      title: 'Urutan Tampilan',
      type: 'number',
      description: 'Nomor urut menu (1, 2, 3, dst.).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tipeLink',
      title: 'Tipe Link Menu',
      type: 'string',
      options: {
        list: [
          {title: 'Link ke Kategori Pustaka Data', value: 'kategori_pustaka'},
          {title: 'Menjalankan Perintah Khusus', value: 'perintah_khusus'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'linkKategori',
      title: 'Link ke Kategori Pustaka',
      type: 'reference',
      to: [{type: 'kategoriPustaka'}],
      description: 'Pilih "folder" di Pustaka Data yang dituju. Kosongkan untuk menuju level paling atas.',
      // Hanya tampilkan field ini jika 'Tipe Link' adalah 'kategori_pustaka'
      hidden: ({parent}) => parent?.tipeLink !== 'kategori_pustaka',
    }),
    defineField({
      name: 'perintahKhusus',
      title: 'Perintah Khusus',
      type: 'string',
      description: 'Kata kunci unik untuk ditangani oleh bot (contoh: tampilkan_petunjuk_user_sipd).',
      // Hanya tampilkan field ini jika 'Tipe Link' adalah 'perintah_khusus'
      hidden: ({parent}) => parent?.tipeLink !== 'perintah_khusus',
    }),
  ],
  // Mengatur urutan default berdasarkan nomor urut
  orderings: [
    {
      title: 'Urutan Menu',
      name: 'menuOrder',
      by: [{field: 'urutanTampilan', direction: 'asc'}],
    },
  ],
  preview: {
    select: {
      title: 'namaMenu',
      subtitle: 'tipeLink',
      order: 'urutanTampilan',
    },
    prepare(selection) {
      const {title, subtitle, order} = selection
      return {
        title: `${order}. ${title}`,
        subtitle: `Tipe: ${subtitle}`,
      }
    },
  },
})