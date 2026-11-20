# Universal Downloader — v2 (Rust + Tauri 2)

ভিডিও, গান আর পুরো প্লেলিস্ট ডাউনলোডের অ্যাপ — এখন **Rust** দিয়ে লেখা, **Tauri 2**-এর উপর।
একই কোড থেকে পাঁচটা প্ল্যাটফর্মের ইনস্টলার তৈরি হয়:

| প্ল্যাটফর্ম | ফাইল | ইঞ্জিন |
|---|---|---|
| Windows 10/11 | `.exe` (NSIS ইনস্টলার) | yt-dlp + ffmpeg (ইনস্টলারের সাথেই আসে) |
| macOS (Apple Silicon / Intel) | `.dmg` | yt-dlp + ffmpeg |
| Linux | `.deb` / `.AppImage` | yt-dlp + ffmpeg |
| Android 7+ | `.apk` | বিল্ট-ইন Rust ইঞ্জিন (YouTube) |
| iOS 14+ | `.ipa` (unsigned, সাইডলোড) | বিল্ট-ইন Rust ইঞ্জিন (YouTube) |

## ✨ ফিচার

- নতুন **মডার্ন UI** — ডার্ক/লাইট/সিস্টেম থিম, সাইডবার (ডেস্কটপ) ও বটম ট্যাব (মোবাইল), **English / বাংলা**
- লিংক পেস্ট করলেই অটো ফেচ — **ভিডিও**, **প্লেলিস্ট** নাকি **চ্যানেল** (সর্বশেষ N ভিডিও) নিজেই বোঝে
- **ইন-অ্যাপ সার্চ** — লিংক ছাড়া নাম লিখে খোঁজা
- ভিডিও কোয়ালিটি কার্ড (8K → 144p) প্রতিটার **ফাইল সাইজসহ**; অডিওতে **MP3 320/256/192/128 kbps**
- প্লেলিস্টে চেকবক্সে বেছে ডাউনলোড, সব একসাথে বাছাই
- **ডাউনলোড কিউ** — প্রগ্রেস, স্পিড, ETA, ডাউনলোড হওয়া/মোট সাইজ; **Pause / Resume** (থামা জায়গা থেকেই), Cancel, Retry, ক্রম বদল, Pause all / Resume all, **শিডিউল**
- প্যারালাল ডাউনলোড (১–৫), **স্পিড বুস্ট** (প্যারালাল ফ্র্যাগমেন্ট), **গতি সীমা**
- **সাবটাইটেল** (আলাদা `.srt` বা এম্বেড, অটো-ক্যাপশনসহ), **Trim**, **SponsorBlock**, **চ্যাপ্টার অনুযায়ী ভাগ**, **লাইভ শুরু থেকে রেকর্ড**
- MP3-তে কভার ছবি ও ট্যাগ, ফাইলের নামের প্যাটার্ন, আগে ডাউনলোড করা ভিডিও স্কিপ, ব্রাউজারের কুকিজ
- **লাইব্রেরি** — শেষ হওয়া ডাউনলোড (অ্যাপ বন্ধ করলেও থাকে), ফাইল খোলা / ফোল্ডারে দেখা / আবার ডাউনলোড, মোট সাইজের পরিসংখ্যান
- ডুপ্লিকেট সতর্কতা, ভিডিও প্রিভিউ, ডাউনলোড শেষে নোটিফিকেশন
- অ্যাপের ভিতর থেকেই **yt-dlp ইনস্টল/আপডেট**
- অ্যাপ বন্ধ করলে কিউ সেভ থাকে — পরের বার থামানো অবস্থায় ফিরে আসে

## ⚠️ মোবাইল সম্পর্কে সৎ নোট

iOS আর Android-এ yt-dlp বা ffmpeg-এর মতো বাইরের প্রোগ্রাম চালানো যায় না, তাই মোবাইলে
একটা **খাঁটি Rust ইঞ্জিন** (`rusty_ytdl`) কাজ করে:

- শুধু **YouTube** লিংক (ভিডিও, প্লেলিস্ট, সার্চ)
- ভিডিও: YouTube-এর অডিও+ভিডিও জোড়া স্ট্রিম — সাধারণত **360p পর্যন্ত** (HD-তে আলাদা স্ট্রিম জোড়া লাগাতে ffmpeg লাগে)
- অডিও: আসল **M4A / WebM** ফরম্যাটে (MP3 কনভার্সন নেই)
- Android-এ ফাইল যায় `Download/Universal Downloader`-এ; iOS-এ **Files অ্যাপ → On My iPhone → Universal Downloader**-এ

