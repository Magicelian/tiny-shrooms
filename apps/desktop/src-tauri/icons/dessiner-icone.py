"""Icône du jeu en pixel art, dessinée sur une grille de 32 × 32 puis agrandie sans lissage.

Version « premium » (12/11/2026) : ciel en dégradé tramé avec soleil, nuages ombrés, hutte-champignon en trois
tons avec fenêtre allumée, île à strates et racines, petits rochers qui flottent, étincelles.
Couleurs proches de `packages/renderer/src/palette.ts`. Usage :
    python3 dessiner-icone.py && pnpm --filter desktop tauri icon src-tauri/icons/icone.png
(puis supprimer les dossiers `android` et `ios` générés).
"""
import struct
import zlib
from pathlib import Path

N = 32
ECHELLE = 32  # 1024 px

CONTOUR = (0x2A, 0x1E, 0x1A)
CIELS = [(0x5E, 0xA8, 0xE0), (0x76, 0xBC, 0xEA), (0x92, 0xD0, 0xF2), (0xB4, 0xE2, 0xF6), (0xD2, 0xEF, 0xF8)]
SOLEIL = (0xFF, 0xF4, 0xC0)
HALO = (0xE4, 0xF4, 0xE8)
NUAGE = (0xF6, 0xFB, 0xFE)
NUAGE_OMBRE = (0xC4, 0xDE, 0xEE)
HERBE = (0x7C, 0xC4, 0x52)
HERBE_CLAIRE = (0xA8, 0xE0, 0x70)
HERBE_SOMBRE = (0x56, 0x9A, 0x3C)
TERRE = (0x8A, 0x5A, 0x3B)
TERRE_CLAIRE = (0xA0, 0x6C, 0x46)
TERRE_SOMBRE = (0x6B, 0x44, 0x29)
ROCHE = (0x74, 0x78, 0x84)
ROCHE_CLAIRE = (0x92, 0x96, 0xA2)
ROCHE_SOMBRE = (0x4E, 0x51, 0x5C)
RACINE = (0x5A, 0x3A, 0x22)
CHAPEAU = (0xD8, 0x42, 0x3A)
CHAPEAU_SOMBRE = (0xA4, 0x2C, 0x28)
CHAPEAU_CLAIR = (0xF0, 0x70, 0x60)
POIS = (0xF6, 0xF2, 0xE6)
POIS_OMBRE = (0xD8, 0xC8, 0xB8)
LAMELLES = (0xE6, 0xD4, 0xB4)
PIED = (0xF4, 0xE8, 0xD2)
PIED_OMBRE = (0xD4, 0xC2, 0xA4)
PORTE = (0x6B, 0x42, 0x26)
PORTE_CLAIRE = (0x8A, 0x5A, 0x34)
POIGNEE = (0xF0, 0xC8, 0x5A)
FENETRE = (0xFF, 0xD8, 0x6A)
FENETRE_LUEUR = (0xFF, 0xF0, 0xB0)
FEUILLAGE = (0x3F, 0x8F, 0x3A)
FEUILLAGE_CLAIR = (0x6A, 0xB8, 0x52)
FEUILLAGE_SOMBRE = (0x2C, 0x6A, 0x2E)
TRONC = (0x6B, 0x42, 0x26)
EAU = (0x4F, 0xA3, 0xD9)
EAU_CLAIRE = (0x9C, 0xD8, 0xF4)
ETINCELLE = (0xFF, 0xFF, 0xF0)


