import fs from "fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "path";
import YAML from "js-yaml";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";

/**
 * Folder where the compiled compendium packs should be located relative to the
 * base module folder.
 * @type {string}
 */
const PACK_DEST = "packs";

/**
 * Folder where source YAML files should be located relative to the module folder.
 * @type {string}
 */
const PACK_SRC = "packs/_source";

/**
 * Parse command line arguments
 */
const args = process.argv.slice(2);
const action = args[0];
const packName = args[1];

switch (action) {
  case "pack":
    await compilePacks(packName);
    break;
  case "unpack":
    await extractPacks(packName);
    break;
  case "clean":
    await cleanPacks(packName);
    break;
  default:
    console.log("Usage: node utils/packs.mjs [pack|unpack|clean] [packName]");
    console.log("  pack   - Compile source YAML files into LevelDB packs");
    console.log("  unpack - Extract LevelDB packs into source YAML files");
    console.log("  clean  - Clean source YAML files");
    process.exit(1);
}

/* ----------------------------------------- */
/*  Clean Pack Entry                         */
/* ----------------------------------------- */

/**
 * Removes unwanted flags, permissions, and other data from entries before extracting or compiling.
 * @param {object} data                           Data for a single entry to clean.
 * @param {object} [options={}]
 * @param {boolean} [options.clearSourceId=true]  Should the core sourceId flag be deleted.
 * @param {number} [options.ownership=0]          Value to reset default ownership to.
 */
function cleanPackEntry(data, { clearSourceId = true, ownership = 0 } = {}) {
  if (data.ownership) data.ownership = { default: ownership };
  if (clearSourceId) {
    delete data._stats?.compendiumSource;
    delete data.flags?.core?.sourceId;
  }
  delete data.flags?.importSource;
  delete data.flags?.exportSource;
  if (data._stats?.lastModifiedBy) data._stats.lastModifiedBy = "ghPackBuilder0000";

  // Remove empty entries in flags
  if (!data.flags) data.flags = {};
  Object.entries(data.flags).forEach(([key, contents]) => {
    if (Object.keys(contents).length === 0) delete data.flags[key];
  });

  if (data.effects) data.effects.forEach(i => cleanPackEntry(i, { clearSourceId: false }));
  if (data.items) data.items.forEach(i => cleanPackEntry(i, { clearSourceId: false }));
  if (data.system?.description?.value) data.system.description.value = cleanString(data.system.description.value);
  if (data.label) data.label = cleanString(data.label);
  if (data.name) data.name = cleanString(data.name);
}

/**
 * Removes invisible whitespace characters and normalizes single- and double-quotes.
 * @param {string} str  The string to be cleaned.
 * @returns {string}    The cleaned string.
 */
function cleanString(str) {
  return str.replace(/\u2060/gu, "").replace(/['']/gu, "'").replace(/[""]/gu, '"');
}

/* ----------------------------------------- */
/*  Compile Packs                            */
/* ----------------------------------------- */

/**
 * Compile the source files into compendium packs.
 * @param {string} [packName]  Name of pack to compile. If none provided, all packs will be packed.
 */
async function compilePacks(packName) {
  // Determine which source folders to process
  const folders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter(file =>
    file.isDirectory() && (!packName || (packName === file.name))
  );

  for (const folder of folders) {
    const src = path.join(PACK_SRC, folder.name);
    const dest = path.join(PACK_DEST, folder.name);
    console.log(`Compiling pack ${folder.name}`);
    await compilePack(src, dest, { recursive: true, log: true, transformEntry: cleanPackEntry, yaml: true });
  }
}

/* ----------------------------------------- */
/*  Extract Packs                            */
/* ----------------------------------------- */

/**
 * Extract the contents of compendium packs to source files.
 * @param {string} [packName]  Name of pack to extract. If none provided, all packs will be unpacked.
 */
async function extractPacks(packName) {
  // Load module.json
  const module = JSON.parse(fs.readFileSync("./module.json", { encoding: "utf8" }));

  // Determine which packs to process
  const packs = module.packs.filter(p => !packName || p.name === packName);

  for (const packInfo of packs) {
    const dest = path.join(PACK_SRC, packInfo.name);
    console.log(`Extracting pack ${packInfo.name}`);

    const folders = {};
    await extractPack(packInfo.path, dest, {
      log: false, transformEntry: e => {
        if (e._key.startsWith("!folders")) folders[e._id] = { name: slugify(e.name), folder: e.folder };
        return false;
      }
    });
    const buildPath = (collection, entry, parentKey) => {
      let parent = collection[entry[parentKey]];
      entry.path = entry.name;
      while (parent) {
        entry.path = path.join(parent.name, entry.path);
        parent = collection[parent[parentKey]];
      }
    };
    Object.values(folders).forEach(f => buildPath(folders, f, "folder"));

    await extractPack(packInfo.path, dest, {
      log: true, transformEntry: entry => {
        cleanPackEntry(entry);
      }, transformName: entry => {
        if (entry._id in folders) return path.join(folders[entry._id].path, "_folder.yml");
        const outputName = slugify(entry.name);
        const parent = folders[entry.folder];
        return path.join(parent?.path ?? "", `${outputName}.yml`);
      }, yaml: true
    });
  }
}

/* ----------------------------------------- */
/*  Clean Packs                              */
/* ----------------------------------------- */

/**
 * Walk through directories to find YAML files.
 * @param {string} directoryPath
 * @yields {string}
 */
async function* walkDir(directoryPath) {
  const directory = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of directory) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) yield* walkDir(entryPath);
    else if (path.extname(entry.name) === ".yml") yield entryPath;
  }
}

/**
 * Cleans and formats source files.
 * @param {string} [packName]  Name of pack to clean. If none provided, all packs will be cleaned.
 */
async function cleanPacks(packName) {
  const folders = fs.readdirSync(PACK_SRC, { withFileTypes: true }).filter(file =>
    file.isDirectory() && (!packName || (packName === file.name))
  );

  for (const folder of folders) {
    console.log(`Cleaning pack ${folder.name}`);
    for await (const src of walkDir(path.join(PACK_SRC, folder.name))) {
      const data = YAML.load(await readFile(src, { encoding: "utf8" }));
      if (!data._id || !data._key) {
        console.log(`Failed to clean ${src}, must have _id and _key.`);
        continue;
      }
      cleanPackEntry(data);
      fs.rmSync(src, { force: true });
      writeFile(src, `${YAML.dump(data)}\n`, { mode: 0o664 });
    }
  }
}

/**
 * Standardize name format.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name.toLowerCase().replace("'", "").replace(/[^a-z0-9]+/gi, " ").trim().replace(/\s+|-{2,}/g, "-");
}
