"use strict";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => cb.start());
} else {
  cb.start();
}
