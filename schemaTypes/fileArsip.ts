import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'fileArsip',
  title: 'Arsip File Grup',
  type: 'document',
  fields: [
    defineField({
      name: 'namaFile',
      title: 'Nama File',
      description: 'Nama yang diberikan saat menyimpan file.',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'googleDriveId',
      title: 'Google Drive ID',
      description: 'ID unik file di Google Drive.',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'diunggahOleh',
      title: 'Diunggah Oleh',
      description: 'Pengguna WhatsApp yang menyimpan file ini.',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'groupId',
      title: 'ID Grup WhatsApp',
      description: 'Grup tempat file ini diunggah.',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'tipeFile',
      title: 'Tipe File',
      description: 'MIME type dari file (contoh: application/pdf).',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'tanggalUnggah',
      title: 'Tanggal Unggah',
      type: 'datetime',
      options: {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        timeStep: 15,
        calendarTodayLabel: 'Today'
      },
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'namaFile',
      subtitle: 'tipeFile',
    },
  },
})