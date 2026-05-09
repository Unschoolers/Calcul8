import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type {
  GameStageOverlayAnchor,
  GameStageOverlayStageExitCommand,
  GameStageOverlayRollResolveCommand,
  GameStageOverlayRollStartCommand
} from "./gameStageOverlayTypes.ts";
import {
  createOverlayDieMaterialSet,
  type OverlayDieMaterialSet,
  type OverlayDieMaterialTheme
} from "./gameStageOverlayDieMaterials.ts";
import {
  clampDieValue,
  getDieDisplayRotation,
  getOverlayDieScaleForScreenSlot,
  getOverlayDieVisualSpec,
  sampleDiceRollMotion
} from "./gameStageOverlayDice.ts";

export interface GameStageOverlaySceneHandle {
  enterIdle(): void;
  clear(): void;
  stageEnter(command: { leftAnchor?: GameStageOverlayAnchor; rightAnchor?: GameStageOverlayAnchor }): void;
  stageExit(command: GameStageOverlayStageExitCommand): void;
  startRoll(command: GameStageOverlayRollStartCommand): void;
  resolveRoll(command: GameStageOverlayRollResolveCommand): void;
  dispose(): void;
}

type OverlayDieVisual = {
  root: THREE.Group;
  baseX: number;
  baseY: number;
  baseZ: number;
  scale: number;
  value: number;
  materials: OverlayDieMaterialSet;
};

const ROLL_CYCLE_MS = 720;
const STAGE_TRANSITION_MS = 760;
const FINAL_EXIT_MS = 920;

