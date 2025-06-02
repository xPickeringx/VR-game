import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// Variables principales
let camera, scene, renderer;
let weapon;
let targets = [];
let score = 0;
let shotsFired = 0;
let clock = new THREE.Clock();


let listener, shootSound, hitSound;

const raycaster = new THREE.Raycaster();

const floorTexture = new THREE.TextureLoader().load('./assets/floor.jpg');
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(10, 10);

const wallTexture = new THREE.TextureLoader().load('./assets/wall2.jpg');
wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(1, 1);

const ceilingTexture = new THREE.TextureLoader().load('./assets/ceiling.jpg');
ceilingTexture.wrapS = ceilingTexture.wrapT = THREE.RepeatWrapping;
ceilingTexture.repeat.set(10, 10);

const originalSize = 1;

let gameTimer = 60;
let gameInterval;
let gameEnded = false;

let controller1, controllerGrip1;
let controller2, controllerGrip2;


init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xD3D3D3);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);
  scene.add(camera);

  // Audio
  listener = new THREE.AudioListener();
  camera.add(listener);

  shootSound = new THREE.Audio(listener);
  new THREE.AudioLoader().load('./assets/disparo.mp3', buffer => {
    shootSound.setBuffer(buffer);
    shootSound.setVolume(0.5);
  });

  hitSound = new THREE.Audio(listener);
  new THREE.AudioLoader().load('./assets/punto.mp3', buffer => {
    hitSound.setBuffer(buffer);
    hitSound.setVolume(0.5);
  });

  // Renderer con XR activado
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Botón para entrar en VR
  document.body.appendChild(THREE.WEBGL.isWebGLAvailable() ? 
    VRButton.createButton(renderer) : VRButton.createXRNotFoundButton());

  // Crear entorno
  createEnvironment();

  // Crear objetivos
  createTargets();

  // Crear arma (simple cubo)
  createWeapon();

  // Controlador VR 1
controller1 = renderer.xr.getController(0);
controller1.addEventListener('selectstart', onShoot);
scene.add(controller1);

// Modelo para controlador 1
const controllerModelFactory = new XRControllerModelFactory();
controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
scene.add(controllerGrip1);

// Controlador VR 2
controller2 = renderer.xr.getController(1);
controller2.addEventListener('selectstart', onShoot);
scene.add(controller2);

// Modelo para controlador 2
controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
scene.add(controllerGrip2);


  window.addEventListener('resize', onWindowResize);

  startGameTimer();
}

function createEnvironment() {
  // Suelo
  const floorGeometry = new THREE.PlaneGeometry(100, 100);
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Paredes
  const wallGeometry = new THREE.BoxGeometry(100, 20, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
  const walls = [
    [0, 10, -50], [0, 10, 50], [-50, 10, 0], [50, 10, 0]
  ];
  walls.forEach((pos, i) => {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(...pos);
    if (i >= 2) wall.rotation.y = Math.PI / 2;
    wall.receiveShadow = true;
    scene.add(wall);
  });

  // Techo
  const ceilingGeometry = new THREE.PlaneGeometry(100, 100);
  const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture });
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 20;
  ceiling.receiveShadow = true;
  scene.add(ceiling);

  // Iluminación
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(0, 50, 0);
  sunLight.castShadow = true;
  scene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);
}

function createTargets() {
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });

  for (let i = 0; i < 5; i++) {
    const target = new THREE.Mesh(geometry, material.clone());
    target.position.set(
      Math.random() * 20 - 10,
      Math.random() * 5 + 1,
      -Math.random() * 20 - 10
    );
    target.userData.hit = false;
    target.castShadow = true;
    target.receiveShadow = true;
    target.scale.set(originalSize, originalSize, originalSize);

    // Movimiento en eje X
    target.userData.velocity = 0.05 + Math.random() * 0.05;
    if (Math.random() < 0.5) target.userData.velocity *= -1;

    scene.add(target);
    targets.push(target);
    resetTargetTimer(target);
  }
}

