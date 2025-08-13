// Import fungsi yang diperlukan dari library Sanity
import {defineField, defineType} from 'sanity'

// 'defineType' adalah fungsi utama untuk mendefinisikan sebuah skema baru
export default defineType({
  // === INFORMASI DASAR SKEMA ===

  // 'name' adalah ID unik untuk skema ini (digunakan dalam query API)
  // Aturan: harus huruf kecil, tanpa spasi.
  name: 'pegawai',
  
  // 'title' adalah nama yang akan muncul di Sanity Studio (lebih mudah dibaca)
  title: 'Data Pegawai',
  
  // 'type' menentukan jenis skema. 'document' berarti ini adalah tipe konten utama.
  type: 'document',
  
  // === DAFTAR FIELD (KOLOM DATA) ===
  // 'fields' adalah sebuah array yang berisi definisi untuk setiap field data.
  fields: [
    
    // --- Field 1: Nama Lengkap ---
    defineField({
      name: 'nama',
      title: 'Nama Lengkap',
      type: 'string', // Tipe 'string' untuk teks singkat satu baris.
      validation: Rule => Rule.required(), // 'validation' memastikan field ini wajib diisi.
    }),
    
    // --- Field 2: NIP ---
    defineField({
      name: 'nip',
      title: 'NIP / ID Pegawai',
      type: 'string',
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
        list: [ // 'list' akan membuat pilihan dropdown
          {title: 'User', value: 'user'},      // Ganti dari 'Staf Biasa'
          {title: 'Admin', value: 'admin'}    // Ganti dari 'Kepala Dinas'
        ],
        layout: 'radio' // Tampilkan sebagai pilihan radio agar lebih jelas
      },
      initialValue: 'user' // Nilai default saat membuat data baru
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
      type: 'text', // Tipe 'text' lebih cocok untuk catatan atau teks yang lebih panjang.
    }),
    
    // ... setelah field 'keterangan'
    
    // Contoh Field Khusus 1
    defineField({
      name: 'userRakortek',
      title: 'User Rakortek',
      type: 'string',
      // 'hidden' akan menyembunyikan field ini jika kondisi terpenuhi
      // Baca: "Sembunyikan field ini KECUALI tipePegawai adalah 'admin'"
      hidden: ({parent}) => parent?.tipePegawai !== 'admin',
    }),
    
    // Contoh Field Khusus 2
    defineField({
      name: 'sipdRenstra',
      title: 'User SIPD Renstra',
      type: 'string',
      hidden: ({parent}) => parent?.tipePegawai !== 'admin',
    }),
        // Contoh Field Khusus 23
    defineField({
      name: 'passRenstra',
      title: 'Password SIPD Renstra',
      type: 'string',
      hidden: ({parent}) => parent?.tipePegawai !== 'admin',
    }),
    
    // ... Tambahkan 3 field khusus lainnya dengan pola 'hidden' yang sama ...
    /* ====================================================================
    == CARA MENAMBAH FIELD BARU DI MASA DEPAN ==
    ====================================================================
    
    Jika suatu saat Anda ingin menambah field baru, misalnya "Nomor Telepon":
    
    1. Cukup salin (copy) salah satu blok 'defineField' di atas.
    2. Tempel (paste) di bawah field terakhir (sebelum kurung siku penutup ']').
    3. Ubah nilai 'name', 'title', dan 'type' sesuai kebutuhan.
    
    Contoh:
    
    defineField({
      name: 'nomorTelepon', // ID unik (tanpa spasi)
      title: 'Nomor Telepon', // Nama yang tampil di studio
      type: 'string', // Tipe data (bisa 'string', 'text', 'number', 'date', dll)
    }),
    
    Setelah menambah field baru di sini dan menyimpannya,
    Anda hanya perlu me-restart Sanity Studio ('sanity start')
    untuk melihat kolom baru tersebut muncul secara otomatis.
    
    ====================================================================
    */
    
  ],
})