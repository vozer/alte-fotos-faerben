import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows update identity", () => {
  it("keeps the existing install identity and user-data cache while advancing the version", async () => {
    const pkg = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.version).toBe("0.2.3");
    expect(pkg.build).toMatchObject({
      appId: "de.private.altfotosfaerben",
      productName: "Alte Fotos färben",
      win: { target: [{ target: "nsis", arch: ["x64"] }] },
      nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: false,
        deleteAppDataOnUninstall: false,
      },
    });
  });

  it("uses an ASCII Mac helper name while retaining its German display name", async () => {
    const pkg = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["package:mac"]).toContain("-c.productName='Alte Fotos faerben'");
    expect(pkg.build.mac).toMatchObject({ identity: null, extendInfo: { CFBundleDisplayName: "Alte Fotos färben" } });
  });
});