function resetTargetTimer(target) {
  if (target.userData.timeout) clearTimeout(target.userData.timeout);
  if (target.userData.scaleInterval) clearInterval(target.userData.scaleInterval);

  target.userData.timeout = setTimeout(() => relocateTarget(target), 6000);
  resetTargetSize(target);
}

function resetTargetSize(target) {
  target.scale.set(originalSize, originalSize, originalSize);
  if (target.userData.scaleInterval) clearInterval(target.userData.scaleInterval);

  target.userData.scaleInterval = setInterval(() => {
    let currentScale = target.scale.x;
    if (currentScale > originalSize * 0.30) {
      let newScale = currentScale * 0.98;
      target.scale.set(newScale, newScale, newScale);
    } else {
      clearInterval(target.userData.scaleInterval);
    }
  }, 200);
}

function relocateTarget(target) {
  target.position.set(
    Math.random() * 20 - 10,
    Math.random() * 5 + 1,
    -Math.random() * 20 - 10
  );
  target.material.color.set(0xff0000);
  target.userData.hit = false;
  resetTargetTimer(target);
}

function createWeapon() {
  // Cubo simple como arma
  const geometry = new THREE.BoxGeometry(0.3, 0.15, 0.6);
  const material = new THREE.MeshStandardMaterial({ color: 0x222222 });
  weapon = new THREE.Mesh(geometry, material);

  // Posición delante de la cámara (jugador)
  weapon.position.set(0.3, -0.2, -0.5);
  camera.add(weapon);
}

function onShoot(event) {
  if (gameEnded) return;

  shotsFired++;

  if (shootSound && shootSound.isPlaying) shootSound.stop();
  shootSound.play();

  // Obtener el controlador que disparó
  const controller = event.target;

  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);

  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3(0, 0, -1);
  rayOrigin.setFromMatrixPosition(controller.matrixWorld);
  rayDirection.applyMatrix4(tempMatrix);

  raycaster.set(rayOrigin, rayDirection);

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
  updateHUD();
}


function animateWeapon() {
  if (!weapon) return;

  // Retroceso simple del arma
  const originalZ = -0.5;
  const recoilZ = -0.7;
  const duration = 100;

  weapon.position.z = recoilZ;

  setTimeout(() => {
    const steps = 5;
    let step = 0;
    const interval = setInterval(() => {
      weapon.position.z += (originalZ - weapon.position.z) / (steps - step);
      step++;
      if (step >= steps) {
        weapon.position.z = originalZ;
        clearInterval(interval);
      }
    }, 10);
  }, duration);
}

function updateHUD() {
  document.getElementById("score").textContent = `Aciertos: ${score}`;
  const accuracy = shotsFired > 0 ? ((score / shotsFired) * 100).toFixed(1) : 0;
  document.getElementById("accuracy").textContent = `Precisión: ${accuracy}%`;
}

function startGameTimer() {
  document.getElementById("timer").textContent = `Tiempo: ${gameTimer}`;
  gameInterval = setInterval(() => {
    gameTimer--;
    document.getElementById("timer").textContent = `Tiempo: ${gameTimer}`;
    if (gameTimer <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  clearInterval(gameInterval);
  gameEnded = true;

  const accuracy = shotsFired > 0 ? ((score / shotsFired) * 100).toFixed(1) : 0;

  document.getElementById("endScreen").style.display = "block";
  document.getElementById("finalScore").textContent = `Puntaje final: ${score}`;
  document.getElementById("finalAccuracy").textContent = `Precisión final: ${accuracy}%`;
  guardarEnLeaderboard(score, accuracy);

  // Añadir opciones para reiniciar o volver al menú si quieres...
}

function guardarEnLeaderboard(puntaje, precision) {
  const leaderboard = JSON.parse(localStorage.getItem('leaderboard')) || [];
  leaderboard.push({ score: puntaje, accuracy: precision, date: new Date().toISOString() });
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > 10) leaderboard.pop();
  localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  const delta = clock.getDelta();

  // Mover objetivos (oscilando en X)
  targets.forEach(target => {
    target.position.x += target.userData.velocity;
    if (target.position.x > 10 || target.position.x < -10) {
      target.userData.velocity = -target.userData.velocity;
    }
  });

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}
