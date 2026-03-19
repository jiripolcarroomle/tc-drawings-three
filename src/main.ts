import './style.css'
import * as flatted from 'flatted'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createScene } from './scene'
// import { printSceneHierarchy } from './helpers'

//import orderJsonRaw from '../assets/simpleorder.flatted.json?raw'
//
import orderJsonRaw from '../assets/biggerorder.flatted.json?raw'
import { sceneToThreeJsScene } from './three-facade'
//import orderJsonRaw from '../assets/10000141.flatted.json?raw'
//import orderJsonRaw from '../assets/10000187.flatted.json?raw'

// ---- Minimal Three.js app structure (Vite + TypeScript) ----
//
// Three.js rendering in a browser typically follows this workflow:
// 1) Create a renderer (WebGLRenderer) and attach its <canvas> to the DOM
// 2) Create a scene (Scene) as the root container for objects
// 3) Create a camera (PerspectiveCamera / OrthographicCamera)
// 4) Create objects (Geometry + Material -> Mesh) and add them to the scene
// 5) Handle resizing so the canvas + camera projection stay correct
// 6) Run an animation loop: update state each frame, then render(scene, camera)
// Grab the root element Vite creates in index.html and use it as our
// “viewport” container.
const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app element')
}

const orderJson = flatted.parse(orderJsonRaw)

const orderScene = createScene(orderJson.o, orderJson.ol);

// printSceneHierarchy(orderScene);

// From here on, treat #app as definitely present.
// TypeScript doesn't reliably keep the non-null narrowing inside nested
// functions, so we capture the narrowed value in a new constant.
const appEl = app

// The renderer is the bridge between your Scene+Camera and the GPU.
// It owns a canvas element (renderer.domElement) where pixels are drawn.
//
// antialias: smoother edges; slightly more GPU work.
const renderer = new THREE.WebGLRenderer({ antialias: true, })

// Ensure crisp rendering on high-DPI displays, but cap it to avoid excessive
// GPU load on very dense screens.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// Mount the renderer's canvas into the page.
appEl.appendChild(renderer.domElement)

const scene = new THREE.Scene();

// The scene is a container graph holding everything to be rendered:
// meshes, lights, groups, helpers, etc.
async function loadScene(targetObjectToAttachTheSceneWhenReady: THREE.Scene) {
  console.log('will convert scene to three.js scene');
  const scene = await sceneToThreeJsScene(orderScene, {
    material: {
      color: 0xcccccc,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    },
    wireframeMaterial: {
      color: 0x000000,
    },
    edgesGeometryThresholdAngle: 10,
  });
  console.log('converted scene to three.js scene');
  scene.children.forEach(child => {
    targetObjectToAttachTheSceneWhenReady.add(child);
  });
}

loadScene(scene);

// A perspective camera approximates how the human eye sees the world.
// Parameters: fov (degrees), aspect (width/height), near, far.
//
// Note: we set aspect=1 initially; we’ll compute the real value in resize().
const camera = new THREE.PerspectiveCamera(60, 1, 100, 8000)

// Move the camera back a bit so the origin is visible.
camera.position.set(4000, 800, -2500)
camera.position.set(0, 3000, 0)
camera.position.set(3500, 800, -3000)
camera.position.set(3500, 800, -2000)

// Adding the camera to the scene is optional for rendering (render() takes
// a direct camera reference), but becomes useful if you want to parent the
// camera under other objects, use helpers, or traverse the graph.
scene.add(camera)

// ---- Standard navigation (OrbitControls) + persistence ----
// Mouse:
// - LMB drag: orbit
// - RMB drag: pan
// - Wheel / MMB: zoom
// Keyboard:
// - Arrow keys: pan
//
// Persisted between reloads via localStorage.
const NAV_STORAGE_KEY = 'tc-drawings-three:navigation:v1'
type PersistedNavigationV1 = {
  v: 1
  camera: {
    position: [number, number, number]
    zoom: number
  }
  target: [number, number, number]
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function isVec3Tuple(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1]) &&
    isFiniteNumber(v[2])
  )
}

function tryLoadNavigation(): PersistedNavigationV1 | null {
  try {
    const raw = localStorage.getItem(NAV_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as any).v !== 1 ||
      !(parsed as any).camera ||
      !isVec3Tuple((parsed as any).camera.position) ||
      !isFiniteNumber((parsed as any).camera.zoom) ||
      !isVec3Tuple((parsed as any).target)
    ) {
      return null
    }
    return parsed as PersistedNavigationV1
  } catch {
    return null
  }
}