function ensureRendererSize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, mountEl: HTMLElement): void {
  const width = Math.max(mountEl.clientWidth || 0, 1);
  const height = Math.max(mountEl.clientHeight || 0, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function createDieVisual(
  appearance: OverlayDieMaterialTheme,
  dieGeometry: THREE.BufferGeometry,
  baseX: number,
  baseY: number,
  baseZ: number
): OverlayDieVisual {
  const root = new THREE.Group();
  const materials = createOverlayDieMaterialSet(appearance);
  const body = new THREE.Mesh(dieGeometry, materials.materials);
  root.add(body);

  return {
    root,
    baseX,
    baseY,
    baseZ,
    scale: 1,
    value: 3,
    materials
  };
}

function applyIdlePose(die: OverlayDieVisual, winnerSide: "left" | "right" | null, side: "left" | "right"): void {
  const winner = winnerSide === side;
  const displayRotation = getDieDisplayRotation(die.value);
  die.root.position.set(
    die.baseX,
    die.baseY + (winner ? 0.04 : 0),
    die.baseZ + (winner ? 0.18 : 0)
  );
  die.root.scale.setScalar(die.scale);
  die.root.rotation.set(displayRotation.x, displayRotation.y, displayRotation.z);
}

function applyRollingPose(die: OverlayDieVisual, progress: number, cycleIndex: number, side: "left" | "right"): void {
  const motion = sampleDiceRollMotion(progress);
  const direction = side === "left" ? -1 : 1;
  die.root.position.set(
    die.baseX + motion.driftX * direction,
    die.baseY + motion.height,
    die.baseZ + motion.driftZ * direction
  );
  die.root.scale.setScalar(die.scale);
  die.root.rotation.set(
    cycleIndex * Math.PI * 4 + motion.rotation.x,
    cycleIndex * Math.PI * 4.75 + motion.rotation.y * direction,
    cycleIndex * Math.PI * 3.25 + motion.rotation.z * direction
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
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
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
  const leftVisual = createDieVisual(
    {
      faceColor: 0x121111,
      pipColor: 0xd4af37,
      shadowColor: "#070707",
      highlightColor: "#1f1b13"
    },
    dieGeometry,
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
    1.16,
    0.34,
    -0.08
  );
  scene.add(leftVisual.root, rightVisual.root);

  let animationFrameId: number | null = null;
  let resultTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let rollingStartedAt = 0;
  let stageTransitionStartedAt = 0;
  let finalExitStartedAt = 0;
  let winnerSide: "left" | "right" | null = null;
  let currentLeftAnchor: GameStageOverlayAnchor | undefined;
  let currentRightAnchor: GameStageOverlayAnchor | undefined;
  let diceVisible = false;

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

  function renderScene(): void {
    ensureRendererSize(renderer, camera, mountEl);
    applyCurrentAnchors();
    leftVisual.root.visible = diceVisible;
    rightVisual.root.visible = diceVisible;
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
    renderScene();
  }

  function renderIdleState(): void {
    diceVisible = true;
    applyIdlePose(leftVisual, winnerSide, "left");
    applyIdlePose(rightVisual, winnerSide, "right");
    keyLight.intensity = winnerSide === "left" ? 2.45 : 2.1;
    rimLight.intensity = winnerSide === "right" ? 1.45 : 1.1;
    renderScene();
  }

  function animateRoll(now: number): void {
    const elapsedMs = now - rollingStartedAt;
    const cycleIndex = Math.floor(elapsedMs / ROLL_CYCLE_MS);
    const cycleProgress = (elapsedMs % ROLL_CYCLE_MS) / ROLL_CYCLE_MS;

    applyRollingPose(leftVisual, cycleProgress, cycleIndex, "left");
    applyRollingPose(rightVisual, (cycleProgress + 0.18) % 1, cycleIndex, "right");
    keyLight.intensity = 2.2 + Math.sin(cycleProgress * Math.PI) * 0.55;
    rimLight.intensity = 1.1 + Math.sin(cycleProgress * Math.PI) * 0.38;
    renderScene();
    animationFrameId = requestAnimationFrame(animateRoll);
  }

  function animateFinalExit(now: number): void {
    const progress = Math.min(1, (now - finalExitStartedAt) / FINAL_EXIT_MS);
    const winnerDirection = winnerSide === "left" ? -1 : 1;

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

  function animateStageEnter(now: number): void {
    const progress = Math.min(1, (now - stageTransitionStartedAt) / STAGE_TRANSITION_MS);
    const eased = 1 - (1 - progress) ** 3;

    applyIdlePose(leftVisual, null, "left");
    applyIdlePose(rightVisual, null, "right");

    leftVisual.root.position.x += (1 - eased) * -2.4;
    leftVisual.root.position.y += (1 - eased) * 0.72;
    leftVisual.root.position.z -= (1 - eased) * 1.15;
    rightVisual.root.position.x += (1 - eased) * 2.4;
    rightVisual.root.position.y += (1 - eased) * 0.72;
    rightVisual.root.position.z -= (1 - eased) * 1.15;

    leftVisual.root.rotation.x += (1 - eased) * Math.PI * 1.6;
    leftVisual.root.rotation.y += (1 - eased) * Math.PI * 0.8;
    rightVisual.root.rotation.x += (1 - eased) * Math.PI * 1.6;
    rightVisual.root.rotation.y -= (1 - eased) * Math.PI * 0.8;

    leftVisual.root.scale.setScalar(leftVisual.scale * (0.82 + eased * 0.18));
    rightVisual.root.scale.setScalar(rightVisual.scale * (0.82 + eased * 0.18));

    renderScene();

    if (progress >= 1) {
      renderIdleState();
      return;
    }

    animationFrameId = requestAnimationFrame(animateStageEnter);
  }

  function animateStageExit(now: number): void {
    const progress = Math.min(1, (now - stageTransitionStartedAt) / STAGE_TRANSITION_MS);
    const eased = progress ** 3;

    applyIdlePose(leftVisual, null, "left");
    applyIdlePose(rightVisual, null, "right");

    leftVisual.root.position.x += eased * -2.4;
    leftVisual.root.position.y += eased * 0.72;
    leftVisual.root.position.z -= eased * 1.15;
    rightVisual.root.position.x += eased * 2.4;
    rightVisual.root.position.y += eased * 0.72;
    rightVisual.root.position.z -= eased * 1.15;

    leftVisual.root.rotation.x += eased * Math.PI * 1.6;
    leftVisual.root.rotation.y += eased * Math.PI * 0.8;
    rightVisual.root.rotation.x += eased * Math.PI * 1.6;
    rightVisual.root.rotation.y -= eased * Math.PI * 0.8;

    leftVisual.root.scale.setScalar(leftVisual.scale * (1 - eased * 0.18));
    rightVisual.root.scale.setScalar(rightVisual.scale * (1 - eased * 0.18));

    renderScene();

    if (progress >= 1) {
      clearScene();
      return;
    }

    animationFrameId = requestAnimationFrame(animateStageExit);
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
      animationFrameId = requestAnimationFrame(animateRoll);
    },
    resolveRoll(command: GameStageOverlayRollResolveCommand) {
      stopAnimation();
      stopResultTimeout();
      diceVisible = true;
      currentLeftAnchor = command.leftAnchor ?? currentLeftAnchor;
      currentRightAnchor = command.rightAnchor ?? currentRightAnchor;
      leftVisual.value = clampDieValue(command.leftValue);
      rightVisual.value = clampDieValue(command.rightValue);
      winnerSide = command.winnerSide;
      renderIdleState();
    },
    dispose() {
      clearScene();
      if (renderer.domElement.parentElement === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
      dieGeometry.dispose();
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
