import Image from "next/image";
import { Icon } from "@/components/ui/icon";

/**
 * Blog post cover. When `image` is set (a founder-provided illustration
 * under public/blog/<slug>/cover.png), renders that; otherwise falls back to
 * an abstract gradient (reusing the landing hero's .onb-aurora decoration)
 * with a centered icon — no stock photography either way.
 */
export function BlogCover({
  icon,
  image,
  alt,
  compact = false
}: {
  icon: string;
  image?: string;
  alt?: string;
  compact?: boolean;
}) {
  if (image) {
    return (
      <div className={`blog-cover blog-cover-image ${compact ? "blog-cover-compact" : ""}`}>
        <Image src={image} alt={alt ?? ""} fill sizes="(max-width: 760px) 100vw, 760px" style={{ objectFit: "cover" }} priority={!compact} />
      </div>
    );
  }

  return (
    <div className={`blog-cover ${compact ? "blog-cover-compact" : ""}`}>
      <div className="onb-aurora">
        <div className="ring" />
        <div className="ring r2" />
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>
      <div className="blog-cover-icon">
        <Icon name={icon} size={compact ? 28 : 44} />
      </div>
    </div>
  );
}
