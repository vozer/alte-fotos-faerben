import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, isModelId, MODEL_CATALOG } from "../src/shared/model";

describe("available color models", () => {
  it("offers only the two requested pinned models", () => {
    expect(Object.keys(MODEL_CATALOG)).toEqual(["deoldify-stable", "ddcolor-tiny"]);
    expect(MODEL_CATALOG["deoldify-stable"]).toMatchObject({
      fileName: "deoldify_stable.onnx",
      bytes: 873_362_263,
      sha256: "37fc9f524f5a6ad13bc4379e3a929829a13fe1015203dcb10f9bfb9a38377cd1",
    });
    expect(MODEL_CATALOG["ddcolor-tiny"]).toMatchObject({
      fileName: "ddcolor_tiny.onnx",
      bytes: 222_200_930,
      sha256: "bc441aba000b9de6a36e0b71ea35924aed344d92e6865b22fa1e62efbe72d0ce",
    });
  });

  it("rejects model IDs outside the pinned catalog", () => {
    expect(DEFAULT_MODEL_ID).toBe("deoldify-stable");
    expect(isModelId("ddcolor-tiny")).toBe(true);
    expect(isModelId("deoldify-stable")).toBe(true);
    expect(isModelId("../../other-model.onnx")).toBe(false);
  });
});
