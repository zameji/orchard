import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEG, UP, V, clamp, $ } from '../util.js';
import { sunDir } from '../sim/light.js';
import type { Model } from '../sim/types.js';

const canvas = $('view') as HTMLCanvasElement;
export let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
} catch (e) {
  $('fail').hidden = false;
  $('fail').textContent =
    'The studio needs WebGL 2. Enable hardware acceleration or try a WebGL-capable browser.';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
export const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(43, 1, 0.035, 210);
camera.position.set(3.4, 2.15, 4.8);
export const controls = new OrbitControls(camera, canvas);
Object.assign(controls, {
  enableDamping: true,
  dampingFactor: 0.105,
  enableRotate: true,
  enableZoom: true,
  enablePan: true,
  screenSpacePanning: true,
  minDistance: 0.32,
  maxDistance: 65,
  maxPolarAngle: Math.PI * 0.512,
});
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
const hemi = new THREE.HemisphereLight(0xe8f1ff, 0xa4ab82, 1.85);
const sunlight = new THREE.DirectionalLight(0xffe3b2, 2.25);
scene.add(hemi, sunlight, sunlight.target);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(96, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { sun: { value: sunDir(12) } },
    vertexShader: `varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 p;uniform vec3 sun;
 void main(){vec3 d=normalize(p);float h=pow(max(d.y,0.),.52);
 vec3 rim=mix(vec3(1.,.65,.38),vec3(.85,.90,.78),sun.y);
 vec3 zen=mix(vec3(.30,.49,.62),vec3(.23,.52,.70),sun.y);
 float glow=pow(max(dot(d,sun),0.),140.);
 gl_FragColor=vec4(mix(rim,zen,h)+vec3(1.,.65,.22)*glow*.85,1.);
 #include <colorspace_fragment>
 }`,
  }),
);
sky.renderOrder = -10;
scene.add(sky);
const orbMat = new THREE.MeshBasicMaterial({
  color: 0xffed99,
  toneMapped: false,
});
const skySun = new THREE.Mesh(new THREE.SphereGeometry(1.32, 18, 12), orbMat);
scene.add(skySun);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(85, 80),
  new THREE.MeshLambertMaterial({ color: 0xb7c4a6 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.024;
scene.add(ground);
const grid = new THREE.GridHelper(32, 64, 0x7c9277, 0x8a9b81);
const gridMat = grid.material as THREE.Material;
gridMat.transparent = true;
gridMat.opacity = 0.23;
grid.position.y = -0.021;
scene.add(grid);
export const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 v;void main(){float a=1.-smoothstep(.04,.5,length(v-.5));gl_FragColor=vec4(.18,.23,.14,a*.19);}`,
  }),
);
contact.rotation.x = -Math.PI / 2;
contact.position.y = -0.017;
scene.add(contact);
const rig = new THREE.Group();
scene.add(rig);
const arcPts = Array.from({ length: 49 }, (_, i) => sunDir(6 + i / 4));
const arc = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(arcPts),
  new THREE.LineBasicMaterial({
    color: 0xffe59a,
    transparent: true,
    opacity: 0.76,
  }),
);
const rayGeo = new THREE.BufferGeometry().setFromPoints([V(), V()]);
const ray = new THREE.Line(
  rayGeo,
  new THREE.LineDashedMaterial({
    color: 0xffe79f,
    dashSize: 0.09,
    gapSize: 0.055,
  }),
);
const probe = new THREE.Mesh(new THREE.SphereGeometry(0.037, 14, 8), orbMat);
rig.add(arc, ray, probe);
export const treeGroup = new THREE.Group(),
  markers = new THREE.Group();
scene.add(treeGroup, markers);
export const billboards: THREE.Object3D[] = [];
let raf = 0;
export function invalidate() {
  if (!raf) raf = requestAnimationFrame(frame);
}
function frame() {
  raf = 0;
  controls.update();
  for (const o of billboards) o.quaternion.copy(camera.quaternion);
  renderer.render(scene, camera);
}
controls.addEventListener('change', invalidate);

export function viewport() {
  const w = canvas.clientWidth || 1,
    h = canvas.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const dockTop =
    $('dock').getBoundingClientRect().top - canvas.getBoundingClientRect().top;
  const top = Math.min(
    h * 0.22,
    $('hud').getBoundingClientRect().bottom -
      canvas.getBoundingClientRect().top +
      7,
  );
  const center = (top + Math.max(dockTop - 4, top + 0.14 * h)) * 0.5;
  camera.setViewOffset(w, h, 0, h / 2 - center, w, h);
  camera.updateProjectionMatrix();
  invalidate();
}
new ResizeObserver(viewport).observe($('dock'));
window.addEventListener('resize', viewport);

export function fitTree(m: Model) {
  viewport();
  const box = new THREE.Box3();
  for (const q of m.list) {
    box.expandByPoint(q.a);
    box.expandByPoint(q.b);
  }
  box.expandByScalar(0.09);
  const center = box.getCenter(V()),
    back = camera.position.clone().sub(controls.target).normalize();
  if (back.lengthSq() < 0.1) back.set(0.5, 0.16, 0.9).normalize();
  const right = V().crossVectors(UP, back).normalize(),
    up = V().crossVectors(back, right).normalize();
  const h = canvas.clientHeight || 1;
  const available = clamp(
    ($('dock').getBoundingClientRect().top -
      $('hud').getBoundingClientRect().bottom -
      12) /
      h,
    0.23,
    0.9,
  );
  const tan = Math.tan((camera.fov * DEG) / 2);
  let d = 1;
  for (const q of m.list)
    for (const p of [q.a, q.b]) {
      const v = V().subVectors(p, center);
      d = Math.max(
        d,
        v.dot(back) +
          Math.max(
            (Math.abs(v.dot(right)) + 0.12) / (tan * camera.aspect * 0.9),
            (Math.abs(v.dot(up)) + 0.12) / (tan * available),
          ),
      );
    }
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(back, d * 1.06);
  controls.update();
  invalidate();
}

export function updateSun(hour: number, guideSun: boolean, m: Model | null) {
  const s = sunDir(hour);
  (sky.material as THREE.ShaderMaterial).uniforms.sun.value.copy(s);
  skySun.position.copy(s).multiplyScalar(88);
  sunlight.position.copy(s).multiplyScalar(12);
  sunlight.intensity = 1.35 + s.y * 1.25;
  sunlight.color.setHSL(0.075 + 0.038 * s.y, 0.58 - 0.31 * s.y, 0.81);
  const r = Math.max(1.2, (m?.height || 2.5) * 1.14, (m?.spread || 1) * 0.6);
  rig.visible = guideSun;
  arc.scale.setScalar(r);
  probe.position.copy(s).multiplyScalar(r);
  probe.scale.setScalar(Math.max(1, r * 0.32));
  const rp = rayGeo.attributes.position as THREE.BufferAttribute;
  const [px, py, pz] = probe.position.toArray();
  rp.setXYZ(0, px, py, pz);
  rp.setXYZ(1, 0, 0.04, 0);
  rp.needsUpdate = true;
  rayGeo.computeBoundingSphere();
  ray.computeLineDistances();
  const mins = Math.round(hour * 60);
  $('clock').value =
    String(Math.floor(mins / 60)).padStart(2, '0') +
    ':' +
    String(mins % 60).padStart(2, '0');
  invalidate();
}
