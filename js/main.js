// main.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

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

let hudMesh;
let gameOverMesh;
let gameOverGroup;
let restartButtonMesh;
let endedByTimer = false;
let menuButtonMesh = null;


window.startGame = () => {
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('endScreen').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  score = 0;
  shotsFired = 0;
  gameTimer = 60;
  gameEnded = false;
  endedByTimer = false; // Reiniciar flag
  targets = [];
  init();
  animate();
};

document.getElementById('restartButton').addEventListener('click', () => {
  window.startGame();
});

document.getElementById('mainMenuButton').addEventListener('click', () => {
  document.getElementById('endScreen').style.display = 'none';
  document.getElementById('main-menu').style.display = 'block';
});

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xD3D3D3);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);
  scene.add(camera);

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

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  createEnvironment();
  createTargets();

  const controllerModelFactory = new XRControllerModelFactory();

controller1 = renderer.xr.getController(0);
controller1.addEventListener('selectstart', onShoot);

controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
const geometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, -1)
]);
const line = new THREE.Line(
  geometry,
  new THREE.LineBasicMaterial({ color: 0x00ffff })
);
line.name = 'pointer';
line.scale.z = 5;
controller1.add(line);
scene.add(controller1);

scene.add(controllerGrip1);

  createWeapon(controller1);
  createVRHUD();

  window.addEventListener('resize', onWindowResize);
  startGameTimer();
}

function createVRHUD() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = '30px Arial';
  ctx.fillText(`Aciertos: ${score}`, 20, 50);
  ctx.fillText(`Precisión: 0%`, 20, 100);
  ctx.fillText(`Tiempo: ${gameTimer}s`, 20, 150);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const geometry = new THREE.PlaneGeometry(1.5, 0.75);
  hudMesh = new THREE.Mesh(geometry, material);

  hudMesh.position.set(0, 1.6, -2);
  camera.add(hudMesh);
  hudMesh.lookAt(camera.position);
  hudMesh.renderOrder = 999;
  hudMesh.material.depthTest = false;

  hudMesh.userData.canvas = canvas;
  hudMesh.userData.context = ctx;
  hudMesh.userData.texture = texture;
}
function createVRGameOverScreen() {
  if (menuButtonMesh) {
  camera.remove(menuButtonMesh);
  menuButtonMesh.geometry.dispose();
  menuButtonMesh.material.dispose();
  menuButtonMesh = null;
}

  // Pantalla base
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

    // Crear el botón de menú en el canvas
  ctx.fillStyle = "#00AAFF";
  ctx.fillRect(100, 250, 200, 50);
  ctx.fillStyle = "#fff";
  ctx.font = "20px Arial";
  ctx.fillText("Volver al menú", 120, 280);

  // Crear textura y material
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });

  // Crear malla para el menú
  const geometry = new THREE.PlaneGeometry(1.5, 0.75);
  menuButtonMesh = new THREE.Mesh(geometry, material);
  menuButtonMesh.position.set(0, 1.6, -2);
  camera.add(menuButtonMesh);

  // Botón "Reiniciar"
  const restartGeometry = new THREE.PlaneGeometry(1.2, 0.3);
  const restartMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const restartText = new THREE.Mesh(restartGeometry, restartMaterial);
  restartText.position.set(0, -0.5, 0.01);
  restartText.name = 'restartButton';
  gameOverGroup.add(restartText);

  // Botón "Menú Principal"
  const menuGeometry = new THREE.PlaneGeometry(1.2, 0.3);
  const menuMaterial = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const menuText = new THREE.Mesh(menuGeometry, menuMaterial);
  menuText.position.set(0, -0.9, 0.01);
  menuText.name = 'menuButton';
  gameOverGroup.add(menuText);

  gameOverGroup.position.set(0, 1.6, -2);
  camera.add(gameOverGroup);
  gameOverGroup.lookAt(camera.position);
  gameOverGroup.renderOrder = 1000;

  // Guardar referencias
  restartButtonMesh = restartText;
  menuButtonMesh = menuText;
  texture.needsUpdate = true;

}



function updateVRHUD() {
  if (!hudMesh) return;
  const ctx = hudMesh.userData.context;
  const canvas = hudMesh.userData.canvas;
  const accuracy = shotsFired > 0 ? ((score / shotsFired) * 100).toFixed(1) : 0;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = '30px Arial';
  ctx.fillText(`Aciertos: ${score}`, 20, 50);
  ctx.fillText(`Precisión: ${accuracy}%`, 20, 100);
  ctx.fillText(`Tiempo: ${gameTimer}s`, 20, 150);

  hudMesh.userData.texture.needsUpdate = true;
}

function createWeapon(parent) {
  const loader = new GLTFLoader();
  loader.load('./assets/weapon.glb', gltf => {
    weapon = gltf.scene;
    weapon.scale.set(0.3, 0.3, 0.3);
    weapon.rotation.set(0, Math.PI, 0);
    weapon.position.set(0, -0.05, -0.25); // Ajusta según el modelo
    parent.add(weapon);
  }, undefined, error => {
    console.error('Error al cargar el arma:', error);
  });
}

