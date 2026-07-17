import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  clampDieValue,
  getDicePipLayout,
  getDieDisplayRotation,
  getOverlayDieBoxFaceValues,
  getOverlayDieScaleForScreenSlot,
  getOverlayDieShadowState,
  getOverlayDieVisualSpec,
  sampleDiceRollMotion
} from "./gameStageOverlayDice.ts";
import {
  createOverlayDieMaterialSet,
  type OverlayDieMaterialSet,
  type OverlayDieMaterialTheme
} from "./gameStageOverlayDieMaterials.ts";
import type {
  GameStageOverlayAnchor,
  GameStageOverlayAnchorUpdateCommand,
  GameStageOverlayRollResolveCommand,
  GameStageOverlayRollStartCommand,
  GameStageOverlayStageExitCommand
} from "./gameStageOverlayTypes.ts";

export interface GameStageOverlaySceneHandle {
  enterIdle(): void;
  clear(): void;
  stageEnter(command: { leftAnchor?: GameStageOverlayAnchor; rightAnchor?: GameStageOverlayAnchor }): void;
  updateAnchors(command: GameStageOverlayAnchorUpdateCommand): void;
  stageExit(command: GameStageOverlayStageExitCommand): void;
  startRoll(command: GameStageOverlayRollStartCommand): void;
  resolveRoll(command: GameStageOverlayRollResolveCommand): void;
  dispose(): void;
}

type OverlayDieVisual = {
  root: THREE.Group;
  shadow: THREE.Sprite;
  shadowMaterial: THREE.SpriteMaterial;
  pipGroup: THREE.Group;
  pipMaterial: THREE.MeshStandardMaterial;
  pipRecessMaterial: THREE.MeshStandardMaterial;
  baseX: number;
  baseY: number;
  baseZ: number;
  scale: number;
  value: number;
  materials: OverlayDieMaterialSet;
};

type OverlayDiePose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
};

const ROLL_ANIMATION_MS = 1000;
const ROLL_RESOLVE_SETTLE_MS = 220;
const STAGE_TRANSITION_MS = 760;
const FINAL_EXIT_MS = 920;

export function getOverlayRendererPixelRatio(devicePixelRatio: number | undefined): number {
  const ratio = Number(devicePixelRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 1;
  }
  return Math.min(ratio, 3);
}

function shouldReduceOverlayMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function ensureRendererSize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, mountEl: HTMLElement): void {
  const width = Math.max(mountEl.clientWidth || 0, 1);
  const height = Math.max(mountEl.clientHeight || 0, 1);
  renderer.setSize(width, height, true);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function createDieVisual(
  appearance: OverlayDieMaterialTheme,
  dieGeometry: THREE.BufferGeometry,
  pipRecessGeometry: THREE.BufferGeometry,
  pipFloorGeometry: THREE.BufferGeometry,
  shadowTexture: THREE.Texture,
  baseX: number,
  baseY: number,
  baseZ: number
): OverlayDieVisual {
  const root = new THREE.Group();
  const materials = createOverlayDieMaterialSet(appearance);
  const body = new THREE.Mesh(dieGeometry, materials.materials);
  root.add(body);
  const pipMaterial = new THREE.MeshStandardMaterial({
    color: appearance.pipColor,
    roughness: 0.82,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  });
  const pipRecessMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(appearance.shadowColor),
    roughness: 0.9,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const pipGroup = createDiePipGroup(
    pipRecessGeometry,
    pipFloorGeometry,
    pipRecessMaterial,
    pipMaterial,
    getOverlayDieVisualSpec()
  );
  root.add(pipGroup);
  const shadowMaterial = new THREE.SpriteMaterial({
    map: shadowTexture,
    color: 0x000000,
    opacity: 0.58,
    transparent: true,
    depthWrite: false,
    depthTest: true
  });
  const shadow = new THREE.Sprite(shadowMaterial);

  return {
    root,
    shadow,
    shadowMaterial,
    pipGroup,
    pipMaterial,
    pipRecessMaterial,
    baseX,
    baseY,
    baseZ,
    scale: 1,
    value: 3,
    materials
  };
}

function createDiePipGroup(
  pipRecessGeometry: THREE.BufferGeometry,
  pipFloorGeometry: THREE.BufferGeometry,
  pipRecessMaterial: THREE.Material,
  pipMaterial: THREE.Material,
  visualSpec: ReturnType<typeof getOverlayDieVisualSpec>
): THREE.Group {
  const group = new THREE.Group();
  const halfSize = visualSpec.dieSize / 2;
  const recessOffset = halfSize + 0.005;
  const floorOffset = halfSize + 0.008;
  const pipSpread = Math.max(0.1, halfSize - visualSpec.facePadding - visualSpec.pipRadius) * 0.72;
  const maxPipOffset = 0.34;
  const faceValues = getOverlayDieBoxFaceValues();
  const faces = [
    {
      value: faceValues[0] ?? 2,
      normal: new THREE.Vector3(1, 0, 0),
      tangentX: new THREE.Vector3(0, 0, -1),
      tangentY: new THREE.Vector3(0, 1, 0),
      rotation: new THREE.Euler(0, Math.PI / 2, 0)
    },
    {
      value: faceValues[1] ?? 5,
      normal: new THREE.Vector3(-1, 0, 0),
      tangentX: new THREE.Vector3(0, 0, 1),
      tangentY: new THREE.Vector3(0, 1, 0),
      rotation: new THREE.Euler(0, -Math.PI / 2, 0)
    },
    {
      value: faceValues[2] ?? 3,
      normal: new THREE.Vector3(0, 1, 0),
      tangentX: new THREE.Vector3(1, 0, 0),
      tangentY: new THREE.Vector3(0, 0, -1),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0)
    },
    {
      value: faceValues[3] ?? 4,
      normal: new THREE.Vector3(0, -1, 0),
      tangentX: new THREE.Vector3(1, 0, 0),
      tangentY: new THREE.Vector3(0, 0, 1),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0)
    },
    {
      value: faceValues[4] ?? 1,
      normal: new THREE.Vector3(0, 0, 1),
      tangentX: new THREE.Vector3(1, 0, 0),
      tangentY: new THREE.Vector3(0, 1, 0),
      rotation: new THREE.Euler(0, 0, 0)
    },
    {
      value: faceValues[5] ?? 6,
      normal: new THREE.Vector3(0, 0, -1),
      tangentX: new THREE.Vector3(-1, 0, 0),
      tangentY: new THREE.Vector3(0, 1, 0),
      rotation: new THREE.Euler(0, Math.PI, 0)
    }
  ];

  for (const face of faces) {
    for (const point of getDicePipLayout(face.value)) {
      const offsetX = (point.x / maxPipOffset) * pipSpread;
      const offsetY = (point.y / maxPipOffset) * pipSpread;
      const recessPosition = face.normal.clone().multiplyScalar(recessOffset)
        .add(face.tangentX.clone().multiplyScalar(offsetX))
        .add(face.tangentY.clone().multiplyScalar(offsetY));
      const floorPosition = face.normal.clone().multiplyScalar(floorOffset)
        .add(face.tangentX.clone().multiplyScalar(offsetX))
        .add(face.tangentY.clone().multiplyScalar(offsetY));
      const recessMesh = new THREE.Mesh(pipRecessGeometry, pipRecessMaterial);
      recessMesh.position.copy(recessPosition);
      recessMesh.rotation.copy(face.rotation);
      recessMesh.renderOrder = 1;
      const floorMesh = new THREE.Mesh(pipFloorGeometry, pipMaterial);
      floorMesh.position.copy(floorPosition);
      floorMesh.rotation.copy(face.rotation);
      floorMesh.renderOrder = 2;
      group.add(recessMesh, floorMesh);
    }
  }

  return group;
}

function createDieShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 64, 8, 128, 64, 118);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.95)");
    gradient.addColorStop(0.38, "rgba(0, 0, 0, 0.58)");
    gradient.addColorStop(0.72, "rgba(0, 0, 0, 0.18)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function applyDieShadow(die: OverlayDieVisual): void {
  const shadow = getOverlayDieShadowState({
    baseY: die.baseY,
    currentY: die.root.position.y,
    scale: die.scale
  });
  die.shadow.position.set(die.root.position.x, die.baseY + shadow.offsetY, die.root.position.z - 0.18);
  die.shadow.scale.set(shadow.scaleX, shadow.scaleY, 1);
  die.shadowMaterial.opacity = shadow.opacity;
  die.shadow.visible = die.root.visible;
}

