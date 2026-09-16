// Pipeline pixelisé : la scène est rendue en basse résolution, puis une passe plein écran
// trace les contours à partir de la profondeur et des normales. Le canevas, agrandi en CSS
// avec `image-rendering: pixelated`, fait office de filtrage `nearest`.
import * as THREE from 'three';

const sommets = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragments = /* glsl */ `
uniform sampler2D tCouleur;
uniform sampler2D tNormales;
uniform sampler2D tProfondeur;
uniform vec2 taille;
uniform float profondeurMonde;
varying vec2 vUv;

float profondeur(vec2 uv) { return texture2D(tProfondeur, uv).x * profondeurMonde; }
vec3 normale(vec2 uv) { return texture2D(tNormales, uv).xyz * 2.0 - 1.0; }

void main() {
  vec4 couleur = texture2D(tCouleur, vUv);
  float d = profondeur(vUv);
  vec3 n = normale(vUv);
  vec2 pas = 1.0 / taille;
  vec2 voisins[4];
  voisins[0] = vec2(pas.x, 0.0);
  voisins[1] = vec2(-pas.x, 0.0);
  voisins[2] = vec2(0.0, pas.y);
  voisins[3] = vec2(0.0, -pas.y);

  float bordProfondeur = 0.0;
  float bordNormale = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + voisins[i];
    float ecart = profondeur(uv) - d;
    // Contour sombre sur le pixel le plus proche quand le voisin est nettement derrière.
    bordProfondeur += step(0.25, ecart);
    // Arête claire entre deux faces, seulement si le voisin n'est pas devant.
    vec3 nv = normale(uv);
    float sens = step(0.0, dot(n - nv, vec3(-1.0, 1.0, 0.5)) - 0.01);
    float devant = step(-0.05, ecart);
    bordNormale += (1.0 - dot(n, nv)) * sens * devant;
  }

  vec3 rgb = couleur.rgb;
  if (bordProfondeur > 0.0) {
    rgb *= 0.35;
  } else if (bordNormale > 0.2) {
    rgb = min(rgb * 1.35, vec3(1.0));
  }
  gl_FragColor = vec4(rgb, couleur.a);
  #include <colorspace_fragment>
}`;

export class Pixelisation {
  private readonly couleur = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
  private readonly normales = new THREE.WebGLRenderTarget(1, 1);
  private readonly materiauNormales = new THREE.MeshNormalMaterial();
  private readonly passe: THREE.ShaderMaterial;
  private readonly scenePasse = new THREE.Scene();
  private readonly cameraPasse = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly moteur: THREE.WebGLRenderer) {
    this.passe = new THREE.ShaderMaterial({
      vertexShader: sommets,
      fragmentShader: fragments,
      uniforms: {
        tCouleur: { value: this.couleur.texture },
        tNormales: { value: this.normales.texture },
        tProfondeur: { value: this.couleur.depthTexture },
        taille: { value: new THREE.Vector2(1, 1) },
        profondeurMonde: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.scenePasse.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.passe));
  }

  /** Taille de rendu en pixels réels (déjà réduite). */
  redimensionner(largeur: number, hauteur: number): void {
    this.couleur.setSize(largeur, hauteur);
    this.normales.setSize(largeur, hauteur);
    this.passe.uniforms.taille!.value.set(largeur, hauteur);
  }

  rendre(scene: THREE.Scene, camera: THREE.OrthographicCamera): void {
    this.passe.uniforms.profondeurMonde!.value = camera.far - camera.near;
    const moteur = this.moteur;

    moteur.setRenderTarget(this.couleur);
    moteur.render(scene, camera);

    scene.overrideMaterial = this.materiauNormales;
    moteur.setRenderTarget(this.normales);
    moteur.render(scene, camera);
    scene.overrideMaterial = null;

    moteur.setRenderTarget(null);
    moteur.render(this.scenePasse, this.cameraPasse);
  }
}
