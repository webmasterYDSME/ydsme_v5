"use client";

/* Blob and canvas previews cannot be served through the Next.js image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { type Ref, useImperativeHandle, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ImagePlus, RotateCcw } from "lucide-react";
import { createUploadIntent } from "@/lib/actions/uploads";
import type { Database } from "@/lib/supabase/database";

const OUTPUT_WIDTH = 1800;
const OUTPUT_HEIGHT = 1200;
const MAXIMUM_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

type Dimensions = { width: number; height: number };
type DragState = { pointerId: number; x: number; y: number; focalX: number; focalY: number };
type MessageKind = "error" | "status" | "warning";
export type EventImageUploadHandle = { prepare: () => Promise<string> };
type EventPreview = { name: string; description: string; date: string; endDate: string; startTime: string; endTime: string; audience: string; booking: string };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function cropLayout(dimensions: Dimensions, zoom: number) {
  const sourceRatio = dimensions.width / dimensions.height;
  const targetRatio = OUTPUT_WIDTH / OUTPUT_HEIGHT;
  const baseWidth = sourceRatio >= targetRatio ? sourceRatio / targetRatio * 100 : 100;
  const baseHeight = sourceRatio >= targetRatio ? 100 : targetRatio / sourceRatio * 100;
  const width = baseWidth * zoom;
  const height = baseHeight * zoom;
  return { width, height, overflowX: Math.max(0, width - 100), overflowY: Math.max(0, height - 100) };
}

function drawCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, zoom: number, focalX: number, focalY: number) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image editing is not available in this browser.");
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight) * zoom;
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = -(width - canvas.width) * focalX / 100;
  const y = -(height - canvas.height) * focalY / 100;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, x, y, width, height);
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The cropped image could not be prepared.")), "image/webp", .9);
  });
}

function safeFileName(name: string) {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${stem || "event"}-card.webp`;
}

export function EventImageUploadField({
  label,
  initialEventName = "",
  currentImage,
  ref,
  preview,
  onSelectionChange,
}: {
  label: string;
  initialEventName?: string;
  currentImage?: string;
  ref?: Ref<EventImageUploadHandle>;
  preview: EventPreview;
  onSelectionChange?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cropRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sourceUrlRef = useRef("");
  const selectionRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [zoom, setZoom] = useState(1);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [path, setPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>("status");
  const eventName = preview.name || initialEventName;
  const [copied, setCopied] = useState(false);

  const layout = dimensions ? cropLayout(dimensions, zoom) : null;
  const warnings = useMemo(() => {
    if (!dimensions) return [];
    const messages: string[] = [];
    const ratio = dimensions.width / dimensions.height;
    if (ratio < 1.35 || ratio > 1.65) messages.push(`This image is ${ratio.toFixed(2)}:1, so a noticeable crop is required.`);
    if (dimensions.width < 1500 || dimensions.height < 1000) messages.push("This image may appear soft on larger screens; 1500 × 1000px or larger is preferable.");
    return messages;
  }, [dimensions]);

  const aiPrompt = useMemo(() => `Create a polished photographic event banner for York City & District Society of Model Engineers in York, England. Landscape 3:2 composition, 1800 × 1200 pixels or larger.

Include this exact event title as clearly readable text within the image: “${eventName.trim() || "[event name]"}”. Use bold, simple typography with strong contrast against an uncluttered background. Keep the title prominent and check the spelling. Do not add invented dates, times, prices or other event details.

Include the club’s official logo in every image, using the logo file I have attached as the reference. Preserve its design, wording, colours and proportions; do not redraw, reinterpret, distort or replace it with a generic railway logo. If no logo reference is attached, ask me to upload it before generating the image. Place the logo clearly beside or above the title, with comfortable space around it.

Design for responsive website crops on desktop, tablet and mobile: keep the complete title, the complete logo and the main subject inside the central 50% of the frame width and central 60% of its height. Leave comfortable space around the subject, with generous uncluttered scenery on every side that can be cropped away. Do not put text or the logo in corners or near the edges. Make the title and logo readable even as a small mobile card.

Use a natural miniature railway scene, realistic model engineering proportions, attractive natural light and a restrained colour palette. Balance the scene with the title and official logo without covering important details. Avoid close-up framing, collages, decorative borders, additional logos and watermarks.`, [eventName]);


  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  useEffect(() => {
    if (!sourceUrl || !dimensions || !imageRef.current) {
      setPreviewUrl("");
      return;
    }
    const image = imageRef.current;
    const timer = window.setTimeout(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 600;
      drawCrop(canvas, image, zoom, focalX, focalY);
      setPreviewUrl(canvas.toDataURL("image/webp", .78));
    }, 60);
    return () => window.clearTimeout(timer);
  }, [sourceUrl, dimensions, zoom, focalX, focalY]);

  function clearPreparedUpload(text = "The updated crop will be uploaded when you save.") {
    if (!path) return;
    setPath("");
    setMessageKind("warning");
    setMessage(text);
  }

  function resetSelection() {
    onSelectionChange?.();
    selectionRef.current += 1;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = "";
    imageRef.current = null;
    setSourceUrl("");
    setSourceName("");
    setDimensions(null);
    setPreviewUrl("");
    setZoom(1);
    setFocalX(50);
    setFocalY(50);
    setPath("");
    setMessage("");
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    onSelectionChange?.();
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAXIMUM_FILE_SIZE) {
      resetSelection();
      setMessageKind("error");
      setMessage("Choose a JPEG, PNG, WebP or AVIF image no larger than 8MB.");
      return;
    }
    const selection = selectionRef.current + 1;
    selectionRef.current = selection;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;
    imageRef.current = null;
    setPath("");
    setMessageKind("status");
    setMessage("Preparing the preview…");
    setSourceName(file.name);
    setSourceUrl(url);
    setDimensions(null);
    setPreviewUrl("");
    setZoom(1);
    setFocalX(50);
    setFocalY(50);
    const image = new window.Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      if (selectionRef.current === selection) {
        resetSelection();
        setMessageKind("error");
        setMessage("That image could not be read. Please choose another file.");
      }
      return;
    }
    if (selectionRef.current !== selection) return;
    imageRef.current = image;
    onSelectionChange?.();
    setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    setMessage("");
  }

  function resetCrop() {
    clearPreparedUpload();
    setZoom(1);
    setFocalX(50);
    setFocalY(50);
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!layout) return;
    cropRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, focalX, focalY };
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const frame = cropRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !frame || !layout) return;
    const bounds = frame.getBoundingClientRect();
    const deltaX = (event.clientX - drag.x) / bounds.width * 100;
    const deltaY = (event.clientY - drag.y) / bounds.height * 100;
    clearPreparedUpload();
    if (layout.overflowX) setFocalX(clamp(drag.focalX - deltaX * 100 / layout.overflowX, 0, 100));
    if (layout.overflowY) setFocalY(clamp(drag.focalY - deltaY * 100 / layout.overflowY, 0, 100));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (cropRef.current?.hasPointerCapture(event.pointerId)) cropRef.current.releasePointerCapture(event.pointerId);
  }

  async function confirmImage() {
    const image = imageRef.current;
    if (!sourceUrl) {
      if (currentImage) return "";
      setMessageKind("error");
      setMessage("Add an event image before saving.");
      rootRef.current?.closest("details")?.setAttribute("open", "");
      inputRef.current?.focus();
      throw new Error("Add an event image before saving.");
    }
    if (!image) throw new Error("Please wait for the image preview to finish loading.");
    setUploading(true);
    setPath("");
    setMessageKind("status");
    setMessage("Preparing the 1800 × 1200px image…");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      drawCrop(canvas, image, zoom, focalX, focalY);
      const blob = await canvasBlob(canvas);
      const file = new File([blob], safeFileName(sourceName), { type: "image/webp" });
      const intent = await createUploadIntent({ kind: "event-image", name: file.name, size: file.size, type: file.type });
      if (!intent.ok) throw new Error(intent.error);
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Storage is not configured.");
      setMessage("Uploading the reviewed image securely…");
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient<Database>(url, key, { auth: { persistSession: false } });
      const { error } = await client.storage.from(intent.bucket).uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (error) throw new Error("Upload failed. Please try saving again.");
      setPath(intent.path);
      setMessageKind("status");
      setMessage("Image uploaded. Saving the event…");
      return intent.path;
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "The image could not be prepared.");
      throw error;
    } finally {
      setUploading(false);
    }
  }

  useImperativeHandle(ref, () => ({ prepare: confirmImage }));

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return <div className="event-image-upload wide" ref={rootRef}>
    <div className="event-image-upload-heading">
      <div><span>Event artwork</span><strong>{label}</strong></div>
      <ImagePlus aria-hidden="true"/>
    </div>
    <label className="event-image-file">
      Choose image
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} onChange={(event) => void chooseFile(event.target.files?.[0])}/>
    </label>
    <input type="hidden" name="quarantine_path" value={path}/>
    <p className="event-image-guidance">Required: a landscape image, ideally 1800 × 1200px or larger. Keep the subject centred with space around it for different screen sizes. Maximum 8MB. Your image uploads when you save.</p>

    {sourceUrl && dimensions && layout ? <div className="event-image-studio">
      <details className="event-image-editor"><summary>Adjust crop</summary>
        <div className="event-image-section-heading"><div><span>1 · Adjust</span><h3>Crop and position</h3></div><button type="button" onClick={resetCrop}><RotateCcw/>Reset</button></div>
        <p>Drag the image or use the controls. Keep important details inside the dashed safe area.</p>
        <div
          className="event-image-crop"
          ref={cropRef}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            src={sourceUrl}
            alt="Selected event crop"
            draggable="false"
            style={{ width: `${layout.width}%`, height: `${layout.height}%`, left: `${-layout.overflowX * focalX / 100}%`, top: `${-layout.overflowY * focalY / 100}%` }}
          />
          <span className="event-image-safe-area">Keep important details inside this area</span>
        </div>
        <div className="event-image-controls">
          <label>Zoom <input type="range" min="1" max="2" step="0.01" value={zoom} onChange={(event) => { clearPreparedUpload(); setZoom(Number(event.currentTarget.value)); }}/><output>{Math.round(zoom * 100)}%</output></label>
          <label>Horizontal position <input type="range" min="0" max="100" value={focalX} disabled={!layout.overflowX} onChange={(event) => { clearPreparedUpload(); setFocalX(Number(event.currentTarget.value)); }}/></label>
          <label>Vertical position <input type="range" min="0" max="100" value={focalY} disabled={!layout.overflowY} onChange={(event) => { clearPreparedUpload(); setFocalY(Number(event.currentTarget.value)); }}/></label>
        </div>
      </details>

      <section className="event-image-preview-panel" aria-label="Event card preview">
        <div className="event-image-section-heading"><div><span>2 · Review</span><h3>Card preview</h3></div><div className="event-image-preview-tabs" aria-label="Preview size"><button type="button" aria-pressed={previewMode === "desktop"} onClick={() => setPreviewMode("desktop")}>Desktop</button><button type="button" aria-pressed={previewMode === "mobile"} onClick={() => setPreviewMode("mobile")}>Mobile</button></div></div>
        <p>This uses the same centre-crop behaviour as the public event card.</p>
        <article className={`event-image-card-preview is-${previewMode}`}>
          <div className="event-image-card-media">{previewUrl ? <img src={previewUrl} alt=""/> : null}</div>
          <div className="event-image-card-copy"><span>{preview.audience === "public" ? "Public event" : "Members only"}</span><small>{preview.date || "Choose a date"}{preview.endDate && preview.endDate !== preview.date ? ` – ${preview.endDate}` : ""} · {preview.startTime || "Start time"}{preview.endTime ? `–${preview.endTime}` : ""}</small><h4>{eventName.trim() || "Your event name"}</h4><p>{preview.description || "Add your event description."}</p><b>{preview.audience === "member_only" ? "Explore membership →" : preview.booking === "website" ? "Book your visit →" : "No booking needed"}</b></div>
        </article>
        <p className="event-image-dimensions">Original: {dimensions.width} × {dimensions.height}px · Output: {OUTPUT_WIDTH} × {OUTPUT_HEIGHT}px WebP</p>
        {warnings.length ? <ul className="event-image-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="event-image-quality"><Check/>The image proportions and resolution are suitable.</p>}
      </section>

      <div className="event-image-actions"><button type="button" className="button outline" disabled={uploading} onClick={resetSelection}>Discard selected image</button></div>
    </div> : currentImage ? <div className="event-image-current"><div><span>Current image</span><small>Select a replacement to open the crop and preview tools.</small></div><img src={currentImage} alt="Current event artwork"/></div> : null}

    {message ? <p className={`event-image-message is-${messageKind}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p> : null}

    <details className="event-image-ai-help">
      <summary>Need help creating an image?</summary>
      <p>Download the club logo and attach it to your image generator, then copy this prompt. The prompt includes your event title and asks for the official logo in the artwork. Check the title, logo and crop before uploading the result.</p>
      <a className="button outline" href="/ydsme-logo.png" download="york-model-engineers-logo.png">Download club logo</a>
      <textarea readOnly value={aiPrompt} rows={7} aria-label="AI image generator prompt"/>
      <button type="button" onClick={() => void copyPrompt()}>{copied ? <Check/> : <Copy/>}{copied ? "Prompt copied" : "Copy AI prompt"}</button>
    </details>
  </div>;
}
