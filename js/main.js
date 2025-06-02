import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

let camera, scene, renderer, controls;
let listener, shootSound, hitSound;
let weapon; // Variable global para el arma
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

let controller1, controller2;
let controllerGrip1, controllerGrip2;

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

document.getElementById('start-button').addEventListener('click', () => {
  document.getElementById('main-menu').style.display = 'none';
  init();
  animate();
});

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xD3D3D3);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.set(0, 1.6, 0);

  // AudioListener y sonidos
  listener = new THREE.AudioListener();
  camera.add(listener);

  shootSound = new THREE.Audio(listener);
  const shootAudioLoader = new THREE.AudioLoader();
  shootAudioLoader.load('./assets/disparo.mp3', function(buffer) {
    shootSound.setBuffer(buffer);
    shootSound.setVolume(0.5);
  });

  hitSound = new THREE.Audio(listener);
  const hitAudioLoader = new THREE.AudioLoader();
  hitAudioLoader.load('./assets/punto.mp3', function(buffer) {
    hitSound.setBuffer(buffer);
    hitSound.setVolume(0.5);
  });

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true; // Habilitar VR
  document.body.appendChild(renderer.domElement);

  // Botón para activar VR
  document.body.appendChild(VRButton.createButton(renderer));

  createWeapon(); // Cargar arma

  // Luz principal
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

  // Controls pointer lock para modo desktop
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

  // Eventos teclado (solo desktop)
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);

  // Evento click desktop para disparar (no VR)
  document.addEventListener('click', () => {
    if (!renderer.xr.isPresenting) onShoot();
  });

  window.addEventListener('resize', onWindowResize);

  // Controladores VR
  setupVRControllers();

  startGameTimer();
}

function setupVRControllers() {
  const controllerModelFactory = new XRControllerModelFactory();

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onShoot);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onShoot);
  scene.add(controller2);

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);
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
    if (currentScale > originalSize * 1.5) {
      target.userData.velocity *= -1;
    } else if (currentScale < originalSize * 0.5) {
      target.userData.velocity *= -1;
    }
    target.scale.setScalar(currentScale + target.userData.velocity);
  }, 50);
}

function relocateTarget(target) {
  target.position.set(
    Math.random() * 20 - 10,
    Math.random() * 5 + 1,
    -Math.random() * 20 - 10
  );
  target.userData.hit = false;
  resetTargetTimer(target);
}

function createWeapon() {
  weapon = new THREE.Object3D();

  const gunGeometry = new THREE.BoxGeometry(0.3, 0.1, 1);
  const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const gun = new THREE.Mesh(gunGeometry, gunMaterial);
  gun.castShadow = true;
  gun.receiveShadow = true;
  weapon.add(gun);

  // Punto rojo
  const redDotGeometry = new THREE.CircleGeometry(0.03, 32);
  const redDotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const redDot = new THREE.Mesh(redDotGeometry, redDotMaterial);
  redDot.position.set(0, 0.05, -0.45);
  weapon.add(redDot);

  scene.add(weapon);
}

function onShoot() {
  if (gameEnded) return;

  shootSound.play();
  shotsFired++;

  // Calcula el rayo según modo VR o desktop
  let rayOrigin, rayDirection;

  if (renderer.xr.isPresenting) {
    // En VR: usa la posición y orientación del controlador1
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller1.matrixWorld);
    rayOrigin = new THREE.Vector3().setFromMatrixPosition(controller1.matrixWorld);
    rayDirection = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);
  } else {
    // Desktop: usa la cámara
    rayOrigin = camera.position.clone();
    rayDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  }

  raycaster.set(rayOrigin, rayDirection);

  const intersects = raycaster.intersectObjects(targets, false);

  if (intersects.length > 0) {
    const target = intersects[0].object;

    if (!target.userData.hit) {
      target.userData.hit = true;
      hitSound.play();

      score++;
      document.getElementById('score').textContent = `Puntaje: ${score}`;

      clearTimeout(target.userData.timeout);
      clearInterval(target.userData.scaleInterval);

      // Animación de encogimiento
      const shrinkDuration = 500;
      const startScale = target.scale.x;
      const startTime = performance.now();

      function animateShrink() {
        const elapsed = performance.now() - startTime;
        const progress = elapsed / shrinkDuration;

        if (progress < 1) {
          const scale = startScale * (1 - progress);
          target.scale.setScalar(scale);
          requestAnimationFrame(animateShrink);
        } else {
          relocateTarget(target);
        }
      }
      animateShrink();
    }
  }
}

function startGameTimer() {
  gameInterval = setInterval(() => {
    gameTimer--;
    document.getElementById('timer').textContent = `Tiempo restante: ${gameTimer}s`;
    if (gameTimer <= 0) {
      clearInterval(gameInterval);
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameEnded = true;
  alert(`Juego terminado. Puntaje final: ${score}\nDisparos realizados: ${shotsFired}`);
  location.reload();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
  switch (event.code) {
    case 'KeyW': moveForward = true; break;
    case 'KeyS': moveBackward = true; break;
    case 'KeyA': moveLeft = true; break;
    case 'KeyD': moveRight = true; break;
    case 'Space':
      if (!isJumping && isOnGround) {
        isJumping = true;
        velocity.y += jumpHeight;
      }
      break;
    case 'ControlLeft':
      if (!isCrouching) {
        isCrouching = true;
        camera.position.y -= crouchHeight;
      }
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'KeyW': moveForward = false; break;
    case 'KeyS': moveBackward = false; break;
    case 'KeyA': moveLeft = false; break;
    case 'KeyD': moveRight = false; break;
    case 'ControlLeft':
      if (isCrouching) {
        isCrouching = false;
        camera.position.y += crouchHeight;
      }
      break;
  }
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  const delta = clock.getDelta();

  if (!renderer.xr.isPresenting) {
    // Movimiento desktop
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);

    // Gravedad y salto
    if (!isOnGround) velocity.y -= 9.8 * delta;
    controls.getObject().position.y += velocity.y * delta;

    if (controls.getObject().position.y < 1.6) {
      velocity.y = 0;
      controls.getObject().position.y = 1.6;
      isOnGround = true;
      isJumping = false;
    } else {
      isOnGround = false;
    }

    // Mover arma con cámara
    if (weapon) {
      weapon.position.copy(camera.position);
      weapon.position.y -= 0.2;
      weapon.position.z -= 0.5;
      weapon.quaternion.copy(camera.quaternion);
    }
  } else {
    // VR: arma fija delante del controlador 1
    if (weapon && controller1) {
      weapon.position.setFromMatrixPosition(controller1.matrixWorld);
      weapon.quaternion.setFromRotationMatrix(controller1.matrixWorld);
    }
  }

  // Mover objetivos
  targets.forEach(target => {
    if (!target.userData.hit) {
      target.position.y += target.userData.velocity;
      if (target.position.y > 5 || target.position.y < 1) {
        target.userData.velocity *= -1;
      }
    }
  });

  renderer.render(scene, camera);
}
