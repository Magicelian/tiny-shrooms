import * as THREE from 'three';
import { listen } from '@tauri-apps/api/event';
import type { Bilan } from './sonde-worker';

const IMAGES_PAR_SECONDE = 30;

// --- Scène provisoire : un cube qui flotte sur fond transparent ---
const moteurRendu = new THREE.WebGLRenderer({ alpha: true, antialias: false });
moteurRendu.setPixelRatio(window.devicePixelRatio);
moteurRendu.setSize(window.innerWidth, window.innerHeight);
moteurRendu.setClearColor(0x000000, 0);
document.body.prepend(moteurRendu.domElement);

const scene = new THREE.Scene();
const ratio = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(-2 * ratio, 2 * ratio, 2, -2, 0.1, 100);
camera.position.set(5, 5, 5);
camera.lookAt(0, 0, 0);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 1.6, 1.6),
  new THREE.MeshToonMaterial({ color: 0x6fbf4a }),
);
scene.add(cube);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const soleil = new THREE.DirectionalLight(0xffffff, 1.6);
soleil.position.set(3, 6, 2);
scene.add(soleil);

let visible = true;
let derniereImage = 0;

function boucle(instant: number) {
  if (!visible) return;
  requestAnimationFrame(boucle);
  if (instant - derniereImage < 1000 / IMAGES_PAR_SECONDE) return;
  derniereImage = instant;
  cube.rotation.y = instant / 2000;
  cube.position.y = Math.sin(instant / 700) * 0.15;
  moteurRendu.render(scene, camera);
}
requestAnimationFrame(boucle);

// --- Sonde : le Worker compte ses ticks pendant que la fenêtre est cachée ---
const sonde = new Worker(new URL('./sonde-worker.ts', import.meta.url), { type: 'module' });
const affichage = document.querySelector<HTMLElement>('#sonde')!;

sonde.onmessage = ({ data }: MessageEvent<Bilan>) => {
  const taux = data.attendus === 0 ? 100 : Math.round((data.ticks / data.attendus) * 100);
  affichage.textContent =
    `cachée ${Math.round(data.dureeMs / 1000)} s · worker ${data.ticks}/${data.attendus} ` +
    `(${taux} %) · pire écart ${data.pireEcartMs} ms`;
};

await listen('fenetre-cachee', () => {
  visible = false;
  sonde.postMessage('marquer');
});

await listen('fenetre-affichee', () => {
  visible = true;
  requestAnimationFrame(boucle);
  sonde.postMessage('bilan');
});
