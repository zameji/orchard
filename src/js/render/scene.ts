import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEG, UP, V, clamp, $ } from '../util.js';
import { sunDir } from '../sim/light.js';
import type { Model } from '../sim/types.js';

/** Render stage: renderer, camera, controls, sky, sun rig, ground. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, 0.035, 210);
  readonly controls: OrbitControls;
  readonly treeGroup = new THREE.Group();
  readonly markers = new THREE.Group();
  readonly billboards: THREE.Object3D[] = [];
  readonly contact: THREE.Mesh;
  private readonly sky: THREE.Mesh;
  private readonly skySun: THREE.Mesh;
  private readonly sunlight = new THREE.DirectionalLight(0xffe3b2, 2.25);
  private readonly rig = new THREE.Group();
  private readonly arc: THREE.Line;
  private readonly rayGeo: THREE.BufferGeometry;
  private readonly ray: THREE.Line;
  private readonly probe: THREE.Mesh;
  private raf = 0;

  constructor() {
    const canvas = $('view') as HTMLCanvasElement;
    try {
      this.renderer = new THREE.WebGLRenderer({
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
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera.position.set(3.4, 2.15, 4.8);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, {
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
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    const hemi = new THREE.HemisphereLight(0xe8f1ff, 0xa4ab82, 1.85);
    this.scene.add(hemi, this.sunlight, this.sunlight.target);

    this.sky = new THREE.Mesh(
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
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0xffed99,
      toneMapped: false,
    });
    this.skySun = new THREE.Mesh(
      new THREE.SphereGeometry(1.32, 18, 12),
      orbMat,
    );
    this.scene.add(this.skySun);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(85, 80),
      new THREE.MeshLambertMaterial({ color: 0xb7c4a6 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.024;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(32, 64, 0x7c9277, 0x8a9b81);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.23;
    grid.position.y = -0.021;
    this.scene.add(grid);
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 v;void main(){float a=1.-smoothstep(.04,.5,length(v-.5));gl_FragColor=vec4(.18,.23,.14,a*.19);}`,
      }),
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = -0.017;
    this.scene.add(this.contact);
    this.scene.add(this.rig);
    const arcPts = Array.from({ length: 49 }, (_, i) => sunDir(6 + i / 4));
    this.arc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPts),
      new THREE.LineBasicMaterial({
        color: 0xffe59a,
        transparent: true,
        opacity: 0.76,
      }),
    );
    this.rayGeo = new THREE.BufferGeometry().setFromPoints([V(), V()]);
    this.ray = new THREE.Line(
      this.rayGeo,
      new THREE.LineDashedMaterial({
        color: 0xffe79f,
        dashSize: 0.09,
        gapSize: 0.055,
      }),
    );
    this.probe = new THREE.Mesh(new THREE.SphereGeometry(0.037, 14, 8), orbMat);
    this.rig.add(this.arc, this.ray, this.probe);
    this.scene.add(this.treeGroup, this.markers);
    this.controls.addEventListener('change', () => this.invalidate());
    new ResizeObserver(() => this.viewport()).observe($('dock'));
    window.addEventListener('resize', () => this.viewport());
  }

  invalidate() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame() {
    this.raf = 0;
    this.controls.update();
    for (const o of this.billboards) o.quaternion.copy(this.camera.quaternion);
    this.renderer.render(this.scene, this.camera);
  }

  viewport() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || 1,
      h = canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const dockTop =
      $('dock').getBoundingClientRect().top -
      canvas.getBoundingClientRect().top;
    const top = Math.min(
      h * 0.22,
      $('hud').getBoundingClientRect().bottom -
        canvas.getBoundingClientRect().top +
        7,
    );
    const center = (top + Math.max(dockTop - 4, top + 0.14 * h)) * 0.5;
    this.camera.setViewOffset(w, h, 0, h / 2 - center, w, h);
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  fitTree(m: Model) {
    this.viewport();
    const box = new THREE.Box3();
    for (const q of m.list) {
      box.expandByPoint(q.a);
      box.expandByPoint(q.b);
    }
    box.expandByScalar(0.09);
    const center = box.getCenter(V()),
      back = this.camera.position.clone().sub(this.controls.target).normalize();
    if (back.lengthSq() < 0.1) back.set(0.5, 0.16, 0.9).normalize();
    const right = V().crossVectors(UP, back).normalize(),
      up = V().crossVectors(back, right).normalize();
    const canvas = this.renderer.domElement;
    const h = canvas.clientHeight || 1;
    const available = clamp(
      ($('dock').getBoundingClientRect().top -
        $('hud').getBoundingClientRect().bottom -
        12) /
        h,
      0.23,
      0.9,
    );
    const tan = Math.tan((this.camera.fov * DEG) / 2);
    let d = 1;
    for (const q of m.list)
      for (const p of [q.a, q.b]) {
        const v = V().subVectors(p, center);
        d = Math.max(
          d,
          v.dot(back) +
            Math.max(
              (Math.abs(v.dot(right)) + 0.12) /
                (tan * this.camera.aspect * 0.9),
              (Math.abs(v.dot(up)) + 0.12) / (tan * available),
            ),
        );
      }
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(back, d * 1.06);
    this.controls.update();
    this.invalidate();
  }

  updateSun(hour: number, guideSun: boolean, m: Model | null) {
    const s = sunDir(hour);
    (this.sky.material as THREE.ShaderMaterial).uniforms.sun.value.copy(s);
    this.skySun.position.copy(s).multiplyScalar(88);
    this.sunlight.position.copy(s).multiplyScalar(12);
    this.sunlight.intensity = 1.35 + s.y * 1.25;
    this.sunlight.color.setHSL(0.075 + 0.038 * s.y, 0.58 - 0.31 * s.y, 0.81);
    const r = Math.max(1.2, (m?.height || 2.5) * 1.14, (m?.spread || 1) * 0.6);
    this.rig.visible = guideSun;
    this.arc.scale.setScalar(r);
    this.probe.position.copy(s).multiplyScalar(r);
    this.probe.scale.setScalar(Math.max(1, r * 0.32));
    const rp = this.rayGeo.attributes.position as THREE.BufferAttribute;
    const [px, py, pz] = this.probe.position.toArray();
    rp.setXYZ(0, px, py, pz);
    rp.setXYZ(1, 0, 0.04, 0);
    rp.needsUpdate = true;
    this.rayGeo.computeBoundingSphere();
    this.ray.computeLineDistances();
    const mins = Math.round(hour * 60);
    $('clock').value =
      String(Math.floor(mins / 60)).padStart(2, '0') +
      ':' +
      String(mins % 60).padStart(2, '0');
    this.invalidate();
  }
}

export const stage = new Stage();
