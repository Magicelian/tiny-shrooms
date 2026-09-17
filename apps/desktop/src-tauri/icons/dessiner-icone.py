"""Icône du jeu en pixel art, dessinée sur une grille de 32 × 32 puis agrandie sans lissage.

Couleurs de `packages/renderer/src/palette.ts`. Usage :
    python3 dessiner-icone.py && pnpm --filter desktop tauri icon src-tauri/icons/icone.png
"""
import struct
import zlib
from pathlib import Path

N = 32
ECHELLE = 32  # 1024 px

VIDE = None
CONTOUR = (0x2A, 0x1E, 0x1A)
CIEL = (0x9F, 0xD8, 0xF0)
CIEL_HAUT = (0x86, 0xC8, 0xEA)
NUAGE = (0xE8, 0xF6, 0xFC)
HERBE = (0x7C, 0xC4, 0x52)
HERBE_CLAIRE = (0xA3, 0xDC, 0x6E)
TERRE = (0x8A, 0x5A, 0x3B)
TERRE_SOMBRE = (0x6B, 0x44, 0x29)
ROCHE = (0x6B, 0x6F, 0x7A)
ROCHE_SOMBRE = (0x50, 0x53, 0x5C)
CHAPEAU = (0xD8, 0x42, 0x3A)
CHAPEAU_SOMBRE = (0xA8, 0x2E, 0x28)
CHAPEAU_CLAIR = (0xEE, 0x6A, 0x5C)
POIS = (0xF2, 0xF2, 0xE8)
PIED = (0xF2, 0xE6, 0xCF)
PIED_OMBRE = (0xD4, 0xC4, 0xA8)
PORTE = (0x6B, 0x42, 0x26)
FEUILLAGE = (0x3F, 0x8F, 0x3A)
FEUILLAGE_CLAIR = (0x5F, 0xB0, 0x4E)
TRONC = (0x6B, 0x42, 0x26)
EAU = (0x4F, 0xA3, 0xD9)

fond = [[VIDE] * N for _ in range(N)]
devant = [[VIDE] * N for _ in range(N)]


def ligne(grille, y, x0, x1, couleur):
    for x in range(x0, x1 + 1):
        grille[y][x] = couleur


# Fond : carré arrondi, ciel un peu plus soutenu en haut, deux nuages.
MARGE = 2
for y in range(MARGE, N - MARGE):
    retrait = {0: 3, 1: 1, 2: 1}.get(min(y - MARGE, N - MARGE - 1 - y), 0)
    ligne(fond, y, MARGE + retrait, N - MARGE - 1 - retrait, CIEL_HAUT if y < 12 else CIEL)
for y, x0, x1 in [(6, 5, 8), (5, 6, 7), (9, 23, 27), (8, 24, 26)]:
    ligne(fond, y, x0, x1, NUAGE)

# Île : dessus d'herbe, couches de terre puis de roche qui s'effilent.
ligne(devant, 18, 6, 25, HERBE)
ligne(devant, 19, 5, 26, HERBE)
ligne(devant, 20, 5, 26, HERBE)
for x in (7, 11, 20, 24):
    devant[18][x] = HERBE_CLAIRE
ligne(devant, 21, 5, 26, TERRE)
ligne(devant, 22, 6, 25, TERRE)
ligne(devant, 23, 7, 24, TERRE_SOMBRE)
ligne(devant, 24, 9, 22, ROCHE)
ligne(devant, 25, 11, 20, ROCHE)
ligne(devant, 26, 13, 18, ROCHE_SOMBRE)
for x in (9, 17, 23):
    devant[22][x] = TERRE_SOMBRE
for x in (12, 18):
    devant[24][x] = ROCHE_SOMBRE
# Petite mare à gauche.
ligne(devant, 19, 6, 8, EAU)

# Arbre à droite.
for y, x0, x1 in [(12, 22, 24), (13, 21, 25), (14, 21, 25), (15, 22, 24)]:
    ligne(devant, y, x0, x1, FEUILLAGE)
devant[13][22] = FEUILLAGE_CLAIR
devant[12][23] = FEUILLAGE_CLAIR
ligne(devant, 16, 23, 23, TRONC)
ligne(devant, 17, 23, 23, TRONC)

# Hutte-champignon : pied avec sa porte, puis chapeau à pois.
for y in range(13, 18):
    ligne(devant, y, 12, 17, PIED)
    devant[y][17] = PIED_OMBRE
for y in range(15, 18):
    ligne(devant, y, 14, 15, PORTE)
chapeau = [(5, 12, 17), (6, 10, 19), (7, 9, 20), (8, 8, 21), (9, 8, 21), (10, 7, 22), (11, 7, 22)]
for y, x0, x1 in chapeau:
    ligne(devant, y, x0, x1, CHAPEAU)
ligne(devant, 12, 8, 21, CHAPEAU_SOMBRE)
for y, x in [(6, 12), (6, 13), (7, 11)]:
    devant[y][x] = CHAPEAU_CLAIR
for y, x0, x1 in [(7, 15, 16), (8, 15, 16), (9, 10, 11), (10, 10, 11), (9, 19, 20), (10, 19, 19), (6, 17, 17)]:
    ligne(devant, y, x0, x1, POIS)

# Contour d'un pixel autour de tout ce qui est devant, puis autour du fond.
image = [row[:] for row in fond]
for y in range(N):
    for x in range(N):
        if devant[y][x] is not VIDE:
            image[y][x] = devant[y][x]
voisins = [(-1, 0), (1, 0), (0, -1), (0, 1)]
for y in range(N):
    for x in range(N):
        if devant[y][x] is not VIDE:
            continue
        if any(0 <= y + dy < N and 0 <= x + dx < N and devant[y + dy][x + dx] is not VIDE for dy, dx in voisins):
            image[y][x] = CONTOUR
for y in range(N):
    for x in range(N):
        if fond[y][x] is not VIDE or image[y][x] is not VIDE:
            continue
        if any(0 <= y + dy < N and 0 <= x + dx < N and fond[y + dy][x + dx] is not VIDE for dy, dx in voisins):
            image[y][x] = CONTOUR


def ecrire_png(chemin, pixels, echelle):
    taille = len(pixels) * echelle
    brut = bytearray()
    for rangee in pixels:
        ligne_png = bytearray([0])
        for p in rangee:
            ligne_png += bytes((*p, 255) if p else (0, 0, 0, 0)) * echelle
        brut += bytes(ligne_png) * echelle

    def morceau(type_, donnees):
        return struct.pack('>I', len(donnees)) + type_ + donnees + struct.pack('>I', zlib.crc32(type_ + donnees))

    entete = struct.pack('>IIBBBBB', taille, taille, 8, 6, 0, 0, 0)
    Path(chemin).write_bytes(
        b'\x89PNG\r\n\x1a\n' + morceau(b'IHDR', entete) + morceau(b'IDAT', zlib.compress(bytes(brut), 9)) + morceau(b'IEND', b'')
    )


ici = Path(__file__).parent
ecrire_png(ici / 'icone.png', image, ECHELLE)
