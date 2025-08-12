import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'botReply',
  title: 'Bot Reply',
  type: 'document',
  fields: [
    defineField({
      name: 'keyword',
      title: 'Keyword',
      type: 'string',
      description: 'Kata kunci persis yang akan diketik pengguna (contoh: menu, alamat).',
      validation: Rule => Rule.required(), // Mewajibkan field ini untuk diisi
    }),
    defineField({
      name: 'jawaban',
      title: 'Jawaban',
      type: 'text', // Tipe 'text' untuk jawaban yang lebih panjang
      description: 'Teks balasan yang akan dikirim oleh bot.',
      validation: Rule => Rule.required(), // Mewajibkan field ini untuk diisi
    }),
  ],
})