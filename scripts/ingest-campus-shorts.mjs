import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Verified YouTube Shorts Hashtags for guaranteed vertical campus shorts
const CATEGORY_SOURCES = [
  {
    category: 'campus_life',
    sources: [
      'https://www.youtube.com/hashtag/collegelife/shorts',
      'https://www.youtube.com/hashtag/campuslife/shorts',
      'https://www.youtube.com/hashtag/studentlife/shorts',
    ],
    defaultAuthor: 'Campus Life Diaries',
    defaultSound: 'Campus Vibes · Original Sound',
  },
  {
    category: 'hostel',
    sources: [
      'https://www.youtube.com/hashtag/hostellife/shorts',
      'https://www.youtube.com/hashtag/hosteldiaries/shorts',
      'https://www.youtube.com/hashtag/hosteler/shorts',
    ],
    defaultAuthor: 'Hostel Room Stories',
    defaultSound: 'Hostel Anthems · Chill Beats',
  },
  {
    category: 'tech_coding',
    sources: [
      'https://www.youtube.com/hashtag/engineeringmemes/shorts',
      'https://www.youtube.com/hashtag/codingmemes/shorts',
      'https://www.youtube.com/hashtag/programmerhumor/shorts',
    ],
    defaultAuthor: 'DevClub Campus',
    defaultSound: 'Synthwave Coding Beats',
  },
  {
    category: 'exam_stress',
    sources: [
      'https://www.youtube.com/hashtag/examstress/shorts',
      'https://www.youtube.com/hashtag/exammemes/shorts',
      'https://www.youtube.com/hashtag/semesterexams/shorts',
    ],
    defaultAuthor: 'Semester Survivors',
    defaultSound: 'Finals Panic · Dramatic Beats',
  },
  {
    category: 'memes',
    sources: [
      'https://www.youtube.com/hashtag/backbenchers/shorts',
      'https://www.youtube.com/hashtag/collegehumor/shorts',
      'https://www.youtube.com/hashtag/studentmemes/shorts',
    ],
    defaultAuthor: 'Backbencher Memes',
    defaultSound: 'Comedy Trending Reel Sound',
  },
];

// Curated avatar list for student creators
const AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=120&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&q=80',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=120&q=80',
];

