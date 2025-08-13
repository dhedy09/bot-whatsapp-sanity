// Lokasi file: sanity/schemas/kategoriDokumen.ts

import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'kategoriDokumen',
  title: 'Kategori Dokumen',
  type: 'document',
  fields: [
    defineField({
      name: 'namaKategori',
      title: 'Nama Kategori',
      description: 'Contoh: "Peraturan", "Surat Edaran", "Arsip Data 2024"',
      type: 'string',
      validation: Rule => Rule.required(), // Ini membuat field wajib diisi
    }),
    defineField({
      name: 'deskripsi',
      title: 'Deskripsi Singkat',
      type: 'text',
    }),
    // Ini adalah bagian penting yang memungkinkan adanya sub-kategori
    defineField({
        name: 'parent',
        title: 'Kategori Induk (Parent)',
        type: 'reference',
        to: [{type: 'kategoriDokumen'}], // Referensi ke dirinya sendiri
        description: 'Pilih kategori lain jika ini adalah sub-kategori. Kosongkan jika ini adalah kategori utama.'
    })
  ],
  // Bagian ini untuk membuat tampilan di Sanity Studio lebih bagus
  preview: { 
    select: {
      title: 'namaKategori',
      subtitle: 'parent.namaKategori',
    },
    prepare(selection) {
      const {title, subtitle} = selection
      return {
        title: title,
        subtitle: subtitle ? `di dalam → ${subtitle}` : 'Kategori Utama',
      }
    },
  }
})