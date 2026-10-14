import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Category Search Presets
const SEARCH_PRESETS = [
  {
    category: 'campus_life',
    query: 'ytsearch8:#shorts college life friends campus',
    author: 'Campus Life Diaries',
    defaultSound: 'Campus Vibes · Original Sound',
  },
  {
    category: 'hostel',
    query: 'ytsearch8:#shorts hostel life funny room',
    author: 'Hostel Room Stories',
    defaultSound: 'Hostel Anthems · Chill Beats',
  },
  {
    category: 'tech_coding',
    query: 'ytsearch8:#shorts engineering student coding meme',
    author: 'Code & Campus',
    defaultSound: 'Synthwave Coding Beats',
  },
  {
    category: 'exam_stress',
    query: 'ytsearch8:#shorts college exam funny study panic',
    author: 'Semester Survivors',
    defaultSound: 'Finals Panic · Dramatic Beats',
  },
  {
    category: 'memes',
    query: 'ytsearch8:#shorts college funny relatable students',
    author: 'Backbencher Memes',
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
  if (!raw) return 'College Reel';
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
  console.log('🚀 Starting Automated Campus Shorts Ingestion Bot...');
  
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
  let limitPerCategory = 3;
  const limitArgIdx = args.indexOf('--limit');
  if (limitArgIdx !== -1 && args[limitArgIdx + 1]) {
    limitPerCategory = parseInt(args[limitArgIdx + 1], 10) || 3;
  }

  let totalIngested = 0;

  for (const preset of SEARCH_PRESETS) {
    console.log(`\n🔍 Searching shorts for [${preset.category}] via ${preset.query}...`);
    
    // Search candidates using yt-dlp flat-playlist
    const searchRes = spawnSync(
      ytDlp,
      [
        preset.query,
        '--match-filter', 'duration <= 60',
        '--flat-playlist',
        '--print', '%(id)s|||%(title)s|||%(uploader)s|||%(duration)s',
      ],
      { encoding: 'utf8' }
    );

    if (searchRes.status !== 0 || !searchRes.stdout) {
      console.warn(`Search failed for ${preset.category}: ${searchRes.stderr || 'No output'}`);
      continue;
    }

    const lines = searchRes.stdout.trim().split('\n').filter(Boolean);
    console.log(`Discovered ${lines.length} candidate shorts for ${preset.category}.`);

    let categoryIngested = 0;

    for (const line of lines) {
      if (categoryIngested >= limitPerCategory) break;

      const [rawId, rawTitle, rawUploader, rawDuration] = line.split('|||');
      const id = rawId?.trim();
      if (!id || existingIds.has(id) || existingIds.has(`reel-yt-${id}`)) {
        console.log(`Skipping already present id: ${id}`);
        continue;
      }

      const duration = Math.min(60, Math.max(5, Math.round(parseFloat(rawDuration) || 15)));
      const title = cleanTitle(rawTitle) || `${preset.author} Moment`;
      const uploader = (rawUploader || preset.author).trim().slice(0, 40);
      const reelId = `reel-yt-${id}`;
      const videoTmp = path.join(tmpDir, `${reelId}.mp4`);
      const thumbTmp = path.join(tmpDir, `${reelId}.jpg`);

      console.log(`\n⬇️ Downloading Short [${id}] - "${title}" (${duration}s)...`);

      // Download clean video + audio using yt-dlp & ffmpeg
      const dlRes = spawnSync(
        ytDlp,
        [
          `https://www.youtube.com/shorts/${id}`,
          '--extractor-args', 'youtube:player_client=web,android',
          '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
          '--ffmpeg-location', ffmpeg,
          '-o', videoTmp,
          '--no-warnings',
        ],
        { stdio: 'inherit' }
      );

      if (!fs.existsSync(videoTmp) || fs.statSync(videoTmp).size < 100_000) {
        console.warn(`Download failed or file too small for ${id}, skipping.`);
        if (fs.existsSync(videoTmp)) fs.unlinkSync(videoTmp);
        continue;
      }

      console.log(`✅ Downloaded ${(fs.statSync(videoTmp).size / (1024 * 1024)).toFixed(2)} MB video with audio track.`);

      // Extract high-res frame 1s in as thumbnail
      console.log(`🖼️ Generating video poster thumbnail via ffmpeg...`);
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
          { stdio: 'inherit' }
        );
      } catch (err) {
        console.error(`Failed to upload ${r2VideoKey} to R2:`, err.message);
        if (fs.existsSync(videoTmp)) fs.unlinkSync(videoTmp);
        if (fs.existsSync(thumbTmp)) fs.unlinkSync(thumbTmp);
        continue;
      }

      // Upload thumbnail to Cloudflare R2 if generated
      const r2ThumbKey = `reels/${reelId}.jpg`;
      let thumbUrl = `https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/${reelId}.jpg`;
      if (fs.existsSync(thumbTmp)) {
        console.log(`☁️ Uploading ${r2ThumbKey} to Cloudflare R2...`);
        try {
          execSync(
            `npx wrangler r2 object put student-addit-studies/${r2ThumbKey} --file "${thumbTmp}" --content-type image/jpeg --remote`,
            { stdio: 'inherit' }
          );
        } catch {
          thumbUrl = 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&q=80';
        }
      }

      // Generate realistic student engagement stats
      const likes = Math.floor(Math.random() * 1200) + 180;
      const comments = Math.floor(Math.random() * 95) + 12;
      const shares = Math.floor(Math.random() * 45) + 5;
      const avatarUrl = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      const videoStreamUrl = `https://student-addit.mgp899123.workers.dev/api/pulse/reels/stream/${reelId}.mp4`;
      const caption = `${title}. Relatable college and campus moment! #studentlife #${preset.category}`;

      // Insert record into Cloudflare D1 database
      console.log(`💾 Inserting ${reelId} into D1 database pulse_reels...`);
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
          '${escapeSql(preset.defaultSound)}',
          '${escapeSql(preset.category)}',
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
          { stdio: 'inherit' }
        );
        existingIds.add(id);
        existingIds.add(reelId);
        categoryIngested++;
        totalIngested++;
        console.log(`✨ Successfully ingested reel ${reelId} (${totalIngested} total)!`);
      } catch (err) {
        console.error(`Failed to insert ${reelId} into D1:`, err.message);
      } finally {
        if (fs.existsSync(tmpSql)) fs.unlinkSync(tmpSql);
      }

      // Clean local video & thumb to save disk space
      if (fs.existsSync(videoTmp)) fs.unlinkSync(videoTmp);
      if (fs.existsSync(thumbTmp)) fs.unlinkSync(thumbTmp);
    }
  }

  // Cleanup temp dir
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`\n🎉 Ingestion complete! Added ${totalIngested} new college shorts to R2 & D1!`);
}

main().catch((err) => {
  console.error('Fatal error in ingestion bot:', err);
  process.exit(1);
});