function saveNavigation(controls: OrbitControls) {
  const state: PersistedNavigationV1 = {
    v: 1,
    camera: {
      position: [camera.position.x, camera.position.y, camera.position.z],
      zoom: camera.zoom,
    },
    target: [controls.target.x, controls.target.y, controls.target.z],
  }
  try {
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

const controls = new OrbitControls(camera, renderer.domElement)
// Disable damping/inertia so motion stops immediately (no acceleration-like feel).
controls.enableDamping = false
controls.screenSpacePanning = true
controls.zoomSpeed = 0.9
controls.panSpeed = 0.8
controls.rotateSpeed = 0.6
controls.listenToKeyEvents(window)
// Use WASD for keyboard panning (OrbitControls uses these 4 directions).
controls.keys = {
  LEFT: 'KeyA',
  UP: 'KeyW',
  RIGHT: 'KeyD',
  BOTTOM: 'KeyS',
}

// Ensure right-click doesn't open the context menu when panning.
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

// Restore navigation if present; otherwise default to centering the scene.
{
  const persisted = tryLoadNavigation()
  if (persisted) {
    camera.position.set(...persisted.camera.position)
    camera.zoom = persisted.camera.zoom
    camera.updateProjectionMatrix()
    controls.target.set(...persisted.target)
    controls.update()
  } else {
    const box = new THREE.Box3().setFromObject(scene)
    if (Number.isFinite(box.min.x) && Number.isFinite(box.max.x) && !box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3())
      controls.target.copy(center)
      controls.update()
    }
  }
}

let saveTimer: number | undefined
function scheduleSave() {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => saveNavigation(controls), 200)
}

controls.addEventListener('end', scheduleSave)
controls.addEventListener('change', scheduleSave)
window.addEventListener('beforeunload', () => saveNavigation(controls))

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    controls.dispose()
    if (saveTimer !== undefined) window.clearTimeout(saveTimer)
  })
}

// ---- A minimal visible object: a rotating cube ----
// A Mesh is Geometry (shape) + Material (how it looks).
const geometry = new THREE.BoxGeometry(100, 100, 100)

// add a coordinate system grid
const xAxis = new THREE.BoxGeometry(5000, 10, 10)
xAxis.translate(2500, 0, 0)
const yAxis = new THREE.BoxGeometry(10, 5000, 10)
yAxis.translate(0, 2500, 0)
const zAxis = new THREE.BoxGeometry(10, 10, 5000)
zAxis.translate(0, 0, 2500)
scene.add(new THREE.Mesh(xAxis, new THREE.MeshBasicMaterial({ color: 0xff0000 })))
scene.add(new THREE.Mesh(yAxis, new THREE.MeshBasicMaterial({ color: 0x00ff00 })))
scene.add(new THREE.Mesh(zAxis, new THREE.MeshBasicMaterial({ color: 0x0000ff })))


// MeshNormalMaterial colors each fragment by its normal direction.
// It’s great for demos because it doesn't require any lights.
const material = new THREE.MeshNormalMaterial()

// Combine geometry + material into a renderable mesh.
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

// Keep renderer output size and camera projection in sync with the DOM.
//
// Why this matters:
// - If the canvas size doesn't match its display size, the image looks blurry
// - If camera.aspect isn't updated, the image looks stretched/squashed
function resize() {
  const width = appEl.clientWidth
  const height = appEl.clientHeight

  // Resize the drawing buffer to match the container.
  // The third parameter (updateStyle=false) means: don't touch CSS size,
  // only update the actual render buffer.
  renderer.setSize(width, height, false)

  // Update the camera projection to keep the correct aspect ratio.
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

// Resize now and on every window resize.
window.addEventListener('resize', resize)
resize()

// ---- Mouse-look controls (pointer lock) ----
// (Pointer-lock mouse-look removed in favor of OrbitControls.)

// A clock is a convenient way to get consistent frame deltas.
// Using delta time (dt) makes animation speed independent of frame rate.
const clock = new THREE.Clock()

// The render loop: update your world, then render it.
// requestAnimationFrame schedules the callback before the next repaint.
function animate() {
  const dt = clock.getDelta()

  // Rotate a bit each frame. Multiplying by dt makes it stable across
  // different refresh rates (60Hz, 144Hz, etc.).
  cube.rotation.x += dt * 0.7
  cube.rotation.y += dt * 1.1

  controls.update()

  // Draw the current scene from the camera's point of view.
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

// Kick off the loop.
animate()
