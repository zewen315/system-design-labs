import { useRef, useState } from "react";
import { getTweetImageUploadUrl, uploadToPresignedUrl } from "../api/client";
import { resizeImage } from "../utils/resizeImage";
import { ImageIcon } from "./icons";

export default function ComposeBox({ placeholder = "What's happening?", buttonLabel = "Tweet", onSubmit }) {
  const [content, setContent] = useState("");
  const [imageBlob, setImageBlob] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setImageProcessing(true);
    try {
      const blob = await resizeImage(file);
      setImageBlob(blob);
      setImagePreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err.message);
    } finally {
      setImageProcessing(false);
    }
  }

  function removeImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageBlob(null);
    setImagePreviewUrl(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim() || pending || imageProcessing) return;
    setPending(true);
    setError(null);
    try {
      let imageUrl;
      if (imageBlob) {
        const { upload_url, image_url } = await getTweetImageUploadUrl(imageBlob.type);
        await uploadToPresignedUrl(upload_url, imageBlob);
        imageUrl = image_url;
      }
      await onSubmit(content.trim(), imageUrl);
      setContent("");
      removeImage();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="compose-box" onSubmit={handleSubmit}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        maxLength={280}
        rows={3}
      />

      {imagePreviewUrl && (
        <div className="compose-box__image-preview">
          <img src={imagePreviewUrl} alt="" />
          <button type="button" className="compose-box__image-remove" onClick={removeImage}>
            ×
          </button>
        </div>
      )}

      <div className="compose-box__footer">
        <button
          type="button"
          className="compose-box__image-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={imageProcessing || Boolean(imageBlob)}
        >
          <ImageIcon className="compose-box__image-icon" />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />

        <span className="compose-box__count">{content.length}/280</span>
        <button type="submit" disabled={pending || imageProcessing || !content.trim()}>
          {pending ? "Posting..." : buttonLabel}
        </button>
      </div>
      {error && <p className="compose-box__error">{error}</p>}
    </form>
  );
}
