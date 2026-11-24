// Time-of-day driver (D-011). Materials never change; only light, sky, fog and exposure do.
import * as THREE from 'three';
import palette from '../data/palette.json';

type Preset = {
  sunElevationDeg: number; sunAzimuthDeg: number; sunColor: string; sunIntensity: number;
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  sky: string; fog: string; fogDensity: number; exposure: number;
};

const P = palette.lighting as Record<string, Preset>;

// authored keyframes around the cycle (0 = midnight)
const KEYS: Array<{ t: number; p: Preset }> = [
  { t: 0.00, p: P.night },
  { t: 0.22, p: P.dawn },
  { t: 0.50, p: P.noon },
  { t: 0.78, p: P.dusk },
  { t: 1.00, p: P.night },
];

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixHex = (a: string, b: string, k: number, out: THREE.Color) =>
  out.copy(new THREE.Color(a)).lerp(new THREE.Color(b), k);

/**
 * Half-width (m) of the sun's orthographic shadow box. M008 cut it from 180 m
 * to 100 m: the box now follows the view (setShadowView), so it covers the
 * ground on screen instead of a square that mostly lay behind the camera,
 * and every caster outside it skips the shadow pass. Texels shrink from
 * 0.18 m to 0.10 m on the 2048 map.
 */
export const SHADOW_HALF_EXTENT = 100;
/** How far (m) the shadow box centre sits ahead of the view target. */
export const SHADOW_LEAD = 40;

const _snapped = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Shadow box centre for a view: target + SHADOW_LEAD along the horizontal view direction. */
export function shadowCentre(target: THREE.Vector3, camera: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const dx = target.x - camera.x, dz = target.z - camera.z, len = Math.hypot(dx, dz);
  out.copy(target);
  if (len > 1e-6) { out.x += (dx / len) * SHADOW_LEAD; out.z += (dz / len) * SHADOW_LEAD; }
  return out;
}

/**
 * Snap a shadow centre to whole shadow-map texels in the light's view plane,
 * so panning the camera does not make shadow edges crawl. `dir` points from
 * the centre toward the sun.
 */
export function snapShadowCentre(centre: THREE.Vector3, dir: THREE.Vector3, texel: number, out = new THREE.Vector3()): THREE.Vector3 {
  _z.copy(dir).normalize();
  _x.crossVectors(UP, _z);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); else _x.normalize();
  _y.crossVectors(_z, _x);
  const a = centre.dot(_x), b = centre.dot(_y);
  out.copy(centre)
    .addScaledVector(_x, Math.round(a / texel) * texel - a)
    .addScaledVector(_y, Math.round(b / texel) * texel - b);
  return out;
}

export class Sky {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private focus = new THREE.Vector3();
  private shadowFocus = new THREE.Vector3();
  private hasShadowView = false;
  private dome: THREE.Mesh;
  private domeGeo: THREE.SphereGeometry;
  private domeBottom = new THREE.Color('#DCEFF8');
  private domeTop = new THREE.Color('#7CBEE6');
  private sunDisc: THREE.Mesh;
  private sunDiscMat: THREE.MeshBasicMaterial;
  /** Palette fog density is authored for the old diorama; scale it for 2 km. */
  fogScale = 0.55;
  /** Lift the ambient fill so 1 m voxel risers do not read as holes. */
  hemiScale = 1.25;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.sun = new THREE.DirectionalLight('#FFF4DC', 2.75);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    const r = SHADOW_HALF_EXTENT;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 1; cam.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.045;

    this.hemi = new THREE.HemisphereLight('#BFD9F2', '#7A8F55', 0.55);
    this.fog = new THREE.FogExp2('#DCEFF8', 0.0028);

    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(this.hemi);
    scene.fog = this.fog;
    scene.background = new THREE.Color('#9ED2EE');

