import { Icon } from "@/components/ui/icon";

/**
 * Abstract gradient cover "image" for a blog post — reuses the same aurora/
 * blob decoration already on the landing hero (app/globals.css's
 * .onb-aurora) instead of stock photography (licensing risk, and nothing on
 * hand matches the brand). Same visual system, just contained to a fixed
 * height box.
 */
export function BlogCover({ icon, compact = false }: { icon: string; compact?: boolean }) {
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
