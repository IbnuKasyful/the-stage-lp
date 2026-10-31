# Setup: Form LP → Google Sheets + Email Otomatis

Alur: visitor submit form di https://stage.the-family-village.pages.dev → data masuk ke Google Sheet → Apps Script langsung mengirim email:

| Form | Tab di Sheet | Email ke visitor |
|---|---|---|
| Book a Trial Class | `Trial Bookings` | Konfirmasi booking + ringkasan + tombol **Join WhatsApp Community** |
| Confident Kid Playbook | `Playbook Leads` | **PDF playbook (lampiran)** + tombol **Join WhatsApp Community** + CTA trial RM55 |

Kolom `email_status` di sheet mencatat hasil pengiriman email (`Sent`, `Sent – with PDF`, `Sent – PDF pending`, atau `Error: …`). Kolom `lead_status` (default `New`) bisa dipakai sebagai CRM.

> Email dikirim **dari akun Google yang men-deploy script**. Sebaiknya pakai akun Google milik The Family Village.

---

## 1. Buat Sheet & tempel script
1. Buat Google Sheet baru, misalnya **"The Family Village – The Stage Leads"**.
2. Buka menu **Extensions → Apps Script**.
3. Hapus isi `Code.gs` bawaan, lalu paste seluruh isi file `apps-script/Code.gs` ini. Klik **Save**.
4. Cek bagian `CONFIG` di bagian atas:
   - `WA_COMMUNITY_URL`: masih **dummy**. Ganti dengan link invite WhatsApp Community yang asli.
   - `NOTIFY_EMAIL` (opsional): email tim untuk notifikasi setiap ada lead baru.
   - `REPLY_TO` (opsional): alamat email tujuan saat visitor menekan "Reply".

## 2. Tes & beri izin
1. Di toolbar editor, pilih fungsi **`testTrialBooking`**, lalu klik **Run**.
2. Muncul *Authorization required*. Klik **Review permissions**, pilih akun, lalu **Advanced → Go to (project) → Allow**. Script butuh akses ke Sheets, pengiriman email, dan Drive (untuk lampiran PDF).
3. Cek hasilnya: tab `Trial Bookings` terbentuk dan email tes masuk ke inbox akun Anda.
4. Ulangi dengan **`testLeadMagnet`**. Selama PDF belum ada, email-nya bilang playbook sedang disiapkan dan status di sheet tercatat `Sent – PDF pending`.

## 3. Deploy sebagai Web App
1. Klik **Deploy → New deployment**, lalu ikon ⚙️ → **Web app**.
2. Isi **Execute as: Me** dan **Who has access: Anyone**.
3. Klik **Deploy**, lalu salin **Web app URL** (berakhiran `/exec`).
4. Tempel URL tersebut ke `FORM_ENDPOINT` di `the-stage-lp/script.js`, lalu push ke GitHub (Cloudflare Pages otomatis deploy):
   ```
   git add -A && git commit -m "Update form endpoint" && git push origin main main:stage
   ```
   (Atau kirim URL-nya ke Claude untuk dipasang dan di-deploy.)

## 4. Saat file PDF sudah siap (tanpa deploy ulang)
1. Upload PDF ke Google Drive dengan akun yang sama dengan pemilik script, atau share file-nya ke akun tersebut.
2. Di editor Apps Script, buka **Project Settings (⚙️) → Script Properties → Add script property**:
   - Property: `PLAYBOOK_PDF`
   - Value: link Google Drive PDF-nya (atau File ID saja, dua-duanya bisa)
3. Klik **Save script properties**. Selesai, **tidak perlu deploy ulang**: submission berikutnya langsung menerima PDF.
4. Jalankan fungsi **`sendPendingPlaybooks`** sekali. PDF akan terkirim ke semua lead yang sebelumnya berstatus `Sent – PDF pending`.

> Script Properties dibaca saat script berjalan, jadi mengganti PDF nanti juga cukup dengan mengubah value-nya.
> Mengubah **kode** tetap butuh *Manage deployments → New version*.

## 5. Email playbook tidak terkirim? (diagnosis)
1. Lihat kolom `email_status` di tab `Playbook Leads`. Kalau ada `PDF error: …`, itu penyebabnya.
2. Di editor, pilih fungsi **`checkPlaybookSetup`**, klik **Run**, lalu buka **Execution log**. Log menampilkan akun pengirim, sisa kuota email, link dan File ID PDF, ukuran file, dan apakah akun script bisa membuka file itu. Fungsi ini juga mengirim satu email tes ke akun Anda.
3. Penyebab paling umum:
   - **PDF bukan milik atau tidak di-share ke akun pemilik script**: upload PDF dengan akun itu, atau share file-nya ke akun tersebut (cukup Viewer).
   - **Ukuran PDF > ~24 MB**: kompres PDF-nya.
   - **Kode baru belum di-deploy**: *Manage deployments → ✏️ → New version → Deploy*.
4. Setelah diperbaiki, jalankan **`sendPendingPlaybooks`** untuk mengirim ulang ke semua lead yang belum menerima PDF, termasuk yang statusnya `Error`.

---

## Catatan
- **Setiap kali kode diubah**, perubahan baru aktif setelah *Manage deployments → New version*.
- **Kuota email** MailApp: sekitar 100 email/hari untuk Gmail biasa, sekitar 1.500/hari untuk Google Workspace. Sisa kuota terlihat di log setelah menjalankan `sendPendingPlaybooks`.
- Nomor yang diawali `+` disimpan sebagai teks supaya tidak terbaca sebagai formula.
- Form di LP punya honeypot anti-spam. Submission dari bot diabaikan dan tidak tercatat.