    // Gradient sky dome. A flat scene.background read as a studio backdrop;
    // the dome gives the horizon and zenith different values at every time of
    // day and lets the sun disc sit in the world rather than on the UI layer.
    this.domeGeo = new THREE.SphereGeometry(8000, 32, 16);
    const count = this.domeGeo.attributes.position.count;
    this.domeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.dome = new THREE.Mesh(
      this.domeGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true, side: THREE.BackSide, fog: false,
        toneMapped: false, depthWrite: false,
      })
    );
    this.dome.renderOrder = -10;
    this.dome.name = 'sky_dome';
    scene.add(this.dome);

    this.sunDiscMat = new THREE.MeshBasicMaterial({
      color: '#FFF4DC', fog: false, transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(120, 28), this.sunDiscMat);
    this.sunDisc.name = 'sun_disc';
    this.sunDisc.renderOrder = -9;
    scene.add(this.sunDisc);
    this.paintDome();
  }

  setFocus(v: THREE.Vector3) { this.focus.copy(v); }

  /**
   * Centre the sun shadow box on what the camera looks at: the view target
   * pushed SHADOW_LEAD metres along the horizontal view direction (the
   * visible ground lies mostly beyond the target). Without a call the box
   * follows the focus.
   */
  setShadowView(target: THREE.Vector3, camera: THREE.Vector3) {
    shadowCentre(target, camera, this.shadowFocus);
    this.hasShadowView = true;
  }

  private paintDome() {
    const pos = this.domeGeo.attributes.position;
    const col = this.domeGeo.attributes.color as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, pos.getY(i) / 8000));
      const k = Math.pow(t, 0.62);
      arr[i * 3] = this.domeBottom.r + (this.domeTop.r - this.domeBottom.r) * k;
      arr[i * 3 + 1] = this.domeBottom.g + (this.domeTop.g - this.domeBottom.g) * k;
      arr[i * 3 + 2] = this.domeBottom.b + (this.domeTop.b - this.domeBottom.b) * k;
    }
    col.needsUpdate = true;
  }

  update(t: number) {
    let i = 0;
    while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
    const A = KEYS[i].p, B = KEYS[i + 1].p;
    const span = KEYS[i + 1].t - KEYS[i].t;
    const k = span <= 0 ? 0 : Math.min(1, Math.max(0, (t - KEYS[i].t) / span));

    const elev = THREE.MathUtils.degToRad(mix(A.sunElevationDeg, B.sunElevationDeg, k));
    const az = THREE.MathUtils.degToRad(mix(A.sunAzimuthDeg, B.sunAzimuthDeg, k));
    const dir = new THREE.Vector3(
      Math.cos(elev) * Math.sin(az),
      Math.sin(elev),
      Math.cos(elev) * Math.cos(az)
    );

    const centre = snapShadowCentre(this.hasShadowView ? this.shadowFocus : this.focus, dir,
      (2 * SHADOW_HALF_EXTENT) / this.sun.shadow.mapSize.x, _snapped);
    this.sun.position.copy(centre).addScaledVector(dir, 450);
    this.sun.target.position.copy(centre);
    mixHex(A.sunColor, B.sunColor, k, this.sun.color);
    this.sun.intensity = mix(A.sunIntensity, B.sunIntensity, k);

    mixHex(A.hemiSky, B.hemiSky, k, this.hemi.color);
    mixHex(A.hemiGround, B.hemiGround, k, this.hemi.groundColor);
    this.hemi.intensity = mix(A.hemiIntensity, B.hemiIntensity, k) * this.hemiScale;

    const bg = this.scene.background as THREE.Color;
    mixHex(A.sky, B.sky, k, bg);
    mixHex(A.fog, B.fog, k, this.fog.color);
    this.fog.density = mix(A.fogDensity, B.fogDensity, k) * this.fogScale;
    this.renderer.toneMappingExposure = mix(A.exposure, B.exposure, k);

    this.domeBottom.copy(this.fog.color).lerp(new THREE.Color('#F7FBFF'), 0.12);
    this.domeTop.copy(bg).lerp(new THREE.Color('#3E8BC6'), 0.28);
    this.paintDome();

    this.sunDiscMat.color.copy(this.sun.color);
    this.sunDiscMat.opacity = 0.82;
    this.sunDisc.position.copy(this.focus).addScaledVector(dir, 4500);
    this.sunDisc.lookAt(this.focus);
    this.sunDisc.visible = Math.sin(elev) > 0.015;
    // keep the disc a stable angular size
    const scale = 1.0;
    this.sunDisc.scale.setScalar(scale);
  }
}

export function timeLabel(t: number): string {
  const totalMin = Math.floor(t * 24 * 60);
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
