import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'pengumuman',
  title: 'Pengumuman',
  type: 'document',
  fields: [
    defineField({
      name: 'judul',
      title: 'Judul',
      type: 'string',
      description: 'Judul singkat untuk pengumuman ini.',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'tanggalPublikasi',
      title: 'Tanggal Publikasi',
      type: 'date',
      description: 'Tanggal kapan pengumuman ini seharusnya ditampilkan.',
      validation: Rule => Rule.required(),
      options: {
        dateFormat: 'DD-MM-YYYY',
      }
    }),
    defineField({
      name: 'isiPengumuman',
      title: 'Isi Pengumuman',
      type: 'text',
      description: 'Isi lengkap dari pengumuman.',
      validation: Rule => Rule.required(),
    }),
  ],
  // Mengurutkan data di Sanity Studio berdasarkan tanggal, yang terbaru di atas
  orderings: [
    {
      title: 'Tanggal Publikasi, Baru',
      name: 'tanggalPublikasiDesc',
      by: [{field: 'tanggalPublikasi', direction: 'desc'}]
    }
  ]
})