// schemas/dokumenPustaka.ts
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'dokumenPustaka',
  title: 'Dokumen Pustaka Data',
  type: 'document',
  fields: [
    defineField({
      name: 'namaDokumen',
      title: 'Nama Dokumen',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'deskripsi',
      title: 'Deskripsi',
      type: 'text',
    }),
    defineField({
      name: 'tahunDokumen',
      title: 'Tahun Dokumen',
      type: 'number',
    }),
    defineField({
      name: 'linkDokumen',
      title: 'Link Dokumen/File',
      type: 'url',
      description: 'URL ke Google Drive, website, atau sumber lainnya.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'kategoriInduk',
      title: 'Kategori Induk',
      type: 'reference',
      to: [{type: 'kategoriPustaka'}],
      description: 'Pilih kategori tempat dokumen ini berada.',
      validation: (Rule) => Rule.required(),
    }),
  ],
})