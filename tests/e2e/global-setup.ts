import fs from "node:fs";

export default function globalSetup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`./data/e2e.db${suffix}`, { force: true });
  }
}
