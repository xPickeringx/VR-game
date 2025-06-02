import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js'; // ✅ Importar VRButton

let camera, scene, renderer, controls;
let listener, shootSound, hitSound;
let weapon;
let targets = [];
let score = 0;
let shotsFired = 0;
let clock = new THREE.Clock();
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let speed = 5;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let isOnGround = false;
let isJumping = false;
let isCrouching = false;
let jumpHeight = 3;
let crouchHeight = 0.5;
let gameTimer = 60;
let gameInterval;
let gameEnded = false;

const originalSize = 1;
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
  // animate(); ⛔️ Se reemplaza por setAnimationLoop más abajo
});

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xD3D3D3);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);

  // Audio
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true; // ✅ Habilitar VR
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer)); // ✅ Botón para entrar en VR

  createWeapon();

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(0, 50, 0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 100;
  sunLight.shadow.camera.left = -50;
  sunLight.shadow.camera.right = 50;
  sunLight.shadow.camera.top = 50;
  sunLight.shadow.camera.bottom = -50;
  scene.add(sunLight);

  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  controls = new PointerLockControls(camera, document.body);
  document.body.addEventListener('click', () => {
    if (!gameEnded && !renderer.xr.isPresenting) {
      document.body.requestPointerLock();
    }
  });

  controls.addEventListener('lock', () => document.body.style.cursor = 'none');
  controls.addEventListener('unlock', () => document.body.style.cursor = 'auto');
  scene.add(controls.object);

  createEnvironment();
  createTargets();

  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);
  document.addEventListener('click', onShoot, false);
  window.addEventListener('resize', onWindowResize);
  startGameTimer();

  renderer.setAnimationLoop(animate); // ✅ Loop compatible con VR
}
function createEnvironment() {
  // Crear el suelo
  const floorGeometry = new THREE.PlaneGeometry(100, 100);
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture }); // Usando la textura cargada
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Crear paredes
  const wallGeometry = new THREE.BoxGeometry(100, 20, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture }); // Usando la textura cargada

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

  // Crear el techo
  const ceilingGeometry = new THREE.PlaneGeometry(100, 100);
  const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture }); // Usando la textura cargada
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 20; // Posicionar arriba
  ceiling.receiveShadow = true;
  scene.add(ceiling);
   // Crear las luces direccionales en cada esquina
   const cornerLights = [
    { position: [-50, 20, -50], color: 0xffffff },
    { position: [50, 20, -50], color: 0xffffff },
    { position: [-50, 20, 50], color: 0xffffff },
    { position: [50, 20, 50], color: 0xffffff }
  ];

  cornerLights.forEach((lightData) => {
    const light = new THREE.DirectionalLight(lightData.color, 1.0);
    light.position.set(...lightData.position);
    light.castShadow = true;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 50;
    light.shadow.camera.left = -50;
    light.shadow.camera.right = 50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    scene.add(light);
  });

  // Añadir una luz ambiental suave para iluminar el resto del entorno
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

    // Solo movimiento en eje X
    target.userData.velocity = 0.05 + Math.random() * 0.05; // 0.05 a 0.1
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
  }, 200); // Cada 100ms
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

