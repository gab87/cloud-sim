import type { Camera, Scene, WebGLRenderer } from 'three';
import { isNameAllowed } from './bannedNames';

const FONT_FAMILY = "'Bonheur Royale', cursive";

interface SnapshotDeps {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
}

const caption = (name: string) => `Shaped by the wind, captured by ${name}`;

function slugify(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'my';
}

/** Polaroid layout for a photo of w×h pixels: thin border on top/sides, thicker at the bottom. */
function polaroidLayout(w: number, h: number) {
  const side = Math.round(w * 0.04);
  const bottom = side * 3;
  return { side, bottom, width: w + side * 2, height: h + side + bottom };
}

/** Renders a fresh frame and copies it into a 2D canvas, freezing the current moment. */
export function grabFrame({ renderer, scene, camera }: SnapshotDeps) {
  // The renderer doesn't use preserveDrawingBuffer: the WebGL canvas can only be read
  // right after a render, in the same task, so render and copy back to back.
  const gl = renderer.domElement;
  renderer.render(scene, camera);
  const photo = document.createElement('canvas');
  photo.width = gl.width;
  photo.height = gl.height;
  photo.getContext('2d')!.drawImage(gl, 0, 0);
  return photo;
}

/** Composes a grabbed frame into a polaroid-style PNG with a handwritten caption. */
export async function composePolaroid(photo: HTMLCanvasElement, name: string) {
  const w = photo.width;
  const h = photo.height;
  const { side, bottom, width, height } = polaroidLayout(w, h);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(photo, side, side);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = Math.max(1, w / 1000);
  ctx.strokeRect(side, side, w, h);

  let fontSize = Math.round(bottom * 0.45);
  await document.fonts.load(`${fontSize}px ${FONT_FAMILY}`);
  const text = caption(name);
  const maxWidth = w * 0.92;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  while (fontSize > 10 && ctx.measureText(text).width > maxWidth) {
    fontSize -= 2;
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  }
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, out.width / 2, side + h + bottom / 2);

  return new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode the snapshot'))), 'image/png'),
  );
}

const DEVELOP_MS = 2500;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function setupSnapshotUI(deps: SnapshotDeps) {
  const button = document.querySelector<HTMLButtonElement>('#capture-btn')!;
  const nameDialog = document.querySelector<HTMLDialogElement>('#name-dialog')!;
  const nameInput = document.querySelector<HTMLInputElement>('#name-input')!;
  const previewDialog = document.querySelector<HTMLDialogElement>('#preview-dialog')!;
  const previewImg = document.querySelector<HTMLImageElement>('#preview-img')!;
  const download = document.querySelector<HTMLAnchorElement>('#preview-download')!;
  const close = document.querySelector<HTMLButtonElement>('#preview-close')!;
  const frame = document.querySelector<HTMLDivElement>('#preview-frame')!;
  const copy = document.querySelector<HTMLButtonElement>('#preview-copy')!;
  const nameError = document.querySelector<HTMLParagraphElement>('#name-error')!;
  let url: string | null = null;
  let blob: Blob | null = null;
  let frozen: HTMLCanvasElement | null = null;

  // copying images needs the async Clipboard API (secure context: https or localhost)
  copy.hidden = !('ClipboardItem' in window && navigator.clipboard?.write);

  button.addEventListener('click', () => {
    // the photo is the frame visible at the moment of the click, not after typing the name
    frozen = grabFrame(deps);
    nameDialog.returnValue = '';
    validateName();
    nameDialog.showModal();
    nameInput.select();
  });

  /** trimmed name must not be empty nor contain offensive words (see bannedNames.ts) */
  function validateName() {
    const name = nameInput.value.trim();
    const banned = name !== '' && !isNameAllowed(name);
    const message = banned ? "This name isn't allowed. Please choose another one." : name ? '' : 'Please enter your name';
    nameInput.setCustomValidity(message);
    nameInput.setAttribute('aria-invalid', String(banned));
    nameError.textContent = banned ? message : '';
    nameError.hidden = !banned;
  }
  nameInput.addEventListener('input', validateName);
  document.querySelector('#name-cancel')!.addEventListener('click', () => nameDialog.close('cancel'));

  nameDialog.addEventListener('close', async () => {
    const name = nameInput.value.trim();
    const photo = frozen;
    frozen = null;
    if (nameDialog.returnValue !== 'ok' || !name || !isNameAllowed(name) || !photo) return;
    button.disabled = true;
    try {
      // 1) open the preview right away with an empty polaroid of the final size; opening the
      //    dialog plays the camera flash on its ::backdrop (see style.css)
      const { width, height } = polaroidLayout(photo.width, photo.height);
      frame.style.aspectRatio = `${width} / ${height}`;
      frame.style.setProperty('--polaroid-ratio', String(width / height));
      previewImg.style.opacity = '0';
      previewDialog.classList.add('is-pending');
      previewDialog.showModal();

      // 2) compose the frame frozen at click time with the caption
      blob = await composePolaroid(photo, name);
      if (!previewDialog.open) return;

      // 3) instant film "developing": the photo fades in inside the white frame
      url = URL.createObjectURL(blob);
      previewImg.src = url;
      download.href = url;
      download.download = `${slugify(name)}-cloud.png`;
      await previewImg.decode();
      previewDialog.classList.remove('is-pending');
      previewImg.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: reducedMotion() ? 0 : DEVELOP_MS,
        easing: 'ease-out',
        fill: 'forwards',
      });
    } finally {
      button.disabled = false;
    }
  });

  let copyReset = 0;
  copy.addEventListener('click', async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      copy.textContent = 'Copied!';
    } catch {
      copy.textContent = 'Copy failed';
    }
    clearTimeout(copyReset);
    copyReset = window.setTimeout(() => (copy.textContent = 'Copy'), 2000);
  });

  close.addEventListener('click', () => previewDialog.close());
  previewDialog.addEventListener('close', () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
    blob = null;
    clearTimeout(copyReset);
    copy.textContent = 'Copy';
    previewImg.removeAttribute('src');
    previewImg.getAnimations().forEach((a) => a.cancel());
    download.removeAttribute('href');
  });
}
