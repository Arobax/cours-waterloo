// Liste les fichiers de chaque dossier de /syntheses/content dans manifest.json.
// Lancé par Netlify à chaque déploiement (voir netlify.toml). Ne fait jamais échouer le déploiement.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'syntheses', 'content');
const ok = /\.(pdf|png|jpe?g|webp|mp4|txt)$/i;
try {
  fs.mkdirSync(root, { recursive: true });
  const m = {};
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    m[d.name] = fs.readdirSync(path.join(root, d.name))
      .filter(f => !f.startsWith('.') && ok.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(m));
  console.log(`manifest: ${Object.keys(m).length} dossier(s)`);
} catch (e) { console.warn('manifest ignoré :', e.message); }