function createEnvironment() {
  const floorGeometry = new THREE.PlaneGeometry(100, 100);
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

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

  const ceilingGeometry = new THREE.PlaneGeometry(100, 100);
  const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture });
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 20;
  ceiling.receiveShadow = true;
  scene.add(ceiling);

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

function onShoot(event) {
  if (shootSound && shootSound.isPlaying) shootSound.stop();
  shootSound.play();

  const controller = event.target;
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);

  const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3(0, 0, -1);

if (weapon) {
  weapon.updateWorldMatrix(true, false);
  rayOrigin.setFromMatrixPosition(weapon.matrixWorld);
  rayDirection.applyMatrix4(tempMatrix);
  const flash = new THREE.PointLight(0xffaa00, 1, 2);
flash.position.set(0, 0, -0.3);
weapon.add(flash);
setTimeout(() => weapon.remove(flash), 100);
} else {
  rayOrigin.setFromMatrixPosition(controller.matrixWorld);
  rayDirection.applyMatrix4(tempMatrix);
}


  raycaster.set(rayOrigin, rayDirection);

  if (gameEnded) {
  const interactiveButtons = [restartButtonMesh, menuButtonMesh].filter(Boolean);
  const intersects = raycaster.intersectObjects(interactiveButtons);
  if (intersects.length > 0) {
    const clicked = intersects[0].object;
    if (clicked.name === 'restartButton') {
      camera.remove(gameOverGroup);
      gameOverGroup = null;
      window.startGame();
    } else if (clicked.name === 'menuButton') {
      camera.remove(gameOverGroup);
      gameOverGroup = null;
      document.getElementById('main-menu').style.display = 'block';
    }
    return;
  }
  return;
}



  shotsFired++;

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

  const recoilZ = -0.35;
  const originalZ = -0.25;
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
  }, 50);
}


function updateHUD() {
  const accuracy = shotsFired > 0 ? ((score / shotsFired) * 100).toFixed(1) : 0;
  document.getElementById("score").textContent = `Aciertos: ${score}`;
  document.getElementById("accuracy").textContent = `Precisión: ${accuracy}%`;
  document.getElementById("timer").textContent = `Tiempo: ${gameTimer}s`;
}

function startGameTimer() {
  document.getElementById("timer").textContent = `Tiempo: ${gameTimer}`;
  gameInterval = setInterval(() => {
    gameTimer--;
    document.getElementById("timer").textContent = `Tiempo: ${gameTimer}`;
    if (gameTimer <= 0) {
      endedByTimer = true; // <-- Marcamos que terminó por tiempo
      endGame();
    }
  }, 1000);
}


function endGame() {
  clearInterval(gameInterval);
  gameEnded = true;

  const accuracy = shotsFired > 0 ? ((score / shotsFired) * 100).toFixed(1) : 0;
  guardarEnLeaderboard(score, accuracy);
  createVRGameOverScreen();

  // ✅ Asegurar que el render loop continúa después del fin del juego
  renderer.setAnimationLoop(() => {
    render();
    highlightVRButtons(); // Para interacción con menú final
    if (hudMesh) {
  camera.remove(hudMesh);
  hudMesh = null;
}

  });
}



function guardarEnLeaderboard(puntaje, precision) {
  const leaderboard = JSON.parse(localStorage.getItem('leaderboard')) || [];
  leaderboard.push({ score: puntaje, accuracy: precision, date: new Date().toISOString() });
  leaderboard.sort((a, b) => b.score - a.score);
  if (leaderboard.length > 10) leaderboard.pop();
  localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
}
function highlightVRButtons() {
  if (!menuButtonMesh) return;

  const intersection = raycaster.intersectObject(menuButtonMesh);
  if (intersection.length > 0) {
    menuButtonMesh.material.color.set(0xff0000); // Ejemplo: resaltar en rojo
  } else {
    menuButtonMesh.material.color.set(0xffffff); // Restaurar color
  }
}

function animate() {
  renderer.setAnimationLoop(() => {
    render();
    updateVRHUD();
    updateHUD();
    highlightVRButtons(); // <-- Añadido aquí
  });
}

function render() {
  const delta = clock.getDelta();

  targets.forEach(target => {
    target.position.x += target.userData.velocity;
    if (target.position.x > 10 || target.position.x < -10) {
      target.userData.velocity = -target.userData.velocity;
    }
    if (gameOverGroup && gameEnded) {
  gameOverGroup.lookAt(camera.getWorldPosition(new THREE.Vector3()));
}

  });

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
// Mostrar leaderboard
document.getElementById('leaderboard-button').addEventListener('click', () => {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '';
  const leaderboard = JSON.parse(localStorage.getItem('leaderboard')) || [];
  leaderboard.forEach(entry => {
    const li = document.createElement('li');
    const date = new Date(entry.date).toLocaleDateString();
    li.textContent = `🎯 ${entry.score} pts - ${entry.accuracy}% - ${date}`;
    list.appendChild(li);
  });
  document.getElementById('leaderboard-modal').style.display = 'block';
});
