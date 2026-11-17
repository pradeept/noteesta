import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type SceneResult = {
  cameraPosition?: [number, number, number];
  labels?: Array<{ text: string; position: [number, number, number] }>;
};
type SceneBuilder = (three: typeof THREE, scene: THREE.Scene) => SceneResult | void;

declare global {
  interface Window {
    NoteestaThreeRuntime: { start: (buildArtifact: SceneBuilder) => void };
  }
}

window.NoteestaThreeRuntime = {
  start(buildArtifact) {
    const host = document.getElementById('scene');
    if (!host) throw new Error('3D viewport is missing');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f5f3ed');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3);
    keyLight.position.set(4, 6, 8);
    scene.add(keyLight);

    const result = buildArtifact(THREE, scene);
    const startPosition = result?.cameraPosition ?? [0, 1, 8];
    camera.position.set(...startPosition);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.minDistance = 2;
    controls.maxDistance = 30;
    controls.update();

    const labels = (result?.labels ?? []).slice(0, 12).map(({ text, position }) => {
      const element = document.createElement('span');
      element.className = 'scene-label';
      element.textContent = text.slice(0, 50);
      host.appendChild(element);
      return { element, point: new THREE.Vector3(...position) };
    });
    const initialPosition = camera.position.clone();
    const initialTarget = controls.target.clone();

    function resize() {
      if (!host) return;
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    function render() {
      frame = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
      for (const { element, point } of labels) {
        const projected = point.clone().project(camera);
        element.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
        element.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
        element.hidden = projected.z < -1 || projected.z > 1;
      }
    }
    render();

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.type !== 'noteesta-3d-control') return;
      if (event.data.action === 'reset') {
        camera.position.copy(initialPosition);
        controls.target.copy(initialTarget);
      } else if (event.data.action === 'zoom-in') {
        camera.position.lerp(controls.target, 0.18);
      } else if (event.data.action === 'zoom-out') {
        camera.position.sub(controls.target).multiplyScalar(1.2).add(controls.target);
      }
      controls.update();
    }
    window.addEventListener('message', onMessage);
    window.addEventListener(
      'pagehide',
      () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        window.removeEventListener('message', onMessage);
        controls.dispose();
        renderer.dispose();
      },
      { once: true },
    );
    window.parent.postMessage({ type: 'noteesta-3d', status: 'ready' }, '*');
  },
};