class Grille:
    def __init__(self):
        self.p = [[None] * N for _ in range(N)]

    def point(self, x, y, c):
        if 0 <= x < N and 0 <= y < N:
            self.p[y][x] = c

    def ligne(self, y, x0, x1, c):
        for x in range(x0, x1 + 1):
            self.point(x, y, c)

    def ovale(self, cx, cy, rx, ry, c, si=lambda x, y: True):
        for y in range(N):
            for x in range(N):
                dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                if dx * dx + dy * dy <= 1 and si(x, y):
                    self.point(x, y, c)

    def repeindre(self, avant, apres, si):
        for y in range(N):
            for x in range(N):
                if self.p[y][x] == avant and si(x, y):
                    self.p[y][x] = apres

    def detourer(self):
        bord = [
            (x, y)
            for y in range(N)
            for x in range(N)
            if self.p[y][x] is None
            and any(0 <= x + dx < N and 0 <= y + dy < N and self.p[y + dy][x + dx] not in (None, CONTOUR) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        ]
        for x, y in bord:
            self.p[y][x] = CONTOUR


fond = Grille()
devant = Grille()

# ─── Ciel : bandes tramées, soleil et son halo, deux nuages ombrés ───────────────────
for y in range(N):
    rang = min(len(CIELS) - 1, y * len(CIELS) // 24)
    fond.ligne(y, 0, N - 1, CIELS[rang])
    if y % 5 == 4 and rang + 1 < len(CIELS):
        for x in range(y % 2, N, 2):
            fond.point(x, y, CIELS[rang + 1])
fond.ovale(24.5, 7.5, 4.6, 4.6, HALO)
fond.ovale(24.5, 7.5, 2.6, 2.6, SOLEIL)
for cx, cy, l in ((7, 7, 5), (19, 4, 3)):
    fond.ovale(cx, cy, l, 1.8, NUAGE)
    fond.ovale(cx - 1, cy - 1, l * 0.55, 1.4, NUAGE)
    fond.ligne(int(cy + 0.8), int(cx - l + 1.5), int(cx + l - 1.5), NUAGE_OMBRE)

# ─── Île : herbe, strates de terre, roche qui s'effile, racines ──────────────────────
devant.ovale(16, 20.5, 12.5, 2.6, HERBE)
devant.repeindre(HERBE, HERBE_CLAIRE, lambda x, y: y <= 18)
devant.repeindre(HERBE, HERBE_SOMBRE, lambda x, y: y >= 21)
for y, x0, x1 in [(22, 4, 27), (23, 5, 26)]:
    devant.ligne(y, x0, x1, TERRE)
devant.ligne(22, 4, 9, TERRE_CLAIRE)
for x in (8, 13, 19, 24):
    devant.point(x, 23, TERRE_SOMBRE)
for y, x0, x1 in [(24, 6, 25), (25, 8, 23), (26, 10, 21), (27, 12, 19), (28, 14, 17)]:
    devant.ligne(y, x0, x1, ROCHE)
    devant.ligne(y, x0, x0 + 1, ROCHE_CLAIRE)
    devant.ligne(y, x1 - 2, x1, ROCHE_SOMBRE)
devant.point(15, 29, ROCHE_SOMBRE)
devant.point(16, 29, ROCHE_SOMBRE)
for x, y0, y1 in ((7, 24, 25), (22, 25, 26), (12, 27, 28)):
    for y in range(y0, y1 + 1):
        devant.point(x, y, RACINE)
# Mare à gauche, avec un reflet.
devant.ligne(20, 6, 9, EAU)
devant.point(7, 20, EAU_CLAIRE)
# Rochers qui flottent à côté.
devant.ligne(25, 2, 3, ROCHE)
devant.point(3, 25, ROCHE_SOMBRE)
devant.ligne(23, 29, 30, ROCHE)
devant.point(29, 22, HERBE)

# ─── Arbre à droite, en trois tons ──────────────────────────────────────────────────
devant.ovale(24, 14, 3.4, 3.2, FEUILLAGE)
devant.repeindre(FEUILLAGE, FEUILLAGE_CLAIR, lambda x, y: x + y <= 35)
devant.repeindre(FEUILLAGE, FEUILLAGE_SOMBRE, lambda x, y: x + y >= 41)
for y in (17, 18, 19):
    devant.point(24, y, TRONC)

# ─── Hutte-champignon : pied ombré, porte en arc, fenêtre allumée, chapeau à pois ──
for y in range(13, 20):
    devant.ligne(y, 11, 18, PIED)
    devant.ligne(y, 17, 18, PIED_OMBRE)
for y in range(15, 20):
    devant.ligne(y, 13, 15, PORTE)
devant.ligne(15, 13, 13, PORTE_CLAIRE)
devant.point(13, 16, PORTE_CLAIRE)
devant.point(14, 14, PORTE)
devant.point(15, 17, POIGNEE)
devant.point(17, 15, FENETRE)
devant.point(17, 16, FENETRE)
devant.point(16, 15, FENETRE_LUEUR)
devant.ovale(14.5, 12, 10, 8, CHAPEAU, si=lambda x, y: y <= 11)
devant.repeindre(CHAPEAU, CHAPEAU_CLAIR, lambda x, y: (x - 10) ** 2 / 2 + (y - 6) ** 2 <= 5)
devant.repeindre(CHAPEAU, CHAPEAU_SOMBRE, lambda x, y: y == 11 or x - y >= 12)
devant.ligne(12, 7, 22, LAMELLES)
for x in range(8, 22, 3):
    devant.point(x, 12, PIED_OMBRE)
for x, y in ((14, 6), (15, 6), (14, 7), (15, 7), (9, 8), (10, 8), (19, 8), (20, 8), (20, 9), (17, 5), (7, 10), (12, 10)):
    devant.point(x, y, POIS)
for x, y in ((15, 8), (10, 9), (20, 10)):
    devant.point(x, y, POIS_OMBRE)

# Étincelles.
for x, y in ((4, 13), (28, 17), (21, 2)):
    fond.point(x, y, ETINCELLE)

devant.detourer()
for y in range(N):
    for x in range(N):
        if devant.p[y][x] is not None:
            fond.p[y][x] = devant.p[y][x]

# ─── Carré arrondi (rayon 5), liseré sombre et reflet clair en haut ─────────────────
# Marge de 2 pixels tout autour, comme les icônes de macOS.
R, M = 5, 2
BAS, HAUT = M + R, N - 1 - M - R
for y in range(N):
    for x in range(N):
        cx = min(max(x, BAS), HAUT)
        cy = min(max(y, BAS), HAUT)
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        if d > R + 0.4:
            fond.p[y][x] = None
        elif d > R - 0.6:
            fond.p[y][x] = CONTOUR
for x in range(BAS, HAUT + 1):
    if fond.p[M + 1][x] in CIELS:
        fond.p[M + 1][x] = CIELS[-1]


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


ecrire_png(Path(__file__).parent / 'icone.png', fond.p, ECHELLE)
