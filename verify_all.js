const fs = require('fs');
const path = require('path');

const files = [
  'index.html',
  'manifest.webmanifest',
  'og.jpg',
  'banner.jpg',
  'icons/icon-32.png',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'boat_model.js',
  'livery.js',
  'sea.js',
  'rig.js',
  'crew_models.js',
  'crew.js',
  'shore/village_layout.js',
  'shore/crowd_bodies.js',
  'shore/shore.js',
  'shore/gopuram_model.js',
  'shore/mandapam_model.js',
  'shore/vimana_model.js',
  'shore/complex_model.js',
  'shore/veg_model.js',
  'shore/palm_model.js',
  'shore/village_model.js',
  'audio/eagle.mp3',
  'audio/menu_naval.mp3',
  'audio/race_base.mp3',
  'audio/race_fast.mp3',
  'audio/race_final.mp3',
  'audio/sea_bed.mp3',
  'audio/start_burst.mp3',
  'film/opening.mp4',
  'lib/three.min.js',
  'lib/GLTFLoader.js',
  'lib/SkeletonUtils.js',
  'lib/BufferGeometryUtils.js'
];

console.log('Verifying assets on disk:');
let totalBytes = 0;
let missing = 0;
for (const f of files) {
  const p = path.join(__dirname, f.replace(/\//g, path.sep));
  if (fs.existsSync(p)) {
    const s = fs.statSync(p).size;
    totalBytes += s;
    console.log(`  [OK] ${f} (${(s / 1024).toFixed(1)} KB)`);
  } else {
    missing++;
    console.log(`  [MISSING] ${f}`);
  }
}
console.log(`\nTotal verified: ${files.length - missing}/${files.length} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
if (missing === 0) {
  console.log('All project assets verified successfully.');
} else {
  process.exit(1);
}
