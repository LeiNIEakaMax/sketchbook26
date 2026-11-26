// The 3D box: a three.js BoxGeometry with one flattened panel per face.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const SIZE = 2048;
// BoxGeometry material order: +x, -x, +y, -y, +z, -z
const ORDER = ['right', 'left', 'top', 'bottom', 'front', 'back'];

export function createBoxView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a1a1a');

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 8;
  controls.autoRotateSpeed = 1.6;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 4, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -2; sun.shadow.camera.right = 2;
  sun.shadow.camera.top = 2; sun.shadow.camera.bottom = -2;
  sun.shadow.radius = 6;
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const blank = () => new THREE.MeshStandardMaterial({ color: '#2c2c2c', roughness: 0.9 });
  const materials = ORDER.map(blank);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials);
  mesh.castShadow = true;
  scene.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: '#555555' })
  );
  mesh.add(edges);

  let dims = { w: 1, h: 1, d: 1 };

  function setDims(w, h, d) {
    // normalise so the longest side is 1 unit
    const m = Math.max(w, h, d);
    dims = { w: w / m, h: h / m, d: d / m };
    mesh.scale.set(dims.w, dims.h, dims.d);
    mesh.position.y = dims.h / 2;
    floor.position.y = 0;
    controls.target.set(0, dims.h / 2, 0);
  }

  function setFace(name, canvasOrNull) {
    const i = ORDER.indexOf(name);
    const old = materials[i];
    if (old.map) old.map.dispose();
    old.dispose();
    if (!canvasOrNull) {
      materials[i] = blank();
    } else {
      const tex = new THREE.CanvasTexture(canvasOrNull);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      materials[i] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
    }
    mesh.material = materials;
  }

  function resetView() {
    const r = 2.6;
    camera.position.set(r * 0.62, dims.h / 2 + r * 0.42, r * 0.66);
    controls.target.set(0, dims.h / 2, 0);
    controls.update();
  }

  let running = false;
  function loop() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  setDims(1, 1, 1);
  resetView();

  return {
    setDims,
    setFace,
    resetView,
    setSpin(on) { controls.autoRotate = on; },
    start() { if (!running) { running = true; loop(); } },
    stop() { running = false; },
    render() { controls.update(); renderer.render(scene, camera); },
    // A square picture from the default angle, for the shelf.
    snapshot(size = 480) {
      const pos = camera.position.clone(), tgt = controls.target.clone();
      resetView();
      renderer.render(scene, camera);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(renderer.domElement, 0, 0, size, size);
      camera.position.copy(pos);
      controls.target.copy(tgt);
      controls.update();
      renderer.render(scene, camera);
      return c;
    },
  };
}