function getIdlePose(die: OverlayDieVisual, winnerSide: "left" | "right" | null, side: "left" | "right"): OverlayDiePose {
  const winner = winnerSide === side;
  const displayRotation = getDieDisplayRotation(die.value);
  const euler = new THREE.Euler(displayRotation.x, displayRotation.y, displayRotation.z);

  return {
    position: new THREE.Vector3(
      die.baseX,
      die.baseY + (winner ? 0.05 : 0),
      die.baseZ + (winner ? 0.24 : 0)
    ),
    quaternion: new THREE.Quaternion().setFromEuler(euler),
    scale: die.scale * (winner ? 1.06 : 1)
  };
}

function applyIdlePose(die: OverlayDieVisual, winnerSide: "left" | "right" | null, side: "left" | "right"): void {
  const pose = getIdlePose(die, winnerSide, side);
  die.root.position.copy(pose.position);
  die.root.quaternion.copy(pose.quaternion);
  die.root.scale.setScalar(pose.scale);
}

function applyRollingPose(die: OverlayDieVisual, progress: number, side: "left" | "right"): void {
  const motion = sampleDiceRollMotion(progress, { scale: die.scale });
  const direction = side === "left" ? -1 : 1;
  die.root.position.set(
    die.baseX + motion.driftX * direction,
    die.baseY + motion.height,
    die.baseZ + motion.driftZ * direction
  );
  die.root.scale.setScalar(die.scale);
  die.root.rotation.set(
    motion.rotation.x,
    motion.rotation.y * direction,
    motion.rotation.z * direction
  );
}

function projectAnchorToWorld(
  anchor: GameStageOverlayAnchor,
  camera: THREE.PerspectiveCamera,
  planeZ = 0
): { x: number; y: number } {
  const ndcX = anchor.x * 2 - 1;
  const ndcY = 1 - anchor.y * 2;
  const origin = camera.position.clone();
  const samplePoint = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
  const direction = samplePoint.sub(origin).normalize();
  const distance = (planeZ - origin.z) / direction.z;
  const worldPoint = origin.add(direction.multiplyScalar(distance));
  return {
    x: worldPoint.x,
    y: worldPoint.y
  };
}