## 🛠️ ডেভেলপমেন্ট

দরকার: **Node 22+**, **Rust (stable)**, আর
[Tauri-র সিস্টেম ডিপেন্ডেন্সি](https://v2.tauri.app/start/prerequisites/)
(Linux-এ `libwebkit2gtk-4.1-dev` ইত্যাদি, Windows-এ WebView2 — Windows 10/11-এ আগে থেকেই থাকে)।

```bash
npm install
./scripts/fetch-binaries.sh        # Windows-এ: .\scripts\fetch-binaries.ps1
                                   # (yt-dlp + ffmpeg → resources/bin, ইনস্টলারে ঢুকে যায়)
npm run app:dev                    # ডেস্কটপ অ্যাপ চালাও (hot reload সহ)
```

শুধু UI দেখতে (ব্রাউজারে, ডেমো মোডে — ডাউনলোড সিমুলেট হয়):
```bash
npm run dev    # http://localhost:1420
```

মোবাইল:
```bash
npx tauri android init && npx tauri android dev     # Android Studio + NDK লাগবে
npx tauri ios init && npx tauri ios dev             # macOS + Xcode লাগবে
```

Rust টেস্ট (ডেস্কটপে মোবাইল ইঞ্জিনসহ কম্পাইল চেক):
```bash
cd src-tauri && cargo test --features native-engine
```

## 📦 রিলিজ

GitHub-এ একটা ট্যাগ পুশ করলেই সব প্ল্যাটফর্মের বিল্ড হয়ে **Draft Release** তৈরি হয়:

```bash
git tag v2.0.0 && git push origin v2.0.0
```

Actions ট্যাব থেকে **Run workflow** দিলেও সব বিল্ড হয় — তখন ফাইলগুলো রানের **Artifacts**-এ পাওয়া যায়।

**Android সাইনিং:** রিপোর Settings → Secrets-এ এগুলো দিলে নিজের key দিয়ে সাইন হবে
(না দিলে প্রতিবার অস্থায়ী key — তখন আপডেট করতে আগেরটা আনইনস্টল করতে হবে):

| Secret | মান |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` এর আউটপুট |
| `ANDROID_KEYSTORE_PASSWORD` | keystore পাসওয়ার্ড |
| `ANDROID_KEY_ALIAS` | key alias |

**iOS:** Apple Developer অ্যাকাউন্ট ছাড়া App Store/TestFlight-এর মতো সাইন করা যায় না, তাই unsigned `.ipa`
তৈরি হয় — AltStore / SideStore দিয়ে ইনস্টল করতে হয়।

## 📁 কাঠামো

```
src/                     React UI (Vite + Tailwind)
  pages/                 Home (ডাউনলোড), Queue, History (লাইব্রেরি), Settings
  lib/store.jsx          অ্যাপ স্টেট, ডাউনলোড কিউ ও শিডিউলার
  lib/api.js             Rust কমান্ডের ব্রিজ (+ ব্রাউজারে ডেমো ইঞ্জিন)
  lib/i18n.js            English / বাংলা
src-tauri/               Rust অংশ
  src/lib.rs             Tauri কমান্ড ও অ্যাপ সেটআপ
  src/ytdlp.rs           ডেস্কটপ ইঞ্জিন — yt-dlp চালানো, ইনফো পার্স, প্রগ্রেস, Pause/Cancel
  src/native.rs          মোবাইল ইঞ্জিন — rusty_ytdl + resumable HTTP ডাউনলোড
  src/store.rs           সেটিংস / হিস্ট্রি / কিউ JSON-এ সেভ
  tauri.conf.json        অ্যাপ ও ইনস্টলার কনফিগ
resources/bin/           yt-dlp + ffmpeg (fetch স্ক্রিপ্ট দিয়ে আসে, git-এ যায় না)
build/app-icon.svg       আইকনের মূল ফাইল (`npm run icons` → src-tauri/icons)
.github/workflows/       release.yml — সব প্ল্যাটফর্মের বিল্ড; web-pages.yml — ওয়েব প্রিভিউ
```

## ⚖️ নোট

অ্যাপটি ব্যক্তিগত ব্যবহারের জন্য। ক্রিয়েটরদের কপিরাইট ও প্ল্যাটফর্মের শর্ত মেনে ব্যবহার করো।
Play Store / App Store এই ধরনের অ্যাপ সাধারণত অনুমোদন দেয় না — বিতরণ GitHub Release দিয়ে করো।
