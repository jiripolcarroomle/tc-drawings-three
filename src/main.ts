import './style.css'
import * as flatted from 'flatted'
import * as THREE from 'three'
import { createScene, sceneToThreeJsScene } from './createThreeScene'

import orderJsonRaw from '../assets/simpleorder.flatted.json?raw'

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

// From here on, treat #app as definitely present.
// TypeScript doesn't reliably keep the non-null narrowing inside nested
// functions, so we capture the narrowed value in a new constant.
const appEl = app

// The renderer is the bridge between your Scene+Camera and the GPU.
// It owns a canvas element (renderer.domElement) where pixels are drawn.
//
// antialias: smoother edges; slightly more GPU work.
const renderer = new THREE.WebGLRenderer({ antialias: true })

// Ensure crisp rendering on high-DPI displays, but cap it to avoid excessive
// GPU load on very dense screens.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

// Mount the renderer's canvas into the page.
appEl.appendChild(renderer.domElement)

// The scene is a container graph holding everything to be rendered:
// meshes, lights, groups, helpers, etc.
const scene = sceneToThreeJsScene(orderScene);
// A perspective camera approximates how the human eye sees the world.
// Parameters: fov (degrees), aspect (width/height), near, far.
//
// Note: we set aspect=1 initially; we’ll compute the real value in resize().
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)

// Move the camera back a bit so the origin is visible.
camera.position.set(0, 0, 3)

// Adding the camera to the scene is optional for rendering (render() takes
// a direct camera reference), but becomes useful if you want to parent the
// camera under other objects, use helpers, or traverse the graph.
scene.add(camera)

// ---- A minimal visible object: a rotating cube ----
// A Mesh is Geometry (shape) + Material (how it looks).
const geometry = new THREE.BoxGeometry(1, 1, 1)

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

  // Draw the current scene from the camera's point of view.
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

// Kick off the loop.
//animate()


renderer.render(scene, camera)