export function createGameStageOverlayScene(mountEl: HTMLElement): GameStageOverlaySceneHandle {
  const visualSpec = getOverlayDieVisualSpec();
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(getOverlayRendererPixelRatio(globalThis.devicePixelRatio));
  mountEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 1.95, 9.5);
  camera.lookAt(0, 0.15, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
  const keyLight = new THREE.DirectionalLight(0xfff1ca, 2.1);
  keyLight.position.set(-3.2, 4.6, 5.4);
  const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.55);
  fillLight.position.set(2.1, 1.8, 4.1);
  const rimLight = new THREE.DirectionalLight(0xffd46e, 1.1);
  rimLight.position.set(2.8, -0.4, 3.4);
  scene.add(ambientLight, keyLight, fillLight, rimLight);

  const dieGeometry = new RoundedBoxGeometry(
    visualSpec.dieSize,
    visualSpec.dieSize,
    visualSpec.dieSize,
    4,
    visualSpec.dieSize * 0.12
  );
  const pipRecessGeometry = new THREE.CircleGeometry(visualSpec.pipRadius * 1.24, 56);
  const pipFloorGeometry = new THREE.CircleGeometry(visualSpec.pipRadius * 0.72, 56);
  const shadowTexture = createDieShadowTexture();
  const leftVisual = createDieVisual(
    {
      faceColor: 0x121111,
      pipColor: 0xd4af37,
      shadowColor: "#070707",
      highlightColor: "#1f1b13"
    },
    dieGeometry,
    pipRecessGeometry,
    pipFloorGeometry,
    shadowTexture,
    -1.16,
    0.34,
    0.08
  );
  const rightVisual = createDieVisual(
    {
      faceColor: 0xf1eadc,
      pipColor: 0x171513,
      shadowColor: "#cfc3ac",
      highlightColor: "#fff8ec"
    },
    dieGeometry,
    pipRecessGeometry,
    pipFloorGeometry,
    shadowTexture,
    1.16,
    0.34,
    -0.08
  );
  scene.add(leftVisual.shadow, rightVisual.shadow, leftVisual.root, rightVisual.root);

  let animationFrameId: number | null = null;
  let resultTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let rollingStartedAt = 0;
  let resolveStartedAt = 0;
  let stageTransitionStartedAt = 0;
  let finalExitStartedAt = 0;
  let resolveStartPose: { left: OverlayDiePose; right: OverlayDiePose } | null = null;
  let winnerSide: "left" | "right" | null = null;
  let currentLeftAnchor: GameStageOverlayAnchor | undefined;
  let currentRightAnchor: GameStageOverlayAnchor | undefined;
  let diceVisible = false;
  let reducedMotion = shouldReduceOverlayMotion();

  function applyAnchorToDie(
    die: OverlayDieVisual,
    anchor: GameStageOverlayAnchor | undefined,
    fallback: { x: number; y: number; z: number }
  ): void {
    if (!anchor) {
      die.baseX = fallback.x;
      die.baseY = fallback.y;
      die.baseZ = fallback.z;
      die.scale = 1;
      return;
    }

    const worldPoint = projectAnchorToWorld(anchor, camera);
    die.baseX = worldPoint.x;
    die.baseY = worldPoint.y;
    die.baseZ = 0;
    die.scale = getOverlayDieScaleForScreenSlot({
      slotSizePx: anchor.size * Math.max(mountEl.clientWidth || 0, 1),
      viewportHeightPx: Math.max(mountEl.clientHeight || 0, 1),
      cameraDistance: Math.abs(camera.position.z),
      cameraFovDegrees: camera.fov,
      dieSize: visualSpec.dieSize,
      fillRatio: 0.82
    });
  }

  function applyCurrentAnchors(): void {
    applyAnchorToDie(leftVisual, currentLeftAnchor, { x: -1.16, y: 0.34, z: 0.08 });
    applyAnchorToDie(rightVisual, currentRightAnchor, { x: 1.16, y: 0.34, z: -0.08 });
  }

  function prepareSceneFrame(): void {
    reducedMotion = shouldReduceOverlayMotion();
    ensureRendererSize(renderer, camera, mountEl);
    applyCurrentAnchors();
  }

  function renderScene(): void {
    leftVisual.root.visible = diceVisible;
    rightVisual.root.visible = diceVisible;
    applyDieShadow(leftVisual);
    applyDieShadow(rightVisual);
    renderer.render(scene, camera);
  }

  function stopAnimation(): void {
    if (animationFrameId != null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function stopResultTimeout(): void {
    if (resultTimeoutId != null) {
      clearTimeout(resultTimeoutId);
      resultTimeoutId = null;
    }
  }

  function resetLighting(): void {
    keyLight.intensity = 2.1;
    rimLight.intensity = 1.1;
  }

  function clearScene(): void {
    stopAnimation();
    stopResultTimeout();
    diceVisible = false;
    winnerSide = null;
    resetLighting();
    prepareSceneFrame();
    renderScene();
  }

  function renderIdleState(): void {
    diceVisible = true;
    prepareSceneFrame();
    applyIdlePose(leftVisual, winnerSide, "left");
    applyIdlePose(rightVisual, winnerSide, "right");
    keyLight.intensity = 2.1;
    rimLight.intensity = 1.1;
    renderScene();
  }

  function animateRoll(now: number): void {
    const elapsedMs = now - rollingStartedAt;
    const progress = Math.min(1, Math.max(0, elapsedMs / ROLL_ANIMATION_MS));

    prepareSceneFrame();
    applyRollingPose(leftVisual, progress, "left");
    applyRollingPose(rightVisual, progress, "right");
    keyLight.intensity = 2.2 + Math.sin(progress * Math.PI) * 0.55;
    rimLight.intensity = 1.1 + Math.sin(progress * Math.PI) * 0.38;
    renderScene();
    animationFrameId = requestAnimationFrame(animateRoll);
  }

  function animateResolveSettle(now: number): void {
    if (!resolveStartPose) {
      renderIdleState();
      return;
    }

    prepareSceneFrame();
    const progress = Math.min(1, Math.max(0, (now - resolveStartedAt) / ROLL_RESOLVE_SETTLE_MS));
    const eased = 1 - (1 - progress) ** 3;
    const leftTarget = getIdlePose(leftVisual, winnerSide, "left");
    const rightTarget = getIdlePose(rightVisual, winnerSide, "right");

    leftVisual.root.position.copy(resolveStartPose.left.position).lerp(leftTarget.position, eased);
    leftVisual.root.quaternion.copy(resolveStartPose.left.quaternion).slerp(leftTarget.quaternion, eased);
    leftVisual.root.scale.setScalar(resolveStartPose.left.scale + (leftTarget.scale - resolveStartPose.left.scale) * eased);
    rightVisual.root.position.copy(resolveStartPose.right.position).lerp(rightTarget.position, eased);
    rightVisual.root.quaternion.copy(resolveStartPose.right.quaternion).slerp(rightTarget.quaternion, eased);
    rightVisual.root.scale.setScalar(resolveStartPose.right.scale + (rightTarget.scale - resolveStartPose.right.scale) * eased);

    keyLight.intensity = 2.1;
    rimLight.intensity = 1.1;
    renderScene();

    if (progress >= 1) {
      resolveStartPose = null;
      renderIdleState();
      return;
    }

    animationFrameId = requestAnimationFrame(animateResolveSettle);
  }

  function animateFinalExit(now: number): void {
    const progress = Math.min(1, (now - finalExitStartedAt) / FINAL_EXIT_MS);
    const winnerDirection = winnerSide === "left" ? -1 : 1;

    prepareSceneFrame();
    applyIdlePose(leftVisual, winnerSide, "left");
    applyIdlePose(rightVisual, winnerSide, "right");

    leftVisual.root.rotation.x += progress * Math.PI * 2.8;
    leftVisual.root.rotation.y += progress * Math.PI * 1.8;
    rightVisual.root.rotation.x += progress * Math.PI * 2.8;
    rightVisual.root.rotation.y += progress * Math.PI * 1.8;

    if (winnerSide === "left") {
      leftVisual.root.position.x += winnerDirection * progress * 3.1;
      leftVisual.root.position.y += progress * 1.45;
      leftVisual.root.position.z -= progress * 1.2;
      leftVisual.root.scale.setScalar(leftVisual.scale * (1 + progress * 0.18));
      rightVisual.root.position.x -= winnerDirection * progress * 1.6;
      rightVisual.root.position.y -= progress * 0.42;
    } else {
      rightVisual.root.position.x += winnerDirection * progress * 3.1;
      rightVisual.root.position.y += progress * 1.45;
      rightVisual.root.position.z -= progress * 1.2;
      rightVisual.root.scale.setScalar(rightVisual.scale * (1 + progress * 0.18));
      leftVisual.root.position.x -= winnerDirection * progress * 1.6;
      leftVisual.root.position.y -= progress * 0.42;
    }

    keyLight.intensity = 2.2 + progress * 0.55;
    rimLight.intensity = 1.2 + progress * 0.42;
    renderScene();

    if (progress >= 1) {
      clearScene();
      return;
    }

    animationFrameId = requestAnimationFrame(animateFinalExit);
  }

  function animateStageTransition(now: number, entering: boolean): void {
    const progress = Math.min(1, (now - stageTransitionStartedAt) / STAGE_TRANSITION_MS);
    const offset = entering ? (1 - (1 - progress) ** 3) : progress ** 3;
    const transition = entering ? 1 - offset : offset;

    prepareSceneFrame();
    applyIdlePose(leftVisual, null, "left");
    applyIdlePose(rightVisual, null, "right");

    leftVisual.root.position.x += transition * -2.4;
    leftVisual.root.position.y += transition * 0.72;
    leftVisual.root.position.z -= transition * 1.15;
    rightVisual.root.position.x += transition * 2.4;
    rightVisual.root.position.y += transition * 0.72;
    rightVisual.root.position.z -= transition * 1.15;

    leftVisual.root.rotation.x += transition * Math.PI * 1.6;
    leftVisual.root.rotation.y += transition * Math.PI * 0.8;
    rightVisual.root.rotation.x += transition * Math.PI * 1.6;
    rightVisual.root.rotation.y -= transition * Math.PI * 0.8;

    const scale = 1 - transition * 0.18;
    leftVisual.root.scale.setScalar(leftVisual.scale * scale);
    rightVisual.root.scale.setScalar(rightVisual.scale * scale);

    renderScene();

    if (progress >= 1) {
      if (entering) {
        renderIdleState();
      } else {
        clearScene();
      }
      return;
    }

    animationFrameId = requestAnimationFrame(entering ? animateStageEnter : animateStageExit);
  }

  function animateStageEnter(now: number): void {
    animateStageTransition(now, true);
  }

  function animateStageExit(now: number): void {
    animateStageTransition(now, false);
  }

  leftVisual.value = 3;
  rightVisual.value = 4;
  clearScene();

  return {
    enterIdle() {
      stopAnimation();
      stopResultTimeout();
      if (diceVisible) {
        renderIdleState();
        return;
      }
      prepareSceneFrame();
      renderScene();
    },
    clear() {
      clearScene();
    },
    stageEnter(command) {
      stopAnimation();
      stopResultTimeout();
      winnerSide = null;
      currentLeftAnchor = command.leftAnchor ?? currentLeftAnchor;
      currentRightAnchor = command.rightAnchor ?? currentRightAnchor;
      leftVisual.value = 1;
      rightVisual.value = 1;
      diceVisible = true;
      stageTransitionStartedAt = performance.now();
      animationFrameId = requestAnimationFrame(animateStageEnter);
    },
    updateAnchors(command) {
      currentLeftAnchor = command.leftAnchor ?? currentLeftAnchor;
      currentRightAnchor = command.rightAnchor ?? currentRightAnchor;
      if (diceVisible) {
        renderIdleState();
        return;
      }
      prepareSceneFrame();
      renderScene();
    },
    stageExit(command) {
      if (!diceVisible) {
        clearScene();
        return;
      }
      stopAnimation();
      stopResultTimeout();
      currentLeftAnchor = command.leftAnchor ?? currentLeftAnchor;
      currentRightAnchor = command.rightAnchor ?? currentRightAnchor;
      if (command.style === "champion" && command.winnerSide) {
        winnerSide = command.winnerSide;
        finalExitStartedAt = performance.now();
        animationFrameId = requestAnimationFrame(animateFinalExit);
        return;
      }

      winnerSide = null;
      stageTransitionStartedAt = performance.now();
      animationFrameId = requestAnimationFrame(animateStageExit);
    },
    startRoll(command: GameStageOverlayRollStartCommand) {
      stopAnimation();
      stopResultTimeout();
      diceVisible = true;
      winnerSide = null;
      currentLeftAnchor = command.leftAnchor;
      currentRightAnchor = command.rightAnchor;
      rollingStartedAt = performance.now();
      reducedMotion = shouldReduceOverlayMotion();
      if (reducedMotion) {
        renderIdleState();
        return;
      }
      animationFrameId = requestAnimationFrame(animateRoll);
    },
    resolveRoll(command: GameStageOverlayRollResolveCommand) {
      stopAnimation();
      stopResultTimeout();
      diceVisible = true;
      resolveStartPose = {
        left: {
          position: leftVisual.root.position.clone(),
          quaternion: leftVisual.root.quaternion.clone(),
          scale: leftVisual.root.scale.x
        },
        right: {
          position: rightVisual.root.position.clone(),
          quaternion: rightVisual.root.quaternion.clone(),
          scale: rightVisual.root.scale.x
        }
      };
      currentLeftAnchor = command.leftAnchor ?? currentLeftAnchor;
      currentRightAnchor = command.rightAnchor ?? currentRightAnchor;
      leftVisual.value = clampDieValue(command.leftValue);
      rightVisual.value = clampDieValue(command.rightValue);
      winnerSide = command.winnerSide;
      reducedMotion = shouldReduceOverlayMotion();
      if (reducedMotion) {
        resolveStartPose = null;
        renderIdleState();
        return;
      }
      resolveStartedAt = performance.now();
      animationFrameId = requestAnimationFrame(animateResolveSettle);
    },
    dispose() {
      clearScene();
      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
      dieGeometry.dispose();
      pipRecessGeometry.dispose();
      pipFloorGeometry.dispose();
      shadowTexture.dispose();
      leftVisual.shadowMaterial.dispose();
      rightVisual.shadowMaterial.dispose();
      leftVisual.pipMaterial.dispose();
      rightVisual.pipMaterial.dispose();
      leftVisual.pipRecessMaterial.dispose();
      rightVisual.pipRecessMaterial.dispose();
      for (const texture of leftVisual.materials.textures) {
        texture.dispose();
      }
      for (const material of leftVisual.materials.materials) {
        material.dispose();
      }
      for (const texture of rightVisual.materials.textures) {
        texture.dispose();
      }
      for (const material of rightVisual.materials.materials) {
        material.dispose();
      }
      renderer.dispose();
    }
  };
}
