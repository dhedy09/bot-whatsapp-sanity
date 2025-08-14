// schemas/kategoriPustaka.ts
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'kategoriPustaka',
  title: 'Kategori Pustaka Data',
  type: 'document',
  fields: [
    defineField({
      name: 'namaKategori',
      title: 'Nama Kategori',
      type: 'string',
      description: 'Contoh: "Tahun 2023", "Peraturan Pemerintah", dll.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'indukKategori',
      title: 'Induk Kategori (Parent)',
      type: 'reference',
      to: [{type: 'kategoriPustaka'}],
      description: 'Kosongkan jika ini adalah kategori paling atas (seperti Tahun).',
    }),
    defineField({
      name: 'deskripsi',
      title: 'Deskripsi Singkat',
      type: 'text',
    }),
  ],
  preview: {
    select: {
      title: 'namaKategori',
      subtitle: 'indukKategori.namaKategori',
    },
    prepare(selection) {
      const {title, subtitle} = selection
      return {
        title: title,
        subtitle: subtitle ? `di dalam → ${subtitle}` : 'Kategori Utama',
      }
    },
  },
})