function onShoot() {
  if (gameEnded) return;

  shotsFired++;

  // Reproducir sonido de disparo
  if (shootSound && shootSound.isPlaying) shootSound.stop();
  shootSound.play();

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(targets);

  if (intersects.length > 0) {
    const target = intersects[0].object;
    if (!target.userData.hit) {
      target.userData.hit = true;
      score++;

      // Reproducir sonido de impacto
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


function onKeyDown(event) {
  switch (event.key) {
    case 'w': moveForward = true; break;
    case 's': moveBackward = true; break;
    case 'd': moveLeft = true; break;
    case 'a': moveRight = true; break;
    
  }
}

function onKeyUp(event) {
  switch (event.key) {
    case 'w': moveForward = false; break;
    case 's': moveBackward = false; break;
    case 'd': moveLeft = false; break;
    case 'a': moveRight = false; break;
    
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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
  document.exitPointerLock();

  const accuracy = shotsFired > 0 ? ((score / shotsFired) * 100).toFixed(1) : 0;

  // Mostrar la pantalla final
  document.getElementById("endScreen").style.display = "block";
  document.getElementById("finalScore").textContent = `Puntaje final: ${score}`;
  document.getElementById("finalAccuracy").textContent = `Precisión final: ${accuracy}%`;
  guardarEnLeaderboard(score, accuracy);

  // Configurar el botón de reinicio
  document.getElementById("restartButton").addEventListener("click", () => {
    resetGame();  // Ahora solo se reinicia cuando se hace clic en "Reiniciar"
    document.getElementById("endScreen").style.display = "none";  // Oculta la pantalla final
  });
  
  

  // Mostrar el botón para volver al menú principal
  document.getElementById("mainMenuButton").addEventListener("click", () => {
    // Recargar la página
    location.reload();
  });
  
  
}

function resetGame() {
  // Detener el juego y restablecer los valores
  score = 0;
  shotsFired = 0;
  gameTimer = 60;
  gameEnded = false;

  // Limpiar los objetos en la escena
  targets.forEach(t => {
    clearTimeout(t.userData.timeout);
    clearInterval(t.userData.scaleInterval);
    scene.remove(t);
  });
  targets = [];

  // Restablecer el HUD
  updateHUD();

  // Re-crear los objetivos
  createTargets();

  // Iniciar el temporizador nuevamente
  startGameTimer();

  // Restablecer el temporizador en pantalla
  document.getElementById("timer").textContent = `Tiempo: ${gameTimer}`;
}


function createWeapon() {
  const loader = new GLTFLoader();

  loader.load('./assets/weapon.glb', (gltf) => {
    weapon = gltf.scene;

    // Escala y posición para vista en primera persona
    weapon.scale.set(3.5, 3.5, 3.5);  // Ajusta estos valores según el tamaño del modelo
    weapon.position.set(0.7, -0.7, 0.0);  // Ajusta la posición a la vista FPS
    weapon.rotation.y = Math.PI;  // Ajuste para que el arma esté bien orientada

    // Agrega el arma a la cámara
    camera.add(weapon);
  }, undefined, (error) => {
    console.error('Error al cargar el modelo de arma:', error);
  });
}



function animateWeapon() {
  if (!weapon) return;

  // Retroceso hacia atrás
  const originalZ = -1.0;  // Posición Z original
  const recoilZ = -1.2;    // Posición Z del retroceso
  const duration = 100;     // Duración del retroceso (ms)

  // Ir hacia atrás
  weapon.position.z = recoilZ;

  setTimeout(() => {
    // Volver al original suavemente
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

function guardarEnLeaderboard(puntaje, precision) {
  const leaderboard = JSON.parse(localStorage.getItem('leaderboard')) || [];
  leaderboard.push({ name: "Jugador", score: puntaje, accuracy: precision });
  localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;
  velocity.y -= 9.8 * delta;

  if (isOnGround) {
    velocity.y = Math.max(0, velocity.y);
    isJumping = false;
  }

  direction.z = Number(moveForward) - Number(moveBackward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize();

  if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
  if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

  controls.object.translateX(velocity.x);
  controls.object.translateZ(velocity.z);
  controls.object.position.y += velocity.y;

  if (controls.object.position.y <= 1.6) {
    controls.object.position.y = 1.6;
    isOnGround = true;
  } else {
    isOnGround = false;
  }

  targets.forEach(target => {
    target.position.x += target.userData.velocity;
  
    // Rebotar si se sale del rango X permitido
    const xLimit = 20;
    if (target.position.x > xLimit || target.position.x < -xLimit) {
      target.userData.velocity *= -1;
    }
    
  });
  

  renderer.render(scene, camera);
}
