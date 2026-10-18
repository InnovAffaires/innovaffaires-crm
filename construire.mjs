// =============================================================================
// InnovAffaires — préparation du site et du CRM pour la publication.
//
// Netlify lance ce fichier à chaque publication (voir netlify.toml). Il ouvre le
// paquet « paquet.tgz » et reconstitue, à côté de lui :
//   public/             le site (www.innovaffaires.com) et le CRM (/crm/)
//   netlify/functions/  le serveur du CRM (adresses /api/…)
//   crm/js/commun/      du code partagé entre le CRM et son serveur
// Chaque fichier est comparé à l'empreinte (SHA-256) inscrite dans le paquet :
// si quelque chose manque ou a été modifié, la publication s'arrête avec un
// message clair plutôt que de mettre en ligne un site incomplet.
//
// Ce fichier n'a aucune dépendance : il n'utilise que ce que Node.js fournit.
// =============================================================================
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = dirname(fileURLToPath(import.meta.url));
const NOM_PAQUET = "paquet.tgz";
const DOSSIERS = ["public", "netlify", "crm"]; // vidés avant d'être reconstitués

function echouer(message) {
  console.error(`\nERREUR — ${message}\n`);
  process.exit(1);
}

/** Lit une archive « tar » (format ustar) et retourne [{ chemin, dossier, contenu }]. */
export function lireTar(octets) {
  const entrees = [];
  const texte = (b, d, f) => {
    const fin = b.indexOf(0, d);
    return b.toString("utf8", d, fin === -1 || fin > f ? f : fin);
  };
  let pos = 0;
  while (pos + 512 <= octets.length) {
    const entete = octets.subarray(pos, pos + 512);
    if (entete.every((x) => x === 0)) break; // fin de l'archive
    // Somme de contrôle de l'en-tête (le champ lui-même compte pour des espaces).
    let somme = 0;
    for (let i = 0; i < 512; i++) somme += i >= 148 && i < 156 ? 32 : entete[i];
    if (somme !== parseInt(texte(entete, 148, 156).trim() || "-1", 8)) throw new Error("en-tête d'archive illisible");
    const nom = texte(entete, 0, 100);
    const prefixe = texte(entete, 345, 500);
    const taille = parseInt(texte(entete, 124, 136).trim() || "0", 8);
    const type = String.fromCharCode(entete[156] || 48);
    const chemin = prefixe ? `${prefixe}/${nom}` : nom;
    pos += 512;
    if (type === "0") {
      if (pos + taille > octets.length) throw new Error("archive tronquée");
      entrees.push({ chemin, dossier: false, contenu: octets.subarray(pos, pos + taille) });
    } else if (type === "5") {
      entrees.push({ chemin: chemin.replace(/\/+$/, ""), dossier: true, contenu: Buffer.alloc(0) });
    } else {
      throw new Error(`type d'entrée non pris en charge (${type}) : ${chemin}`);
    }
    pos += Math.ceil(taille / 512) * 512;
  }
  return entrees;
}

const empreinte = (octets) => createHash("sha256").update(octets).digest("hex");

function cheminSur(chemin) {
  const propre = chemin.replace(/\\/g, "/");
  if (!propre || propre.startsWith("/") || propre.split("/").some((s) => s === ".." || s === "." || s === "")) {
    throw new Error(`chemin refusé : ${chemin}`);
  }
  const absolu = resolve(RACINE, propre);
  if (!absolu.startsWith(RACINE + sep)) throw new Error(`chemin refusé : ${chemin}`);
  return absolu;
}

function compterFichiers(dossier) {
  let n = 0;
  for (const nom of readdirSync(dossier)) {
    const p = join(dossier, nom);
    n += statSync(p).isDirectory() ? compterFichiers(p) : 1;
  }
  return n;
}

export function construire() {
  const chemin = join(RACINE, NOM_PAQUET);
  if (!existsSync(chemin)) {
    echouer(`le fichier « ${NOM_PAQUET} » est introuvable. Il doit se trouver dans le dépôt, à côté de « construire.mjs ». Téléversez-le de nouveau depuis le dossier fourni.`);
  }
  let entrees;
  try {
    entrees = lireTar(gunzipSync(readFileSync(chemin)));
  } catch (e) {
    echouer(`le fichier « ${NOM_PAQUET} » est incomplet ou abîmé (${e.message}). Téléversez-le de nouveau depuis le dossier fourni, en attendant la fin du téléversement avant de valider.`);
  }

  const manifeste = entrees.find((e) => e.chemin === "MANIFESTE.json");
  if (!manifeste) echouer(`le paquet ne contient pas son manifeste (MANIFESTE.json). Téléversez-le de nouveau depuis le dossier fourni.`);
  let attendu;
  try {
    attendu = JSON.parse(manifeste.contenu.toString("utf8"));
    if (!attendu || !Array.isArray(attendu.fichiers)) throw new Error("format inattendu");
  } catch (e) {
    echouer(`le manifeste du paquet est illisible (${e.message}).`);
  }

  for (const d of DOSSIERS) rmSync(join(RACINE, d), { recursive: true, force: true });

  const fichiers = entrees.filter((e) => !e.dossier && e.chemin !== "MANIFESTE.json");
  for (const f of fichiers) {
    let cible;
    try {
      cible = cheminSur(f.chemin);
    } catch (e) {
      echouer(e.message);
    }
    mkdirSync(dirname(cible), { recursive: true });
    writeFileSync(cible, f.contenu);
  }

  // Vérification : chaque fichier annoncé est là, intact, et rien n'a été ajouté.
  const problemes = [];
  const annonces = new Map(attendu.fichiers.map((f) => [f.chemin, f]));
  for (const [chemin_, f] of annonces) {
    const trouve = fichiers.find((x) => x.chemin === chemin_);
    if (!trouve) problemes.push(`manquant : ${chemin_}`);
    else if (trouve.contenu.length !== f.taille || empreinte(trouve.contenu) !== f.sha256) problemes.push(`modifié ou incomplet : ${chemin_}`);
  }
  for (const f of fichiers) if (!annonces.has(f.chemin)) problemes.push(`inattendu : ${f.chemin}`);
  if (problemes.length) {
    echouer(`le contenu du paquet ne correspond pas à son manifeste (${problemes.length} problème(s)) :\n  - ${problemes.slice(0, 10).join("\n  - ")}\nTéléversez de nouveau le paquet complet depuis le dossier fourni.`);
  }
  for (const indispensable of ["public/index.html", "public/crm/index.html", "netlify/functions/api.mjs"]) {
    if (!existsSync(join(RACINE, indispensable))) echouer(`fichier indispensable absent après l'ouverture du paquet : ${indispensable}`);
  }

  console.log(`InnovAffaires — paquet « ${attendu.paquet || "?"} » ouvert et vérifié.`);
  console.log(`  ${fichiers.length} fichiers · site : ${compterFichiers(join(RACINE, "public"))} fichiers à publier · serveur du CRM : netlify/functions/api.mjs`);
  return { fichiers: fichiers.length, paquet: attendu.paquet };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) construire();
