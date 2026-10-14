import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Diverse, high-speed, 100% verified streamable base MP4 clips
const SOURCE_VIDEOS = [
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://vjs.zencdn.net/v/oceans.mp4',
];

const REEL_IDS = [
  'reel-hostel-1',
  'reel-code-2',
  'reel-campus-3',
  'reel-meme-4',
  'reel-exam-5',
  'reel-viva-6',
  'reel-canteen-7',
  'reel-placement-8',
  'reel-hackathon-9',
  'reel-library-10',
  'reel-proxy-11',
  'reel-weekend-12',
];

async function main() {
  const tmpDir = path.join(process.cwd(), 'temp_reels');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

  console.log(`Starting R2 upload for ${REEL_IDS.length} student reels...`);

  // Download unique base clips
  const downloadedClips = [];
  for (let i = 0; i < SOURCE_VIDEOS.length; i++) {
    const src = SOURCE_VIDEOS[i];
    const localFile = path.join(tmpDir, `base-${i}.mp4`);
    console.log(`Downloading base video [${i + 1}/${SOURCE_VIDEOS.length}] from ${src}...`);
    const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${src}: HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localFile, buf);
    downloadedClips.push(localFile);
    console.log(`Saved base-${i}.mp4 (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  // Upload each reel mapped to an R2 object
  for (let i = 0; i < REEL_IDS.length; i++) {
    const reelId = REEL_IDS[i];
    const baseClip = downloadedClips[i % downloadedClips.length];
    const r2Key = `reels/${reelId}.mp4`;
    console.log(`[${i + 1}/${REEL_IDS.length}] Uploading ${reelId}.mp4 to R2 key ${r2Key}...`);
    execSync(`npx wrangler r2 object put student-addit-studies/${r2Key} --file "${baseClip}" --content-type video/mp4 --remote`, {
      stdio: 'inherit',
    });
  }

  // Clean up temp
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`✨ All ${REEL_IDS.length} reels successfully uploaded to Cloudflare R2!`);
}

main().catch((err) => {
  console.error('Fatal error during R2 upload:', err);
  process.exit(1);
});
