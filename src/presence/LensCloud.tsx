import React from "react";
import "../styles/lens-cloud.css";

/** The Lens orb's billowing rainbow nebula (src/styles/lens-cloud.css). Fills its parent circle. */
export function LensCloud() {
  return (
    <span className="lens-cloud" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
