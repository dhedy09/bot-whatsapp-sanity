// file: schemas/pegawai.ts

import { defineType, defineField } from 'sanity';

// 'defineType' adalah fungsi utama untuk mendefinisikan sebuah skema baru
export default defineType({
  // === INFORMASI DASAR SKEMA ===
  name: 'pegawai',
  title: 'Data Pegawai',
  type: 'document',

  // === DAFTAR FIELD (KOLOM DATA) ===
  fields: [
    // --- Field 1: Nama Lengkap ---
    defineField({
      name: 'nama',
      title: 'Nama Lengkap',
      type: 'string',
      validation: Rule => Rule.required(),
    }),

    // --- Field 2: NIP ---
    defineField({
      name: 'nip',
      title: 'NIP / ID Pegawai',
      type: 'string',
    }),

    defineField({
      name: 'userId',
      title: 'User ID (WhatsApp)',
      type: 'string',
      description: "ID unik dari WhatsApp untuk menghubungkan bot. Format: 628...c.us. Diisi otomatis oleh bot, atau manual untuk admin pertama.",
      readOnly: true,
    }),

    // --- Field 3: Jabatan ---
    defineField({
      name: 'jabatan',
      title: 'Jabatan',
      type: 'string',
    }),

    defineField({
      name: 'tipePegawai',
      title: 'Level Akses',
      type: 'string',
      options: {
        list: [
          { title: 'User', value: 'user' },
          { title: 'Admin', value: 'admin' }
        ],
        layout: 'radio'
      },
      initialValue: 'user'
    }),

    // --- Field 4: Username SIPD ---
    defineField({
      name: 'usernameSipd',
      title: 'Username SIPD',
      type: 'string',
    }),

    // --- Field 5: Password SIPD ---
    defineField({
      name: 'passwordSipd',
      title: 'Password SIPD',
      type: 'string',
    }),

    // --- Field 6: Password Penatausahaan ---
    defineField({
      name: 'passwordPenatausahaan',
      title: 'Password Penatausahaan',
      type: 'string',
    }),

    // --- Field 7: Keterangan ---
    defineField({
      name: 'keterangan',
      title: 'Keterangan',
      type: 'text',
    }),

    // --- Field Khusus Admin ---
    defineField({
      name: 'userRakortek',
      title: 'User Rakortek',
      type: 'string',
      hidden: ({ parent }) => parent?.tipePegawai !== 'admin',
    }),

    defineField({
      name: 'sipdRenstra',
      title: 'User SIPD Renstra',
      type: 'string',
      hidden: ({ parent }) => parent?.tipePegawai !== 'admin',
    }),

    defineField({
      name: 'passRenstra',
      title: 'Password SIPD Renstra',
      type: 'string',
      hidden: ({ parent }) => parent?.tipePegawai !== 'admin',
    }),
    
    // ▼▼▼ TAMBAHKAN FIELD BARU INI DI SINI ▼▼▼
    defineField({
      name: 'memori',
      title: 'Memori AI (Catatan Personal)',
      type: 'text', // Tipe 'text' untuk catatan yang bisa sangat panjang
      description: 'Tempat AI menyimpan fakta-fakta spesifik tentang pegawai ini. Contoh: "lebih suka dipanggil mas", "lokasi kerja di Padang", dll.',
    }),
    // ▲▲▲ AKHIR DARI FIELD BARU ▲▲▲
  ],
});