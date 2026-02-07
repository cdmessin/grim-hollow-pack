# Grim Hollow Pack

A Foundry VTT module containing spells from the Grim Hollow Players Guide for use with the DnD5e system. Currently includes 16 spells (Cantrips through 3rd level), including sangromancy spells. Additional spell levels may be added in future updates.

This module contains homebrew content from the **Grim Hollow Players Guide** by [Ghostfire Gaming](https://ghostfiregaming.com/). It is unofficial fan content and is not affiliated with or endorsed by Ghostfire Gaming.

## Requirements

- Foundry VTT v12 or later
- DnD5e system v4.0.0 or later

## Building from Source

Install dependencies and compile the YAML source files into LevelDB packs:

```bash
npm install
npm run build
```

The compiled packs will be written to `packs/spells-gh/`.

## Installing into Foundry VTT

### Local Install

1. Build the module (see above).
2. Copy or symlink the project folder into your Foundry VTT `Data/modules/` directory. The folder **must** be named `grim-hollow-pack` to match the module ID.
3. Launch Foundry VTT and open your world.
4. Go to **Settings > Manage Modules**, find **Grim Hollow Pack**, and enable it.
5. The spells will appear in the **Compendium** tab under **Grim Hollow > Spells (Grim Hollow)**.

### Manifest URL

If the module is hosted remotely, you can install it from the Foundry VTT setup screen:

1. Go to **Add-on Modules > Install Module**.
2. Paste the manifest URL (pointing to `module.json`) into the **Manifest URL** field.
3. Click **Install**, then activate the module in your world.
