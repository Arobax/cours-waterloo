/* Base de données du site : db.json dans le repo GitHub séparé (lecture publique). */
const DB = { owner: 'Arobax', repo: 'cours-waterloo-data', path: 'db.json', branch: 'main' };
DB.url = `https://api.github.com/repos/${DB.owner}/${DB.repo}/contents/${DB.path}`;
let _dbCache;
async function loadDB() {
  if (_dbCache) return _dbCache;
  let r;
  try { r = await fetch(`${DB.url}?ref=${DB.branch}`, { headers: { Accept: 'application/vnd.github.raw+json' } }); }
  catch { throw new Error('Connexion impossible. Vérifie ta connexion internet.'); }
  if (!r.ok) throw new Error(r.status === 403 || r.status === 429
    ? 'Trop de requêtes vers GitHub. Réessaie dans quelques minutes.'
    : `Base de données inaccessible (erreur ${r.status}).`);
  return (_dbCache = await r.json());
}
