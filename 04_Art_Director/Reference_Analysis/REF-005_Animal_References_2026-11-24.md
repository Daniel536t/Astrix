# REF-005 Animal References (2026-11-24)

Source: 12 images in `05_Noxel_Studio/Asset_Sheets/2026-11-24_animals/` (tablet screenshots, 2560x1600). Used for the M006/M007 animal rig.

## Shared traits
- Chunky voxel/block bodies, 1 to 3 box masses per animal (head, torso, legs), with small detail boxes for ears, snout, tail, horns.
- Flat or near-flat colour per part. Legs and hooves get a darker or contrasting end block.
- Big square heads with simple black or white-and-black eyes.
- Warm, saturated palettes for farm animals; cool greys for wild ones.

## Per image
| Subject | Palette | Notes for the rig |
|---|---|---|
| Brown deer/foal (stepped voxel) | oranges #C8641E to #8A3E14, dark hooves, cream muzzle, green base | Long neck, thin legs, forked ear/antler nubs. Informs young/deer proportions. |
| Farm lineup sheet (donkey, horse, fox, dog, sheep, pig, pony, crow, chick) | grey, orange, white fox bib, pink pig, black/yellow birds | Best single size-comparison reference. Shows relative scale between species. |
| Bull/cow | tan #D89A50, brown mane #8A4A20, cream horns, pink-tan muzzle | Large muzzle block, horns, tail tuft. |
| Goat | khaki #A89A6E, white hoof tips, dark grey horns, pink mouth, white beard | Hoof tips and beard are the identifying marks. |
| Sheep | white #F0F0F4 with grey shadow cells, tan legs, cream face | Textured fleece with holes. Interpreted as a plain white block. |
| Brown dog/horse (flat shaded) | brown #8A4A18, darker #5A2A0C, pink inner ears and tongue, white eyes | Plain flat-colour block animal. Closest to the target style. |
| Fox | orange #E0561A, cream #E8D4BC tail tip/muzzle/chest, dark brown ears and brows, magenta tongue | Low, long body, big cream tail. Basis for the predator fox. |
| Stag/reindeer | grey #8A8E94, white chest and socks, black hooves, red antlers | Antlers are the key silhouette. |
| Rabbit | white, pink inner ears, pink nose, cream muzzle | Very tall ears, cube tail. |
| Wolf (smooth illustrated render) | slate #4A4A5E to #6A6A80, big black eyes, white fang, pointed ears | Smooth, painted style with a scenic background. Interpreted as a plain slate-colour block with pointed ears. |
| Chickens (brown hen, white hen, yellow chick) | brown #8A4E2A, white, yellow #F0F040, red combs, orange beaks, grey tail feathers | Size ladder from chick to hen. Orange beak and red comb. |
| Pig (Minecraft-like) | pink #F0A0A0, snout/hoof #E06060, black eyes | Textured pink with mottling. Interpreted as a plain pink block with a darker snout and hooves. |

## Interpretation decisions
- Smooth wolf: the soft illustrated shading was dropped. The wolf is a plain slate block with ears.
- Textured pig and sheep: per-pixel noise was not reproduced. Each is a plain colour block, with the lit/shadow variation coming from the scene lighting.
- Eyes, tongues and fine face detail are omitted at game camera distance.
