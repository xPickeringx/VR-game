// Importa Three.js y los controles
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

let camera, scene, renderer;
let controller1;
let listener, shootSound, hitSound;
let weapon; // Variable global para el arma
let targets = [];
let score = 0;
let shotsFired = 0;
let clock = new THREE.Clock();
let gameTimer = 60;
let gameInterval;
let gameEnded = false;
let vrHUD;

const originalSize = 1; // Tamaño original de objetivos
const raycaster = new THREE.Raycaster();
const textureLoader = new THREE.TextureLoader();

const floorTexture = textureLoader.load('./assets/floor.jpg');
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(10, 10);

const wallTexture = textureLoader.load('./assets/wall2.jpg');
wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(1, 1);

const ceilingTexture = textureLoader.load('./assets/ceiling.jpg');
ceilingTexture.wrapS = ceilingTexture.wrapT = THREE.RepeatWrapping;
ceilingTexture.repeat.set(10, 10);
const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture });
const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture });

document.getElementById('start-button').addEventListener('click', () => {
  document.getElementById('main-menu').style.display = 'none';
  init();
  animate();
});

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xD3D3D3);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  listener = new THREE.AudioListener();
  camera.add(listener);

  shootSound = new THREE.Audio(listener);
  const shootAudioLoader = new THREE.AudioLoader();
  shootAudioLoader.load('./assets/disparo.mp3', buffer => {
    shootSound.setBuffer(buffer);
    shootSound.setVolume(0.5);
  });

  hitSound = new THREE.Audio(listener);
  const hitAudioLoader = new THREE.AudioLoader();
  hitAudioLoader.load('./assets/punto.mp3', buffer => {
    hitSound.setBuffer(buffer);
    hitSound.setVolume(0.5);
  });

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  scene.add(camera);

  createEnvironment();
  createTargets();
  createWeapon();
  createVRHUD();

  setupControllers();
  window.addEventListener('resize', onWindowResize);
  startGameTimer();
}
function createTargets() {
  const targetGeometry = new THREE.SphereGeometry(originalSize, 32, 32);
  const targetMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });

  for (let i = 0; i < 5; i++) {
    const target = new THREE.Mesh(targetGeometry, targetMaterial.clone());
    target.castShadow = true;

    // Posición inicial aleatoria
    target.position.set(
      Math.random() * 20 - 10,     // x: entre -10 y 10
      Math.random() * 2 + 1,       // y: entre 1 y 3 metros de altura
      -10 - Math.random() * 10     // z: entre -10 y -20 (en frente del jugador)
    );

    target.userData.velocity = (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.03);
    target.userData.hit = false;

    scene.add(target);
    targets.push(target);
  }
}
function createWeapon() {
  const weaponGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.3);
  const weaponMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
  weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
  weapon.castShadow = true;

  // Posiciona el arma frente al controlador
  weapon.position.set(0, -0.02, -0.15); // Ajusta si se ve mal en VR
  controller1.add(weapon);
}
function animateWeapon() {
  if (!weapon) return;

  const initialZ = -0.15;
  const recoilZ = -0.25;

  // Movimiento hacia atrás (recoil)
  weapon.position.z = recoilZ;

  // Regresa suavemente
  setTimeout(() => {
    weapon.position.z = initialZ;
  }, 100);
}

function setupControllers() {
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onShoot);
  scene.add(controller1);

  const controllerModelFactory = new XRControllerModelFactory();
  const grip1 = renderer.xr.getControllerGrip(0);
  grip1.add(controllerModelFactory.createControllerModel(grip1));
  scene.add(grip1);
}

function createVRHUD() {
  const hudGeometry = new THREE.PlaneGeometry(0.5, 0.2);
  const hudMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.5, transparent: true });
  vrHUD = new THREE.Mesh(hudGeometry, hudMaterial);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.font = '24px Arial';
  context.fillText('Aciertos: 0', 10, 30);
  context.fillText('Precisión: 0%', 10, 55);

  const hudTexture = new THREE.CanvasTexture(canvas);
  vrHUD.material.map = hudTexture;
  vrHUD.material.needsUpdate = true;
  vrHUD.position.set(0, -0.3, -1);
  camera.add(vrHUD);
  vrHUD.userData.canvas = canvas;
  vrHUD.userData.context = context;
  vrHUD.userData.texture = hudTexture;
}

function updateVRHUD() {
  const ctx = vrHUD.userData.context;
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'white';
  ctx.font = '24px Arial';
  ctx.fillText(`Aciertos: ${score}`, 10, 30);
  const accuracy = shotsFired > 0 ? ((score / shotsFired) * 100).toFixed(1) : 0;
  ctx.fillText(`Precisión: ${accuracy}%`, 10, 55);
  vrHUD.userData.texture.needsUpdate = true;
}

// El resto del código (createEnvironment, createTargets, resetTargetTimer, etc.) se mantiene igual

function onShoot() {
  if (gameEnded) return;
  shotsFired++;

  if (shootSound && shootSound.isPlaying) shootSound.stop();
  shootSound.play();

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(targets);

  if (intersects.length > 0) {
    const target = intersects[0].object;
    if (!target.userData.hit) {
      target.userData.hit = true;
      score++;

      if (hitSound && hitSound.isPlaying) hitSound.stop();
      hitSound.play();

      target.material.color.set(0x00ff00);
      clearTimeout(target.userData.timeout);
      clearInterval(target.userData.scaleInterval);
      setTimeout(() => relocateTarget(target), 300);
    }
  }

  animateWeapon();
  updateVRHUD();
}

function animate() {
  renderer.setAnimationLoop(() => {
    targets.forEach(target => {
      target.position.x += target.userData.velocity;
      const xLimit = 20;
      if (target.position.x > xLimit || target.position.x < -xLimit) {
        target.userData.velocity *= -1;
      }
    });

    renderer.render(scene, camera);
  });
}
