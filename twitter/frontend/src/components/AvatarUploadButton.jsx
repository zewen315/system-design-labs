import { useRef, useState } from "react";
import { getAvatarUploadUrl, uploadToPresignedUrl } from "../api/client";
import { resizeImage } from "../utils/resizeImage";
import { ImageIcon } from "./icons";

export default function AvatarUploadButton({ onUploaded, onError, className = "avatar-upload-button" }) {
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPending(true);
    try {
      const blob = await resizeImage(file);
      const { upload_url, image_url } = await getAvatarUploadUrl(blob.type);
      await uploadToPresignedUrl(upload_url, blob);
      onUploaded(image_url);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => fileInputRef.current?.click()}
        disabled={pending}
      >
        <ImageIcon className="avatar-upload-button__icon" />
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
    </>
  );
}
