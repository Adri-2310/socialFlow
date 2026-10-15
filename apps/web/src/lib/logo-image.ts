import sharp from 'sharp';

// Traitement des logos PNG (D63) : redimensionnement et re-encodage cote
// serveur avec sharp. Le fichier stocke n'est jamais l'octet-pour-octet recu :
// il est decode puis re-encode, ce qui retire les metadonnees (EXIF,
// geolocalisation, profils) et ecarte tout fichier qui n'est pas une vraie
// image meme s'il en a la signature.

// Cote maximal du logo stocke, en pixels. Largement suffisant pour un affichage
// a 36 px, y compris sur ecran haute densite et dans les PDF.
export const LOGO_MAX_SIDE = 512;

// Garde-fou contre les "bombes de decompression" : un PNG de 1 Mo peut
// declarer des dimensions gigantesques. Au-dela, on refuse sans decoder.
const MAX_INPUT_PIXELS = 16_000_000;

export type ProcessedLogo = { bytes: Uint8Array; width: number; height: number };

// null = fichier illisible ou non conforme.
export async function processPngLogo(input: Uint8Array): Promise<ProcessedLogo | null> {
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate() // applique l'orientation EXIF avant de la retirer
      .resize(LOGO_MAX_SIDE, LOGO_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });

    return { bytes: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return null;
  }
}
