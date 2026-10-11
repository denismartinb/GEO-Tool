import { GscLoading } from "./_components/gsc-loading";

/** Shown while Google answers (log §289). Data is cached afterwards, so this mostly appears on the first visit. */
export default function SearchConsoleLoading() {
  return (
    <div className="page">
      <div className="gsc-page">
        <div className="gsc-screen">
          <GscLoading />
        </div>
      </div>
    </div>
  );
}