function cleanTitle(raw) {
  if (!raw || raw === 'NA') return 'Campus Life Reel';
  return raw
    .replace(/#\w+/g, '')
    .replace(/[|\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function escapeSql(str) {
  return String(str || '').replace(/'/g, "''");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getExistingReelIds() {
  try {
    const out = execSync(
      'npx wrangler d1 execute student-addit-db --command "SELECT id FROM pulse_reels" --remote --json',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const parsed = JSON.parse(out);
    const rows = parsed[0]?.results || [];
    return new Set(rows.map((r) => r.id));
  } catch (err) {
    console.warn('Could not fetch existing IDs from D1, continuing with empty set:', err.message);
    return new Set();
  }
}

async function main() {
  console.log('🚀 Starting Powerful Anti-Bot Campus Shorts Ingestion Engine...');
  
  const ytDlp = path.resolve('bin', 'yt-dlp.exe');
  const ffmpeg = path.resolve('bin', 'ffmpeg.exe');
  
  if (!fs.existsSync(ytDlp) || !fs.existsSync(ffmpeg)) {
    throw new Error('yt-dlp.exe or ffmpeg.exe missing in bin/ directory!');
  }

  const tmpDir = path.resolve('temp_ingest');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const existingIds = await getExistingReelIds();
  console.log(`Found ${existingIds.size} reels already in remote D1 database.`);

  const args = process.argv.slice(2);
  let limitPerCategory = 5;
  const limitArgIdx = args.indexOf('--limit');
  if (limitArgIdx !== -1 && args[limitArgIdx + 1]) {
    limitPerCategory = parseInt(args[limitArgIdx + 1], 10) || 5;
  }

  let totalIngested = 0;

  for (const group of CATEGORY_SOURCES) {
    console.log(`\n==================================================`);
    console.log(`🎯 Category: [${group.category.toUpperCase()}] (Goal: ${limitPerCategory} reels)`);
    console.log(`==================================================`);

    let categoryIngested = 0;

    for (const sourceUrl of group.sources) {
      if (categoryIngested >= limitPerCategory) break;

      console.log(`\n🔍 Scraping verified Shorts from: ${sourceUrl}...`);

      // Extract real Short IDs from hashtag page (no bot defense challenges)
      const listRes = spawnSync(
        ytDlp,
        [
          sourceUrl,
          '--flat-playlist',
          '--playlist-end', '15',
          '--print', '%(id)s|||%(title)s',
          '--no-warnings',
        ],
        { encoding: 'utf8' }
      );

      if (listRes.status !== 0 || !listRes.stdout) {
        console.warn(`Could not extract from ${sourceUrl}: ${listRes.stderr || 'No output'}`);
        continue;
      }

      const lines = listRes.stdout.trim().split('\n').filter(Boolean);
      console.log(`Found ${lines.length} candidate shorts on hashtag feed.`);

      for (const line of lines) {
        if (categoryIngested >= limitPerCategory) break;

        const [rawId, rawTitle] = line.split('|||');
        const id = rawId?.trim();
        if (!id || id.length < 5 || existingIds.has(id) || existingIds.has(`reel-yt-${id}`)) {
          continue;
        }

        const reelId = `reel-yt-${id}`;
        const videoTmp = path.join(tmpDir, `${reelId}.mp4`);
        const thumbTmp = path.join(tmpDir, `${reelId}.jpg`);

        console.log(`\n⬇️ [${categoryIngested + 1}/${limitPerCategory}] Processing Short [${id}]...`);

        // Anti-Bot Jitter
        await sleep(1000 + Math.random() * 1200);

        // Download clean video + audio using Android mobile client (no web bot challenge)
        const dlRes = spawnSync(
          ytDlp,
          [
            `https://www.youtube.com/shorts/${id}`,
            '--extractor-args', 'youtube:player_client=android,web',
            '--extractor-retries', '5',
            '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            '--ffmpeg-location', ffmpeg,
            '--no-simulate',
            '--print', '%(title)s|||%(uploader)s|||%(duration)s',
            '-o', videoTmp,
            '--no-warnings',
          ],
          { encoding: 'utf8' }
        );

        if (!fs.existsSync(videoTmp) || fs.statSync(videoTmp).size < 80_000) {
          console.warn(`Download skipped or failed for ${id}`);
          if (fs.existsSync(videoTmp)) fs.unlinkSync(videoTmp);
          continue;
        }

        // Parse actual video title, uploader, duration
        let title = cleanTitle(rawTitle);
        let uploader = group.defaultAuthor;
        let duration = 15;

        if (dlRes.stdout) {
          const parts = dlRes.stdout.trim().split('|||');
          if (parts[0] && parts[0] !== 'NA') title = cleanTitle(parts[0]);
          if (parts[1] && parts[1] !== 'NA') uploader = parts[1].trim().slice(0, 40);
          if (parts[2] && !isNaN(parseFloat(parts[2]))) {
            duration = Math.min(60, Math.max(5, Math.round(parseFloat(parts[2]))));
          }
        }

        console.log(`✅ Downloaded ${(fs.statSync(videoTmp).size / (1024 * 1024)).toFixed(2)} MB video: "${title}" (${duration}s)`);

        // Generate video poster frame via ffmpeg
        spawnSync(
          ffmpeg,
          [
            '-ss', '00:00:01',
            '-i', videoTmp,
            '-vframes', '1',
            '-q:v', '2',
            thumbTmp,
            '-y',
          ],
          { stdio: 'ignore' }
        );

        // Upload video to Cloudflare R2
        const r2VideoKey = `reels/${reelId}.mp4`;
        console.log(`☁️ Uploading ${r2VideoKey} to Cloudflare R2...`);
        try {
          execSync(
            `npx wrangler r2 object put student-addit-studies/${r2VideoKey} --file "${videoTmp}" --content-type video/mp4 --remote`,
            { stdio: 'ignore' }
          );
        } catch (err) {
          console.error(`Failed to upload ${r2VideoKey} to R2:`, err.message);
          if (fs.existsSync(videoTmp)) fs.unlinkSync(videoTmp);
          if (fs.existsSync(thumbTmp)) fs.unlinkSync(thumbTmp);
          continue;
        }

        // Upload thumbnail to Cloudflare R2
        const r2ThumbKey = `reels/${reelId}.jpg`;
        let thumbUrl = `https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/${reelId}.jpg`;
        if (fs.existsSync(thumbTmp)) {
          try {
            execSync(
              `npx wrangler r2 object put student-addit-studies/${r2ThumbKey} --file "${thumbTmp}" --content-type image/jpeg --remote`,
              { stdio: 'ignore' }
            );
          } catch {
            thumbUrl = 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&q=80';
          }
        }

        // Realistic student engagement counts
        const likes = Math.floor(Math.random() * 1500) + 180;
        const comments = Math.floor(Math.random() * 90) + 14;
        const shares = Math.floor(Math.random() * 50) + 6;
        const avatarUrl = AVATARS[Math.floor(Math.random() * AVATARS.length)];
        const videoStreamUrl = `https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/${reelId}.mp4`;
        const caption = `${title}. Relatable college moment! #studentlife #${group.category}`;

        // Insert record into Cloudflare D1 database
        const insertSql = `
          INSERT INTO pulse_reels (
            id, title, caption, video_url, thumbnail_url, duration_seconds,
            author_name, author_avatar, sound_title, category, likes_count, comments_count, shares_count, is_featured, created_at
          ) VALUES (
            '${escapeSql(reelId)}',
            '${escapeSql(title)}',
            '${escapeSql(caption)}',
            '${escapeSql(videoStreamUrl)}',
            '${escapeSql(thumbUrl)}',
            ${duration},
            '${escapeSql(uploader)}',
            '${escapeSql(avatarUrl)}',
            '${escapeSql(group.defaultSound)}',
            '${escapeSql(group.category)}',
            ${likes},
            ${comments},
            ${shares},
            1,
            datetime('now')
          );
        `.trim();

        const tmpSql = path.join(tmpDir, `insert_${reelId}.sql`);
        fs.writeFileSync(tmpSql, insertSql, 'utf8');

        try {
          execSync(
            `npx wrangler d1 execute student-addit-db --file "${tmpSql}" --remote`,
            { stdio: 'ignore' }
          );
          existingIds.add(id);
          existingIds.add(reelId);
          categoryIngested++;
          totalIngested++;
          console.log(`✨ Ingested reel ${reelId} into D1 & R2! (Total added: ${totalIngested})`);
        } catch (err) {
          console.error(`Failed to insert ${reelId} into D1:`, err.message);
        } finally {
          if (fs.existsSync(tmpSql)) fs.unlinkSync(tmpSql);
        }

        // Clean local files
        if (fs.existsSync(videoTmp)) fs.unlinkSync(videoTmp);
        if (fs.existsSync(thumbTmp)) fs.unlinkSync(thumbTmp);
      }
    }
  }

  // Cleanup temp dir
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n🎉 Ingestion complete! Successfully ingested ${totalIngested} new unique shorts into Cloudflare R2 & D1!`);
}

main().catch((err) => {
  console.error('Fatal error in ingestion bot:', err);
  process.exit(1);
});
